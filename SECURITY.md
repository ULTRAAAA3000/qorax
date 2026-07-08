# Qorax — Security Policy

Єдина політика безпеки платформи. Кожна нова таблиця/ендпоінт з
`MODULE_ROADMAP.md` звіряється з цим документом — RLS-політика і
перевірка доступу пишуться за наведеним тут шаблоном, не
винаходяться заново для кожного модуля.

---

## 1. Authentication

- **Supabase Auth** — єдиний провайдер автентифікації, вже в
  продакшні (`profiles` 1:1 з `auth.users`)
- Email/Password — базовий метод, вже працює
- OAuth, Magic Link, MFA — не підтверджено в наявному коді як уже
  реалізовані; якщо потрібні, це розширення Supabase Auth
  конфігурації (вмикається на рівні Supabase Dashboard), не нова
  архітектура з нуля — TODO звірити з поточними Supabase Auth
  налаштуваннями проєкту `hfyetlipxjqogbpntoif` перед тим, як
  документувати їх як "наявні"

---

## 2. Authorization: ролі

**Факт коду** (`member_role` enum, міграції `0001` і `0033`):
```
owner   — власник організації (один на організацію, повний доступ)
admin   — додатковий власник (сайти, тимейти, білінг)
editor  — керує сайтами, не бачить білінг і не запрошує людей
viewer  — тільки перегляд
member  — застаріле значення, нові запрошення його не використовують
```
**Важливо:** це відрізняється від запропонованої в чернетці
п'ятирівневої моделі `Owner/Admin/Manager/Editor/Viewer` — ролі
`Manager` в системі НЕМАЄ і додавати її без конкретної потреби не
варто (кожна нова роль — це нова гілка в кожній RLS-політиці й
кожній Worker-перевірці; чотирьох ролей поки достатньо для всіх
наявних сценаріїв доступу).

Окремо існує `platform_role` (`user` | `admin`) — це РІВЕНЬ ВИЩЕ за
організацію: `platform_role = 'admin'` означає власника самого
Qorax (адмін-панель, бачить усі організації), не власника однієї
організації-клієнта. Не плутати `member_role.owner` (власник ОДНІЄЇ
організації-клієнта) з `platform_role.admin` (власник Qorax як
продукту).

### Права ролей (застосовується послідовно у всіх нових таблицях)

| Дія | owner | admin | editor | viewer |
|---|---|---|---|---|
| Читати дані організації | ✅ | ✅ | ✅ | ✅ |
| Створювати/редагувати сайти, проєкти, контент | ✅ | ✅ | ✅ | ❌ |
| Видаляти сайти, проєкти | ✅ | ✅ | ❌ | ❌ |
| Запрошувати/видаляти членів команди | ✅ | ✅ | ❌ | ❌ |
| Білінг, зміна тарифу | ✅ | ❌ | ❌ | ❌ |
| Видалити організацію | ✅ | ❌ | ❌ | ❌ |

Це узагальнений шаблон — конкретна таблиця може бути суворішою
(напр. `crm_deals` видалення може вимагати `owner`/`admin`, як зараз
зроблено для `projects_delete_own_org`), але ніколи м'якішою за цю
таблицю без явного архітектурного рішення.

---

## 3. Ownership: ієрархія володіння

Детальна схема сутностей — у `DATA_MODEL.md`. Тут — тільки правило
володіння:

```
Organization  ← корінь володіння, все інше підпорядковується їй
    ├── sites          (моніторинг чужого сайту)
    ├── projects       (Sites-конструктор, власний хостинг)
    └── (усі інші ресурси модулів — завжди через organization_id,
         прямо чи транзитивно через site_id/project_id)
```

