# Qorax — Data Model

Єдине джерело правди про структуру даних платформи. Будь-яка нова
міграція для модулів з `MODULE_ROADMAP.md` звіряється з цим
документом ПЕРЕД написанням `create table`, а не після.

Цей документ описує **факти поточної схеми** (звірено з
`supabase/migrations/*.sql`), а не бажану схему з нуля. Там, де
рішення відрізняється від того, що спочатку пропонувалось у
продуктовому баченні, це прямо позначено — щоб не виникло ілюзії,
що хтось "забув" книжкову ідеальну архітектуру.

---

## 1. Загальні принципи

Звірено з реальними міграціями (`0001`-`0042`), не вигадано наново:

- **UUID** — `gen_random_uuid()` як `default` для всіх `id`, скрізь
- **snake_case** — для таблиць, колонок, індексів, функцій
- **timestamps** — `created_at timestamptz not null default now()`
  скрізь; `updated_at` — тільки там, де рядок реально редагується
  після створення (не в чисто журнальних таблицях типу
  `uptime_checks`, `agent_action_log`) — і тоді обов'язково з
  тригером `set_updated_at()` (вже існує як спільна функція,
  переюзовується, не дублюється по таблицях)
- **Soft delete — НЕ використовується.** Поточна схема скрізь working
  `on delete cascade`/`on delete set null` — жорстке видалення. Якщо
  для нового модуля (напр. Commerce — замовлення) потрібна історія
  навіть після видалення батьківського запису, рішення — явний
  `status = 'archived'`/`'cancelled'` як окреме поле (як вже зроблено
  в `orders.status`, `academy_courses` через `is_active` патерн), а
  не генералізований `deleted_at` на кожній таблиці. Не додавати
  `deleted_at` "про всяк випадок" — тільки коли конкретний модуль
  цього явно потребує
- **Індекси** — мінімум одна на кожен `foreign key`, використаний у
  RLS-політиках чи частих запитах (`idx_sites_organization`,
  `idx_projects_organization` — вже патерн)
- **Enum замість вільного `text` для статусів**, де набір значень
  закритий і стабільний (`site_platform`, `project_status`,
  `module_status`, `member_role`) — ЯКЩО є ризик, що знадобляться
  нові значення в майбутньому без можливості легко видаляти старі
  (Postgres не дозволяє `DROP VALUE` з enum, тільки `ADD VALUE`, див.
  приклад `0033_extend_member_role_enum.sql`), краще одразу
  звичайний `text` з коментарем, які значення очікуються (так уже
  зроблено для `orders.status`, `agent_runs.status` в
  MODULE_ROADMAP.md — свідомий вибір, не недогляд)
- **RLS на кожній таблиці, яку може читати клієнт напряму** (не
  через Worker зі service role) — детальний стандарт політик
  винесено в `SECURITY.md`, тут — тільки факт, що це обов'язково

---

## 2. Ієрархія сутностей: остаточне рішення

**Питання, яке треба було закрити:** чи є рівень `Workspace` між
`Organization` і `Project`/`Site`? Чи `Project` містить кілька
`Site`, чи навпаки?

**Факт коду:** рівня `workspaces` НЕМАЄ в жодній міграції і НЕ
додається. Це свідоме рішення, не пропуск. Реальна ієрархія:

```
Organization
    ├── sites       (Audit-моніторинг — вже 35 таблиць посилаються сюди)
    └── projects    (майбутній Sites-конструктор — поки 0 залежних таблиць)
```