**Немає рівня `Workspace`** (вже зафіксовано в `DATA_MODEL.md`) —
`organization_id` це і є межа ізоляції даних між клієнтами. Кожна
нова таблиця для модуля другої/третьої хвилі МАЄ мати або прямий
`organization_id`, або транзитивний шлях до нього через `site_id`/
`project_id` — таблиця без жодного шляху до `organization_id` є
архітектурною помилкою (виняток — справді глобальні довідники на
кшталt `agents`, `docs_articles`, `platform_modules`, які не належать
жодній організації за визначенням).

**Хто власник кожної сутності:**
- `organization` — сам факт існування рядка = організація "своя"
  для будь-якого користувача в `organization_members`
- `site`/`project` — успадковує `organization_id`, немає власного
  "власника"-користувача окремо від організації
- Ресурс усередині сайту/проєкту (напр. `crm_deals`,
  `agent_subscriptions`) — успадковує через `organization_id` чи
  `site_id`, так само без окремого user-level ownership, ЯКЩО
  конкретний модуль explicitly не вимагає (напр. `crm_notes.author_id`
  — це атрибут "хто написав", не ownership-межа для доступу)

---

## 4. RLS Policy: єдиний шаблон

Дві helper-функції вже існують і переюзовуються у ВСІХ політиках
(`0011_row_level_security.sql`) — нові таблиці НЕ пишуть власну
логіку перевірки членства заново:

```sql
-- чи є юзер адміном самого Qorax (бачить усі організації)
is_platform_admin() returns boolean

-- список organization_id, до яких належить поточний юзер
user_organization_ids() returns setof uuid
```

**Шаблон для будь-якої нової таблиці з прямим `organization_id`:**
```sql
alter table <new_table> enable row level security;

create policy "<table>_select_own_org" on <new_table>
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "<table>_insert_own_org" on <new_table>
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "<table>_update_own_org" on <new_table>
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "<table>_delete_own_org" on <new_table>
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
```
(Точний перелік ролей у `insert`/`update`/`delete` — звірити з
таблицею прав у розділі 2 для конкретної сутності; наведене вище —
типовий випадок "editor може редагувати, не може видаляти".)

**Для таблиць БЕЗ прямого `organization_id`** (тільки `site_id` чи
`project_id`) — політика йде транзитивно:
```sql
create policy "<table>_select_own_org" on <new_table>
  for select using (
    site_id in (
      select id from sites where organization_id in (select user_organization_ids())
    ) or is_platform_admin()
  );
```

**RLS, яку читає будь-хто авторизований (довідники):**
`platform_modules` вже має такий патерн
(`platform_modules_select_all`, `using (auth.role() = 'authenticated'
or auth.role() = 'anon')`) — застосовується так само для майбутніх
глобальних довідників (`agents`, `docs_articles`).

---

## 5. Перевірка доступу поза Supabase client (Worker/API)

**Наявний факт:** Worker (`qorax-api`) звертається до Supabase з
service role key, який ПОВНІСТЮ ОБХОДИТЬ RLS — це очікувано і
правильно для cron-задач і серверної логіки, АЛЕ означає, що
Worker-ендпоінти, які приймають запити від клієнта напряму (не
service-to-service), повинні самі перевіряти права — RLS їх уже не
захищає.

- **`requireAdmin()`** (`worker/src/lib/adminAuth.ts`) — вже готовий
  паттерн: дістає юзера з Supabase Auth за токеном, звіряє
  `profiles.platform_role`. Використовується для адмін-панельних
  ендпоінтів (`platform_role = 'admin'`).
- **Для ендпоінтів, що діють від імені організації** (не
  платформи) — потрібен аналогічний `requireOrgAccess(request,
  organizationId, minRole)` — TODO: наразі немає єдиної
  переюзовуваної функції для цього конкретного випадку (перевірка
  "юзер належить organization_id і має роль ≥ X" на рівні Worker, а
  не RLS) — це прогалина, яку варто закрити одним helper'ом ПЕРЕД
  тим, як з'явиться перший ендпоінт другої хвилі, що приймає POST
  від клієнта і сам звертається в Supabase з service role (напр.
  `POST /api/agents/:id/subscribe` з MODULE_ROADMAP.md).
- **`supabaseHeaders()`** — вже існує для формування заголовків
  запитів до Supabase REST API з Worker, переюзовується, не
  дублюється по файлах.

### Ownership verification — уже відомий recurring-концерн
(зафіксовано і в продуктовій пам'яті): PATCH/resolve/delete
ендпоінти мають явно перевіряти, що ресурс, який змінюється,
належить organization_id запитувача — не покладатись тільки на те,
що `id` ресурсу передано в URL. Приклад помилки, якої уникати: 
`PATCH /api/sites/:id` перевіряє JWT валідний, але не перевіряє, що
`:id` належить organization юзера — це IDOR-вразливість. Правило:
кожен ендпоінт, що приймає ID ресурсу в шляху/тілі, спочатку робить
`select organization_id from <table> where id = :id`, звіряє з
organization_id юзера, і тільки потім виконує дію.

---

## 6. Робота з файлами

- **Сховище:** Supabase Storage (використовується вже для
  White Label логотипів, `0028_white_label_logo_storage.sql`)
- **Приватні/публічні файли:** приклад патерну з логотипів —
  окремий bucket з політиками на кшталт RLS вище, адаптованими під
  Storage API (`storage.objects` таблиця з власними policy)
- **Майбутні файли Qorax AI** (`ai_files` з MODULE_ROADMAP.md) —
  завжди приватні (документи клієнта), НІКОЛИ публічний bucket без
  явного проектного рішення
- **Зображення товарів Commerce** — потребують публічного доступу
  (показуються на вітрині), інший bucket/policy ніж приватні
  документи — не змішувати в одному bucket з різною видимістю
- **Резервні копії** — не описано в наявному коді; якщо потрібні,
  це відповідальність Supabase-плану (point-in-time recovery), не
  окрема функціональність Qorax

---

## 7. API Security

- **Rate Limit:** `worker/src/lib/rateLimit.ts` вже реалізовано —
  простий rate limiting по IP через Cloudflare KV (`checkRateLimit`,
  `getClientIp`). Уже застосовується до публічних ендпоінтів
  (`/api/audit`, `/api/status/:slug` — зафіксовано в продуктовій
  пам'яті). Кожен новий публічний (без автентифікації) ендпоінт
  ОБОВ'ЯЗКОВО проходить через цей самий helper — особливо critical
  для майбутнього `POST /api/cro/track` (CRO-снипет, MODULE_ROADMAP.md)
  який за задумом є найгарячішим ендпоінтом з усіх.
- **JWT** — Supabase Auth видає JWT, Worker перевіряє через
  `/auth/v1/user` (як у `requireAdmin()`)
- **API Keys** — для майбутнього публічного Qorax API (згадано в
  PRODUCT_VISION.md як довгострокова ідея) — не реалізовано зараз,
  окрема майбутня система видачі/ревокації ключів, не existing
  функціонал
- **CORS** — `worker/src/lib/cors.ts` вже є як спільний helper,
  переюзовується для всіх нових ендпоінтів, не дублюється
- **CSRF** — API стейтлесс на JWT (Bearer token, не cookie-сесії) —
  CSRF в класичному вигляді не застосовний до цієї архітектури, поки
  автентифікація лишається через Authorization header, а не cookie

---

## 8. Audit Logs

**Наявний частковий факт:** `agent_action_log` (MODULE_ROADMAP.md,
Qorax AI) вже покриває дії AI-агентів. Для решти подій (вхід,
видалення, зміна ролей, платежі) — **окремої зведеної
audit-log таблиці зараз немає** в наявній схемі. Це прогалина:

| Подія | Де технічно зараз простежується | Чи достатньо |
|---|---|---|
| Вхід | Supabase Auth logs (поза нашою БД) | Частково — не видно в UI Qorax |
| Видалення ресурсу | Немає окремого логу, тільки `on delete cascade` | Недостатньо для розслідування інцидентів |
| Зміна ролей | `organization_members` перезаписується, історія не зберігається | Недостатньо |
| Платежі | LemonSqueezy dashboard (зовнішній) + `subscriptions` таблиця (тільки поточний стан) | Частково |

**Рекомендація (не зроблено, TODO):** окрема таблиця
`security_audit_log` (organization_id, actor_user_id, action_type,
target_table, target_id, metadata jsonb, created_at) — service-role
only insert (Worker пише, ніхто інший), select обмежений
owner/admin своєї організації + platform admin. Пріоритет цього
TODO зростає разом із наближенням до Commerce (гроші клієнта) — до
запуску Commerce в `live` варто мати хоча б мінімальний лог платежів
і видалень замовлень.

---

## 9. Secrets

Уже усталений процес (зафіксовано в продуктовій пам'яті), тут
консолідовано як частина безпекової політики:
- **Секрети** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, Gemini API key,
  Resend API key, LemonSqueezy webhook secret) — виключно в
  Cloudflare Dashboard як Secrets, ніколи не в репозиторії
- **Змінні, що не є секретом**, але мають персистувати між деплоями
  (LemonSqueezy variant IDs) — у `wrangler.jsonc` як звичайні `vars`
- **`process.env`** читається в рантаймі OpenNext — секрети мають
  бути в Cloudflare runtime settings, не тільки build-time
- **GitHub PAT**, яким Claude пушить зміни — НЕ зберігається в
  жодному файлі репозиторію і не логується; передається окремо поза
  кодом. (Практична примітка з цієї сесії: якщо токен випадково
  потрапив у чат чи лог, його слід одразу відкликати на GitHub і
  видати новий — компрометований токен не "виправляється", тільки
  замінюється.)

---

## 10. Privacy

- **GDPR** — не формалізовано окремим процесом у коді зараз.
  Клієнти платформи — переважно україномовний/європейський ринок
  (`timezone default 'Europe/Kyiv'` в `sites`), тому це не
  абстрактна вимога на майбутнє
- **Експорт даних** — CSV-експорт уже реалізований для списку
  сайтів (продуктова пам'ять) — це частковий прецедент, повний
  "експортуй усі мої дані" (GDPR data portability) для організації
  цілком — не реалізовано
- **Видалення акаунту** — `organizations on delete cascade` технічно
  видаляє всі залежні дані каскадно вже зараз — це технічно
  відповідає "право на видалення", але немає окремого
  користувацького UI-флоу "видалити мій акаунт" з підтвердженням
  (TODO для Settings)
- **Зберігання персональних даних** — email/ім'я в `profiles`,
  контактні дані лідів у `crm_contacts` (друга хвиля) — не
  потребують окремого шифрування понад те, що вже дає Supabase
  (encryption at rest), окрім `encrypted_access_token` для
  соцмереж/GSC (уже є AES-GCM патерн, переюзовується для нових
  токен-полів — не винаходити нове шифрування для кожного модуля)

---

## Як цей документ узгоджується з іншими

- **DATA_MODEL.md** — визначає ієрархію володіння (organization →
  sites/projects); цей документ визначає, ХТО і як може читати/
  писати кожен рівень цієї ієрархії
- **MODULE_ROADMAP.md** — кожен новий модуль зобов'язаний
  реалізувати RLS за шаблоном з розділу 4 цього документа в своєму
  Кроці 1, а не придумувати власний патерн
- **PRICING.md** — доступ до фічі за тарифом (`plans.features`,
  `organization_module_access`) — це AUTHORIZATION по фічі, окремий
  рівень від ролевої authorization з розділу 2 тут; обидва рівні
  діють одночасно (юзер може мати роль `editor`, достатню для дії,
  але організація може не мати тарифного доступу до самого модуля)