Обидві сутності — прямі діти `organization_id`, БЕЗ проміжного рівня.
Причина: `Workspace` як окрема сутність вирішувала б проблему, якої
зараз немає — одна організація Qorax (агентство чи бізнес) уже й так
є природною одиницею угруповання; додатковий рівень `Workspace` між
organization і site/project додав би JOIN і RLS-складність без
реальної потреби (ніхто не просив "кілька робочих просторів
всередині однієї організації"). Якщо ця потреба з'явиться пізніше
(великі агентства з кількома незалежними командами) — `Workspace`
можна вставити як новий рівень МІЖ organization і site/project без
переписування наявних таблиць (`sites.organization_id` заміниться на
`sites.workspace_id`, а `workspaces.organization_id` додасться) — це
відкладене рішення, не заблокована архітектура.

### 2.1. `sites` vs `projects` — чому це різні таблиці, а не одна

**`sites`** (міграція `0003`) — сайт КЛІЄНТА, що вже існує десь в
інтернеті і підключений на моніторинг. Qorax не створює і не хостить
цей сайт — тільки спостерігає (uptime, швидкість, SEO-аудит,
позиції). Це чому в схемі є `url` (адреса чужого сайту), але немає
`domain` в сенсі "домен, який видає сама платформа".

**`projects`** (міграція `0039`) — сутність для того, що САМА
платформа створює і хостить (майбутній Sites-конструктор). Звідси
`domain` (домен, куди буде задеплоєно), `status` (`draft` до
публікації) — категорично інша модель життєвого циклу, ніж
"моніторити чужий URL".

**Це не тимчасовий технічний борг, який треба "колись об'єднати" —
це навмисний і остаточний поділ.** Один бізнес-клієнт може мати
одночасно: `site` (моніторинг його наявного Wordpress-сайту) І
`project` (новий лендинг, який він будує в Qorax Sites-конструкторі)
— це різні речі з різним життєвим циклом, які випадково відображаються
користувачу під одним дашбордом.

**Чи може проект містити кілька сайтів?** Ні в сенсі `sites`-таблиці
— `project` не "містить" `site`. Але один `project` (Sites-конструктор)
може мати кілька опублікованих сторінок/піддоменів усередині себе
(модуль Translator — `site_languages`/`page_translations` уже
посилаються на `project_pages`, не на окремі `sites`-записи) — це
внутрішня структура одного проекту, не кілька окремих `sites`.

**Чи може сайт існувати без проекту?** Так, завжди — це поточний
стан 100% існуючих клієнтів Qorax (Audit-моніторинг без жодного
Sites-конструктора). `sites` не має і не матиме `project_id` —
немає технічної залежності одного від іншого.

**Як пов'язані CRM, Commerce, Analytics, AI та інші модулі — з
проектом чи з сайтом?**

| Модуль (з MODULE_ROADMAP.md)        | Прив'язка                          |
|--------------------------------------|-------------------------------------|
| Rank, Analytics, Audit (наявні)      | `site_id`                           |
| AI/Content (наявний)                 | `site_id`                           |
| Sites-конструктор                    | `project_id` (нова сутність)        |
| Translator                           | `site_id` + `project_page_id`       |
| Commerce                             | `project_id` (товари живуть у вітрині, яку хостить сам Qorax) |
| CRM                                   | `organization_id` + опційно `site_id` (джерело ліда) |
| Social, CRO                           | `site_id` (стосуються конкретного сайту, чужого чи власного) |
| Academy, Docs                        | жодного — глобальні для платформи   |
| Qorax AI (Chat/Agents/...)           | `organization_id` + опційно `site_id` для контекстного чату |

Правило простим реченням: **якщо модуль аналізує вже наявний в
інтернеті сайт клієнта — `site_id`. Якщо модуль створює контент чи
торгівлю, яку хостить сам Qorax, — `project_id`.** Модуль ніколи не
отримує обидва FK "про всяк випадок" — тільки той, що відповідає
його реальному способу роботи.

**Що бачить користувач в інтерфейсі:** DESIGN_SYSTEM.md уже фіксує,
що на рівні UX користувач бачить "мій проект" як єдине ціле, навіть
коли технічно дані живуть у різних таблицях. Сторінка Overview
проекту (DESIGN_SYSTEM.md) може одночасно показувати дані з `sites`
(якщо є моніторинг) і `projects` (якщо є конструктор) під одним
екраном — агрегація відбувається на рівні API/UI, не на рівні БД.

---

## 3. Основні сутності (ER, спрощено)

```
organizations
 ├── organization_members (role: owner|admin|editor|viewer)
 ├── organization_invites
 ├── organization_module_access
 ├── subscriptions ──> plans
 ├── ai_credits (1:1)
 │
 ├── sites
 │    ├── uptime_checks, speed_checks, ssl_certificates, mobile_checks
 │    ├── core_web_vitals_checks, page_seo_audits, sitemap_audits
 │    ├── broken_links, duplicate_pages, console_errors
 │    ├── competitor_sites ──> competitor_changes
 │    ├── monitored_forms ──> form_checks
 │    ├── monitored_urls ──> url_speed_checks, response_time_alerts, speed_degradation_alerts
 │    ├── rank_tracked_queries              [Rank, хвиля 1]
 │    ├── ai_content_generations, ai_generations, ai_insights  [AI/Content, хвиля 1]
 │    ├── gsc_connections ──> gsc_metrics   [Analytics, хвиля 1]
 │    ├── site_languages ──> page_translations  [Translator, хвиля 2]
 │    ├── cro_snippets ──> cro_events, cro_daily_stats, cro_ab_tests  [CRO, хвиля 2]
 │    └── social_connections ──> social_posts ──> social_post_stats  [Social, хвиля 2]
 │
 └── projects  (Sites-конструктор, хвиля 1 — поки без залежних таблиць)
      ├── project_pages                     [коли конструктор реалізовано]
      ├── products ──> product_categories, orders ──> order_items, coupons  [Commerce, хвиля 2]
      │
 (organization-рівень, не site/project)
 ├── crm_contacts ──> crm_deals ──> crm_notes, crm_reminders  [CRM, хвиля 2]
 ├── academy_courses ──> academy_lessons ──> academy_progress, academy_certificates  [Academy, хвиля 2]
 ├── docs_articles  [Docs, хвиля 2 — глобальні, не мають organization_id взагалі]
 └── agents, agent_subscriptions ──> agent_runs ──> agent_action_log,
     ai_chat_threads ──> ai_chat_messages, ai_memory, ai_files, ai_tasks  [Qorax AI, хвиля 3]
```

---

## 4. Наявні таблиці — призначення (короткий довідник)

Тут — тільки таблиці, що вже реально існують (`0001`-`0042`). Нові
таблиці кожного модуля другої/третьої хвилі детально описані у
відповідному розділі `MODULE_ROADMAP.md`, тут не дублюються.

| Таблиця | Призначення |
|---|---|
| `organizations` | Акаунт клієнта — юридична/бізнес-одиниця Qorax |
| `organization_members` | Хто має доступ до організації і з якою роллю |
| `organization_invites` | Запрошення нових членів команди |
| `profiles` | Профіль користувача (1:1 з Supabase Auth `auth.users`) |
| `plans` | Довідник тарифів (`code`, ціна, ліміти, `features` jsonb) |
| `subscriptions` | Активна підписка організації на план |
| `sites` | Сайт клієнта на моніторингу (Audit-модуль) |
| `competitor_sites` | Сайти конкурентів для порівняльного моніторингу |
| `uptime_checks`, `uptime_incidents` | Перевірки доступності і інциденти |
| `speed_checks`, `core_web_vitals_checks` | Швидкість і Core Web Vitals |
| `ssl_certificates` | Стан SSL-сертифікатів |
| `mobile_checks` | Перевірки мобільної версії |
| `page_seo_audits`, `sitemap_audits` | SEO-аудит сторінок і sitemap |
| `broken_links`, `duplicate_pages`, `console_errors` | Технічні проблеми сайту |
| `monitored_forms`, `form_checks` | Моніторинг форм на сайті клієнта |
| `monitored_urls`, `url_speed_checks`, `response_time_alerts`, `speed_degradation_alerts` | Розширений моніторинг довільних URL |
| `rank_tracked_queries` | Позиції за ключовими запитами (Rank) |
| `ai_content_generations`, `ai_generations`, `ai_insights`, `ai_credits`, `ai_usage_log` | AI/Content — генерація і облік кредитів |
| `gsc_connections`, `gsc_metrics` | Google Search Console інтеграція (Analytics) |
| `projects` | Sites-конструктор (задел, поки без залежних таблиць) |
| `platform_modules` | Реєстр модулів для sidebar (`live`/`coming_soon`/`hidden`) |
| `organization_module_access` | Точковий ранній доступ до модуля для конкретної організації |
| `alerts`, `notification_settings` | Налаштування і історія сповіщень |
| `reports` | Згенеровані звіти (PDF) |
| `domain_registrations` | Реєстрація доменів (якщо застосовно) |
| `free_audit_leads` | Ліди з безкоштовного аудиту на лендингу |
| `audit_purchases` | Разові покупки аудиту поза підпискою |
| `referral_commissions` | Реферальна програма |
| `telegram_connect_tokens` | Прив'язка Telegram для сповіщень |
| `fix_requests` | Запити клієнта на виправлення знайдених проблем |

---

## 5. JSON-поля: коли виправдано

`jsonb` використовується там, де схема свідомо гнучка й ще не
стабілізувалась, а не як заміна нормалізації:
- `plans.features` — набір фіче-флагів плану, що росте разом з
  новими модулями; нормалізована таблиця "план × модуль × ліміт"
  теж можлива (див. `PRICING.md`), але для простих boolean-флагів
  jsonb вже працює і не варто мігрувати без причини
- `projects.settings` — навмисно вільна структура, бо Sites-
  конструктор ще не спроєктовано в деталях; коли з'явиться реальна
  форма редактора, конкретні часто читані поля (напр. SEO title
  проєкту) варто винести в окремі колонки, а jsonb лишити для
  рідковживаних налаштувань
- `academy_lessons.content`, `docs_articles.content`,
  `page_translations.content` — блокова структура контенту (текст/
  відео/чек-лист), де набір типів блоків завідомо буде рости —
  нормалізація "таблиця на кожен тип блоку" створила б забагато
  JOIN-ів для того, що завжди читається одним шматком

Правило: якщо поле часто фільтрується/сортується в SQL — окрема
колонка. Якщо читається/пишеться завжди цілим блоком і структура
ще нестабільна — jsonb.

---

## 6. Naming convention

- Таблиці — множина, snake_case: `sites`, `agent_runs`
- Зв'язкові таблиці many-to-many — обидва імені через підкреслення:
  `product_category_links`
- Foreign key — `<singular_table>_id`: `site_id`, `organization_id`
- Enum типи — `<table>_<field>` або семантична назва:
  `site_platform`, `project_status`, `member_role`
- Індекси — `idx_<table>_<column>`: `idx_sites_organization`
- Тригери — `trg_<table>_<action>`: `trg_sites_updated_at`
- RLS-політики — `<table>_<action>_<scope>`:
  `projects_select_own_org`, `projects_insert_own_org`

---

## 7. Міграції: правила зміни схеми без втрати даних

- Одна пронумерована міграція = один логічний крок
  (`00NN_опис.sql`), номери йдуть строго послідовно — не
  переставляються заднім числом
- `ALTER TYPE ... ADD VALUE` — ЗАВЖДИ в окремій міграції від тієї,
  де нове значення одразу використовується (Postgres кидає "unsafe
  use of new value" інакше — див. `0033_extend_member_role_enum.sql`
  як приклад)
- Стовпці не видаляються при рефакторингу, якщо є ризик, що старий
  код (Worker, що ще не задеплоєний) на них покладається — спочатку
  новий стовпець, перехід коду, потім окрема пізніша міграція на
  видалення
- Нові таблиці для модулів з `MODULE_ROADMAP.md` завжди пишуться,
  але **застосовуються вручну Артемом** (`git pull` + Supabase
  dashboard/CLI) — це вже усталений процес, не змінюється цим
  документом
- Кожна міграція — з коментарем на початку файлу, що пояснює КОНТЕКСТ
  (навіщо), а не тільки WHAT — приклад стилю вже є в `0039` і
  `0042`, наслідувати той самий формат

---

## Як цей документ узгоджується з іншими

- **PLATFORM.md** — вже описував `sites` vs `projects` на високому
  рівні; цей документ дає повне обґрунтування рішення і таблицю
  прив'язки кожного модуля з roadmap
- **MODULE_ROADMAP.md** — кожен розділ (Translator, Commerce, CRM...)
  містить власну схему нових таблиць; цей документ не дублює їх,
  тільки показує, як вони вписуються в загальну ієрархію
- **PRICING.md** — ліміти по модулях (кількість сайтів, кредитів
  тощо) технічно реалізуються через `plans.features`/`ai_credits`/
  нові поля лімітів; структура тарифів описана там, тут — тільки
  факт існування `plans`/`subscriptions`
- **SECURITY.md** — детальні RLS-політики для кожної таблиці;
  цей документ фіксує тільки принцип ("RLS обов'язковий"), не
  конкретні policy
