# Qorax — план побудови модулів платформи

Порядок затверджений: **Rank → AI/Content → Analytics → Sites**
(від дешевого/швидкого до дорогого/ризикованого).

Кожен модуль будується за однаковим циклом, щоб не винаходити процес
заново щоразу:

```
1. Схема БД (міграція)           — тільки нові таблиці, sites/organizations не чіпаємо
2. Worker-логіка (якщо потрібна) — cron/API ендпоінти в qorax-api
3. UI-сторінка модуля            — app/dashboard/<slug>/page.tsx
4. Підключення в platform_modules — статус coming_soon → live через адмінку
5. Оновлення маркетингу          — прибрати "у розробці" для конкретного модуля
   на лендингу/features, коли він реально відповідає опису
6. CHECKOUT_DISABLED             — залишається true, поки НЕ ВСІ модулі,
   заявлені в поточному тексті лендингу, не готові (див. рішення нижче)
```

**Важливо про CHECKOUT_DISABLED:** не обов'язково чекати всі 4 модулі,
щоб увімкнути checkout знову. Можна переписати текст лендингу під те,
що реально готово на даний момент (напр. "5 модулів" замість "6", якщо
Sites ще не готовий), і увімкнути прапорець раніше. Це окреме рішення,
приймається окремо для кожного модуля, коли він добудований.

---

## 1. Rank — моніторинг позицій

**Чому дешево:** GSC вже інтегрований (`gsc_connections`, `gsc_metrics`,
міграція 0006) для Audit-модуля. GSC API реально віддає позиції сторінок
по запитах — не потрібен платний data provider (DataForSEO тощо
свідомо відкладені в product vision до Phase 3+).

### Крок 1 — Схема БД
Нова таблиця `rank_tracked_queries`:
```sql
create table rank_tracked_queries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  query text not null,
  target_url text,
  created_at timestamptz not null default now(),
  unique (site_id, query)
);
```
`gsc_metrics` вже має `query` + `position` по датах — історія позицій
вже збирається для всіх запитів автоматично, як тільки підключено GSC.
`rank_tracked_queries` — це список "обраних" запитів, які власник хоче
бачити виділеними на дашборді.

### Крок 2 — Worker-логіка
Не потрібен новий cron — `gsc_metrics` вже наповнюється існуючим GSC
sync job. Rank-модуль тільки ЧИТАЄ вже наявні дані, фільтруючи по
`rank_tracked_queries`. Потрібен один новий ендпоінт:
`POST /api/sites/:id/rank/queries` — простий CRUD.

### Крок 3 — UI
`app/dashboard/rank/page.tsx` (список сайтів з підключеним GSC) +
`app/dashboard/rank/[siteId]/page.tsx`:
- Список tracked queries з поточною позицією і трендом (графік з
  `gsc_metrics` за 30/90 днів — переюзати SVG-патерн з `SpeedHeatmap.tsx`)
- Кнопка "додати запит" — інпут + запис в `rank_tracked_queries`
- Позначка "позиція покращилась/погіршилась" тиждень до тижня

### Крок 4 — Обмеження по тарифу
Ліміт кількості tracked queries на тариф (напр. Growth = 10, Agency =
30 на сайт) — перевірка в API ендпоінт, аналогічно існуючим лімітам.

### Крок 5 — Готовність до "live"
MVP: підключення GSC (вже є) → tracked queries → графік історії
позицій. Сповіщення при різкому падінні позиції — друга ітерація,
можна переюзати Telegram/email alert pattern з uptime-алертів.

**Оцінка обсягу:** найменший модуль. 1 таблиця, 1 ендпоінт, 2 сторінки
UI, нуль нової зовнішньої інтеграції.

---

## 2. AI / Content — генерація тексту, meta, FAQ, статей

**Чому дешево:** Gemini вже інтегрований і використовується в
`worker/src/lib/aiInsights.ts` (пояснення проблем аудиту) та
`chatHandler.ts` (Qoraxus AI-чат). Це не нова інтеграція, а нові
промпти поверх існуючої інфраструктури виклику Gemini.

Product vision розділяє це на два продукти (Qorax AI і Qorax Content),
але технічно доцільно будувати їх РАЗОМ як один модуль: однакова
інфраструктура виклику AI, різниця тільки в промптах і UI.

### Крок 1 — Схема БД
```sql
create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete set null,
  kind text not null,
  prompt_input jsonb not null,
  output text not null,
  created_at timestamptz not null default now()
);

create table ai_credits (
  organization_id uuid primary key references organizations(id) on delete cascade,
  credits_remaining integer not null default 0,
  credits_reset_at timestamptz,
  updated_at timestamptz not null default now()
);
```
Кредити — окрема монетизація з product vision ("AI Credits"). Ліміт по
тарифу + можливість докупити.

### Крок 2 — Worker-логіка
Новий файл `worker/src/lib/contentGeneration.ts` — переюзовує ту саму
функцію виклику Gemini API, що і `aiInsights.ts` (той самий retry-on-503
патерн, `maxOutputTokens: 1500`), нові system-промпти під кожен `kind`.
Ендпоінти:
- `POST /api/ai/generate` — `{ kind, site_id?, input }` → списує 1
  credit, викликає Gemini, записує в `ai_generations`, повертає результат
- `GET /api/ai/history?site_id=` — історія генерацій

### Крок 3 — UI
`app/dashboard/ai/page.tsx` — форма генерації: тип контенту
(title/meta/FAQ/стаття), тема/ключові слова, кнопка "Згенерувати" →
результат з кнопкою "копіювати". Лічильник кредитів зверху.

### Крок 4 — Ліміти
`ai_credits` перевіряється перед кожним викликом. Скидання — щомісячний
cron (аналогічно trial-expiry cron).

**Статус реалізації (після першого проходу):** сама перевірка і
списання кредитів працює (worker/src/lib/contentGeneration.ts). Чого
ще нема: (1) автоматичної видачі стартових кредитів при реєстрації чи
оплаті підписки — зараз рядок в ai_credits для організації створюється
вручну; (2) щомісячного cron для скидання. Обидва — окремі, невеликі
задачі, які не блокують решту модуля і можуть бути зроблені окремим
проходом, коли буде прийнято рішення про конкретні ліміти на тариф.

### Крок 5 — Готовність до "live"
MVP: 3-4 типи генерації (title, meta description, FAQ, короткий абзац
статті). Розширення списку `kind` пізніше не потребує міграції.

**Оцінка обсягу:** середній модуль. 2 таблиці, 2 ендпоінти, 1 сторінка
UI, нуль нової зовнішньої інтеграції.

---

## 3. Analytics — єдина аналітика

**Чому середньо:** GSC вже є (клікі/покази з Audit можна переюзати
напряму). GA4 і Cloudflare Analytics — НОВІ інтеграції (OAuth + API),
на відміну від Rank, де вся інфраструктура вже готова.

### Крок 1 — Схема БД
```sql
create table ga4_connections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  property_id text not null,
  encrypted_refresh_token text not null,
  created_at timestamptz not null default now(),
  unique (site_id)
);

create table analytics_daily_snapshot (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  date date not null,
  sessions integer,
  conversions integer,
  bounce_rate numeric,
  source text not null,
  created_at timestamptz not null default now(),
  unique (site_id, date, source)
);
```
Уніфікований `analytics_daily_snapshot` замість окремих таблиць на
кожне джерело — простіше агрегувати "єдину аналітику".

### Крок 2 — Worker-логіка
- OAuth flow для GA4 (копія GSC OAuth flow з AES-GCM шифруванням —
  переюзати вже написаний `encryptToken`/`decryptToken` helper)
- Новий cron `run-analytics-sync` (щоденний, за патерном `run-seo`):
  тягне GA4 API + Cloudflare Analytics API, пише в `analytics_daily_snapshot`
- Cloudflare Analytics простіше GA4 (без OAuth, Cloudflare API token
  per-zone), але вимагає підключеного Cloudflare для сайту клієнта

### Крок 3 — UI
`app/dashboard/analytics/page.tsx` — графік сесій за 30 днів
(об'єднує джерела), конверсії, порівняння з попереднім періодом.
Переюзати SVG-графік патерн з дашборду сайту.

### Крок 4 — Ліміти
Growth+/Agency-only (product vision: "розширена аналітика, історія,
експорт" — платні фічі).

### Крок 5 — Готовність до "live"
MVP обмежується тільки GA4 (найцінніше джерело), Cloudflare Analytics —
друга ітерація.

**Оцінка обсягу:** найбільший з "дешевих" модулів через OAuth-флоу.
2-3 таблиці, OAuth + cron + 2 API-інтеграції, 1 сторінка UI.

**Статус реалізації — GA4-only MVP (окрема сесія):** Крок 5 обраний
свідомо — Cloudflare Analytics залишається другою ітерацією. Реалізовано:
- Схема (`0064_analytics_module.sql`): `ga4_connections` +
  `analytics_daily_snapshot`, RLS повторює патерн `gsc_connections`/
  `gsc_metrics` (0011_row_level_security.sql), той самий
  `user_organization_ids()`/`is_platform_admin()` guard. `analytics`
  вже був зареєстрований у `platform_modules` з 0039_platform_foundation.sql
  (sort_order 60, статус `coming_soon`) — нова реєстрація не знадобилась,
  Артем перемикає в `live` вручну через /dashboard/admin.
- Worker (`ga4Handler.ts`): OAuth flow — точна копія структури
  `gscHandler.ts` (AES-GCM шифрування, `access_type=offline&prompt=consent`).
  Одна суттєва відмінність від GSC: GA4 property не відомий заздалегідь
  (юзер може мати кілька GA4-акаунтів/властивостей), тому після
  `/api/ga4/callback` є проміжний крок — редірект на
  `/dashboard/analytics/:siteId/connect` з токеном у URL fragment (не
  query string — не потрапляє в server logs/Referer), фронт показує
  список властивостей (`accountSummaries` Admin API) для вибору, і
  тільки після вибору викликає `/api/sites/:siteId/ga4/connect`, який
  вже й зберігає зв'язок. Дані тягнуться через Data API `runReport`
  (dimensions: `date`; metrics: `sessions`, `conversions`, `bounceRate`)
  за rolling 7-денне вікно щодня (GA4-дані за останню добу можуть
  допрацьовуватись, на відміну від GSC, де досить синкати "вчора").
  Синк підключено до вже наявного нічного крону `0 3 * * *` в index.ts
  (`runGa4Sync`), а не окремого — той самий підхід, що GSC/Automations,
  щоб не вимагати від Артема заводити ще один Cloudflare Cron Trigger.
- Всі ендпоінти прив'язані до `site_id` (не `project_id`) через
  `requireOrgAccessForSite` — той самий патерн, що Rank/Audit
  (DATA_MODEL.md розділ 2.1), а не `requireOrgAccessForProject`, як у
  Commerce/Sites.
- UI: `/dashboard/analytics` (список сайтів, розділені на
  підключено/не підключено — копія `rank/page.tsx` з `ga4_connections`
  замість `gsc_connections`) → `/dashboard/analytics/:siteId`
  (`AnalyticsDetailUI.tsx`: статус підключення, Connect/Disconnect,
  проміжний UI вибору property після OAuth, SVG-графік сесій —
  копія `PositionChart` з `rank/[siteId]/RankDetailUI.tsx`, тільки
  вісь Y не інвертована).
- Що свідомо не зроблено: Cloudflare Analytics (друга ітерація за
  роадмапом); тарифний гейт Growth+/Agency (Крок 4) — ендпоінти зараз
  доступні будь-якому тарифу, гейтинг додати окремо, коли Артем вирішить
  фінальні межі тарифів для Analytics.
- Помічено, але НЕ виправлено як поза межами цієї задачі: у
  `index.ts` scheduled-хендлері (`0 3 * * *` блок) деструктуризація
  `const [speedSummary, seoSummary, competitorSummary, automationsSummary]`
  бере лише 4 змінні з 5 (тепер 6) елементів `Promise.all` — існувало
  до цієї сесії, `automationsSummary` фактично отримує результат
  `runGscSync`, а не `runDueAgentAutomations`. Впливає лише на
  `console.log`-мітку в логах, не на логіку — але варто поправити
  окремо.

---

## 4. Sites — конструктор сайтів

**Чому дорого:** єдиний модуль, що вимагає нового класу інфраструктури.
Audit/Rank/AI/Analytics всі читають/аналізують ЧУЖІ сайти. Sites —
платформа сама СТВОРЮЄ і ХОСТИТЬ контент. Принципова відмінність,
згадана в PLATFORM.md.

### Крок 1 — Схема БД
`projects` вже існує (міграція 0039), порожня. Розширення:
```sql
alter table projects add column if not exists template_id text;
alter table projects add column if not exists published_url text;

create table project_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null,
  content jsonb not null,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

create table project_templates (
  id text primary key,
  name text not null,
  preview_image_url text,
  default_pages jsonb not null
);
```

### Крок 2 — Рендеринг і хостинг (найскладніша частина)
**Варіант А — SSR через існуючий Next.js Worker.**
`app/sites/[projectSlug]/[[...path]]/page.tsx` — динамічний роут,
рендерить `project_pages.content` (JSON-блоки → React) на льоту. Плюс:
не потрібна нова інфраструктура. Мінус: власний домен клієнта вимагає
Cloudflare for SaaS (заблоковано до покупки домену, вже в roadmap).

**Варіант Б — статична генерація + окремий деплой.** Більше контролю,
більше інфраструктурної роботи. НЕ рекомендується для MVP — передчасна
оптимізація без жодного реального проєкту.

**Рекомендація: почати з варіанту А.**

### Крок 3 — Редактор (UI)
Найбільший UI-обсяг з усіх модулів:
- `app/dashboard/sites-builder/page.tsx` — список проєктів
- `app/dashboard/sites-builder/[id]/edit/page.tsx` — редактор: список
  блоків (hero, text, image, form, FAQ...), додавання/видалення/
  редагування, live preview
- Вибір шаблону при створенні нового проєкту

НЕ drag-and-drop в MVP (занадто дорого для соло-розробки) — форм-based
редагування блоків зі списку готових типів. Drag-and-drop — можлива
майбутня ітерація.

### Крок 4 — Публікація
Кнопка "Опублікувати" → `projects.status = 'published'`, генерує
`published_url` (`<slug>.qorax.app` на старті, кастомний домен — після
покупки Cloudflare-зони).

### Крок 5 — Готовність до "live"
Поріг вищий, ніж у інших модулів: мінімум 2-3 шаблони, форм-редактор,
SSR-рендеринг, публікація на піддомен. Реалістично найбільша робота з
чотирьох модулів.

**Оцінка обсягу:** найбільший модуль. 3 нові таблиці + розширення
`projects`, новий SSR-рендеринг pipeline, найбільший UI, залежність
від покупки домену для кастомних доменів.

---

## Підсумкова таблиця

| # | Модуль | Нові таблиці | Нова зовнішня інтеграція | Розмір UI | Залежності |
|---|--------|--------------|---------------------------|-----------|------------|
| 1 | Rank | 1 | Немає (GSC вже є) | Малий | — |
| 2 | AI/Content | 2 | Немає (Gemini вже є) | Малий-середній | — |
| 3 | Analytics | 2-3 | GA4 OAuth, Cloudflare Analytics | Середній | AES-GCM helper (вже є з GSC) |
| 4 | Sites | 3 + розширення projects | Немає, новий SSR pipeline | Найбільший | Покупка домену |

Кожен модуль після Кроку 5 переводиться в `live` через
`/dashboard/admin` без деплою — і тоді вирішується, чи оновлювати
маркетингову подачу/CHECKOUT_DISABLED (див. PLATFORM.md, розділ
CHECKOUT_DISABLED).

---

## Друга хвиля модулів (Phase 2)

Після завершення Rank → AI/Content → Analytics → Sites платформа
переходить від "інструментів моніторингу чужих сайтів" до "інструментів
створення і розвитку бізнесу клієнта". Порядок затверджений так:

**Translator → Commerce → CRM → Social → CRO → Academy → Docs**

(від найдешевшого до найдорожчого; Docs — окремо, бо це не платний
продукт, а супровідна інфраструктура, і будується в будь-який момент,
коли з'являється вільний час, паралельно з іншими).

---

## 5. Translator — мультимовність і SEO-адаптація

**Чому недорого:** пряме продовження Sites-конструктора (модуль 4) —
Translator має сенс тільки для проєктів, створених в Sites, або для
підключених зовнішніх сайтів через уже наявний `pages`/аудит-пайплайн.
AI-переклад переюзовує ту саму інфраструктуру Gemini, що і AI/Content
(модуль 2) — різниця тільки в промпті ("переклади й адаптуй SEO", а не
"згенеруй").

### Крок 1 — Схема БД
```sql
create table site_languages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  locale text not null,              -- 'en', 'de', 'fr'...
  is_default boolean not null default false,
  url_prefix text,                   -- '/en', '/de' (null для дефолтної мови)
  created_at timestamptz not null default now(),
  unique (site_id, locale)
);

create table page_translations (
  id uuid primary key default gen_random_uuid(),
  project_page_id uuid references project_pages(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  locale text not null,
  title text,
  description text,
  og_title text,
  og_description text,
  content jsonb,                     -- перекладені блоки (та сама структура, що project_pages.content)
  image_alt_overrides jsonb,          -- {"img_id": "перекладений alt"}
  status text not null default 'draft', -- draft | reviewed | published
  translated_by text not null default 'ai', -- ai | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_page_id, locale)
);
```
`project_page_id` — nullable і посилається на `project_pages` (з
модуля Sites), бо MVP Translator має сенс тільки для сторінок,
створених у Sites-конструкторі. Переклад довільних зовнішніх сторінок
(які не є `project_pages`) — поза MVP, вимагав би окремого сховища
контенту, якого зараз немає.

### Крок 2 — Worker-логіка
`worker/src/lib/translationGeneration.ts` — переюзовує виклик Gemini з
`contentGeneration.ts` (retry-on-503, `maxOutputTokens`), новий
system-промпт: "не дослівний переклад, а SEO-адаптація title/description
під мовний ринок". Списує AI-кредити з тієї ж таблиці `ai_credits`
(модуль 2) — окремого пулу кредитів на переклад не потрібно.
Ендпоінти:
- `POST /api/sites/:id/languages` — додати мову сайту
- `POST /api/sites/:id/translate` — `{ project_page_id, locale }` →
  генерує переклад, пише в `page_translations` зі статусом `draft`
- `PATCH /api/translations/:id` — ручне редагування перекладу,
  переставляє статус на `reviewed`
- hreflang генерується не окремим ендпоінтом, а на льоту в
  SSR-рендерингу Sites (модуль 4): список `site_languages` → `<link
  rel="alternate" hreflang="...">` в `<head>`

### Крок 3 — UI
`app/dashboard/translator/[siteId]/page.tsx`:
- Список підключених мов + кнопка "додати мову"
- Для кожної сторінки: статус перекладу по кожній мові (немає /
  чернетка / перевірено), кнопка "перекласти AI"
- Редактор перекладу — та сама форма-based структура блоків, що і в
  Sites-редакторі, тільки поверх `page_translations.content`

### Крок 4 — Обмеження по тарифу
Кількість мов на сайт обмежена тарифом (напр. Growth = 2 мови,
Agency = необмежено) — перевірка в `POST /api/sites/:id/languages`.
Преміум-моделі перекладу (кращий Gemini-режим чи вищий
`maxOutputTokens`) — друга ітерація, не MVP.

### Крок 5 — Готовність до "live"
MVP: підключення мови → AI-переклад title/description/OG → ручне
редагування → hreflang в SSR. Переклад блогу і зображень (alt) —
той самий пайплайн, просто більше `kind` в промпті, друга ітерація.

**Оцінка обсягу:** малий-середній модуль. 2 таблиці, 3 ендпоінти,
1 сторінка UI, нуль нової зовнішньої інтеграції, але жорстка
залежність від готовності Sites (модуль 4) — без `project_pages`
Translator будувати нема що перекладати.

---

## 6. Commerce — інтернет-магазини

**Чому дорого:** перший модуль з реальними грошовими операціями
клієнта (замовлення, оплата) — новий рівень відповідальності
порівняно з "показати клієнту дані про його сайт". Вимагає власного
чекауту, а не тільки LemonSqueezy-підписки на сам Qorax.

### Крок 1 — Схема БД
```sql
create table products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  price_cents integer not null,
  currency text not null default 'USD',
  sku text,
  stock_quantity integer,            -- null = необмежено (базовий облік, не повний WMS)
  image_urls jsonb,
  seo_title text,
  seo_description text,
  status text not null default 'draft', -- draft | published | archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  slug text not null,
  parent_id uuid references product_categories(id) on delete set null,
  unique (project_id, slug)
);

create table product_category_links (
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid not null references product_categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  customer_email text not null,
  customer_name text,
  status text not null default 'pending', -- pending | paid | shipped | cancelled | refunded
  total_cents integer not null,
  currency text not null default 'USD',
  payment_provider text,              -- 'lemonsqueezy' | 'stripe' (пізніше)
  payment_reference text,
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  title_snapshot text not null,       -- назва товару на момент замовлення
  price_cents_snapshot integer not null,
  quantity integer not null default 1
);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  discount_type text not null,        -- 'percent' | 'fixed'
  discount_value integer not null,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  unique (project_id, code)
);
```

### Крок 2 — Worker-логіка
- `worker/src/lib/commerceCatalog.ts` — CRUD товарів/категорій
- `worker/src/lib/commerceCheckout.ts` — створення замовлення +
  checkout-сесія. **Платіжний провайдер: LemonSqueezy**, за тим самим
  патерном, що вже працює для підписок Qorax (вебхук вже є —
  `lemonSqueezyWebhook.ts` розширюється новим типом події
  "order-created" для товарів клієнта, окремо від events підписки
  самого Qorax). Stripe — свідомо НЕ додається (вже спробували й
  відмовились через несумісність з Україною, див. tech stack).
- AI-описи товарів і мета-теги — переюзовує `contentGeneration.ts`
  (модуль 2) з новим `kind: 'product_description'`, списує ai_credits
- Ендпоінти: `GET/POST /api/projects/:id/products`,
  `GET/POST /api/projects/:id/orders`, `POST /api/checkout/commerce`,
  `POST /api/coupons/validate`
- Інтеграція зі службами доставки — окрема ітерація поза MVP (немає
  чіткого одного провайдера, як з платежами; починати з ручного вводу
  статусу доставки в `orders.status`)

### Крок 3 — UI
`app/dashboard/commerce/[projectId]/page.tsx` — список товарів,
категорій, замовлень, купонів (окремі таби). Форма товару з кнопкою
"згенерувати опис AI". Проста статистика продажів (сума за період,
топ-товари) — переюзати SVG-графік патерн.

### Крок 4 — Обмеження по тарифу
Commerce доступний тільки з певного тарифу (напр. Agency+) —
перевірка через `organization_module_access` (таблиця вже існує).
Комісія з обороту чи платні інтеграції доставки — рішення
відкладається до появи перших реальних магазинів.

### Крок 5 — Готовність до "live"
MVP: каталог + категорії + кошик + LemonSqueezy checkout + базовий
список замовлень. AI-опис товару. Складський облік — тільки лічильник
`stock_quantity`, без резервування/мультисклад.

**Оцінка обсягу:** найбільший модуль другої хвилі. 6 нових таблиць,
розширення вебхука платежів, новий checkout-флоу, найбільший UI після
Sites. Залежність від Sites (товари прив'язані до `project_id`) —
Commerce без готового сайту-вітрини не має де відображатись.

**Статус реалізації — категорії товарів (UI категорій, окрема сесія):**
`product_categories`/`product_category_links` існували в схемі з самого
початку (0061_commerce_module.sql), але не мали ні worker-ендпоінтів, ні
UI — товар не можна було віднести до категорії. Додано:
- Worker (`commerceCatalog.ts`): `GET/POST /api/projects/:id/categories`,
  `PATCH/DELETE /api/projects/:id/categories/:categoryId`,
  `GET/PUT /api/projects/:id/products/:productId/categories` (PUT приймає
  повний список `category_ids` і замінює зв'язки — простіше для UI з
  чекбоксами, ніж окремі add/remove на кожну категорію). `parent_id` і
  `category_ids` завжди звіряються з `project_id` з path — той самий
  guard, що і в решті Commerce-ендпоінтів, проти підстановки чужого id.
  Категорія не може бути власним `parent_id` (простий guard від прямого
  циклу; глибші цикли через кілька рівнів свідомо не перевіряються —
  дерево категорій дрібне і редагується вручну, не масовим імпортом).
- UI (`CommerceDashboardUI.tsx`): новий таб "Категорії" — дерево з
  відступами по глибині (`buildCategoryTree`, рекурсивний обхід по
  `parent_id`), інлайн-редагування назви, вибір батьківської категорії
  при створенні, видалення (дочірні категорії стають кореневими через
  `on delete set null` у схемі, не видаляються каскадно). У табі
  "Товари" — кнопка на картці товару розкриває пікер категорій
  (чекбокси по тому ж дереву), зберігається одразу при кліку через
  PUT-ендпоінт вище.
- Що свідомо не зроблено на цій ітерації: перевірка глибших циклів у
  дереві категорій; масове призначення категорій кільком товарам одразу
  (тільки по одному товару за раз через картку).

---

## 7. CRM — ліди й клієнти

**Чому середньо-дешево:** `monitored_forms`/`form_checks` вже існують
(перевірка форм на сайтах клієнтів), і Sites-модуль вже матиме форми
на сторінках клієнтів (block-тип "форма" в конструкторі). CRM просто
дає місце, куди ці заявки потрапляють і де ними керують — не нова
зовнішня інтеграція, а нова таблиця + UI поверх вже наявних сповіщень
(Telegram/email вже написані для алертів, той самий helper переюзовується).

### Крок 1 — Схема БД
```sql
create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text,
  email text,
  phone text,
  source text,                       -- 'site_form' | 'manual' | 'import'
  site_id uuid references sites(id) on delete set null,
  created_at timestamptz not null default now()
);

create table crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  title text not null,
  stage text not null default 'new', -- new | contacted | qualified | won | lost
  value_cents integer,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table crm_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now()
);

create table crm_reminders (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  remind_at timestamptz not null,
  message text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
```
`crm_notes`: перевірка на рівні застосунку (не CHECK-constraint), що
рівно одне з `deal_id`/`contact_id` заповнено — заміток може бути і
по угоді, і по контакту напряму.

### Крок 2 — Worker-логіка
- Хук на прийом форми з Sites (модуль 4): при новому записі в
  `monitored_forms`/сабміті форми на клієнтському сайті — авто-створення
  `crm_contacts` + `crm_deals` (stage='new'), якщо форма позначена як
  "лід-форма" в редакторі
- Сповіщення про нову заявку — переюзати `dispatchAlert()`/Telegram/
  email helper (вже написані для uptime-алертів)
- Нагадування (`crm_reminders`) — новий легкий cron `run-crm-reminders`
  (щогодинний), надсилає сповіщення коли `remind_at` настав і
  `is_done = false`
- Ендпоінти: CRUD на `crm_contacts`/`crm_deals`/`crm_notes`/
  `crm_reminders`, `PATCH /api/crm/deals/:id/stage` (переміщення по
  воронці)

### Крок 3 — UI
`app/dashboard/crm/page.tsx` — канбан-дошка воронки продажів (стовпці
= stages, картки = deals, drag між стовпцями — тут доречно, на відміну
від Sites-редактора, бо об'єктів мало і логіка проста).
`app/dashboard/crm/contacts/page.tsx` — список контактів з пошуком і
фільтрами (переюзати search/sort патерн з sites list).
Картка угоди/контакту — історія заміток, нагадування, статус.

### Крок 4 — Обмеження по тарифу
Ліміт кількості контактів на тариф (напр. Growth = 200, Agency =
необмежено). Додаткові користувачі з доступом лише до CRM — окрема
роль, друга ітерація (MVP: CRM бачать усі члени організації з наявним
рівнем доступу, без гранулярного розмежування).

### Крок 5 — Готовність до "live"
MVP: контакти + угоди + канбан-воронка + нотатки + Telegram/email
сповіщення про нову заявку з форми сайту. Нагадування — можна в тому
ж проході, легкий cron.

**Оцінка обсягу:** середній модуль. 4 таблиці, 1 легкий cron,
2 сторінки UI. М'яка залежність від Sites (форми) — без Sites CRM
все ще працює з ручним додаванням контактів, просто без
авто-створення лідів.

---

## 8. Social — просування в соцмережах

**Чому дорого:** перший модуль другої хвилі з НОВИМИ зовнішніми
API-інтеграціями за межами Google/LemonSqueezy — кожна соцмережа
(Instagram, Facebook, Telegram-канал, X) має власний OAuth і власні
обмеження публікації API. Це схоже на Analytics (модуль 3) по
складності OAuth, але помножене на кілька платформ замість однієї GA4.

### Крок 1 — Схема БД
```sql
create table social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform text not null,             -- 'instagram' | 'facebook' | 'telegram' | 'x'
  encrypted_access_token text not null,
  account_label text,
  created_at timestamptz not null default now(),
  unique (organization_id, platform, account_label)
);

create table social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid references social_connections(id) on delete set null,
  content text not null,
  image_urls jsonb,
  hashtags text[],
  scheduled_at timestamptz,
  published_at timestamptz,
  status text not null default 'draft', -- draft | scheduled | published | failed
  ai_generated boolean not null default false,
  created_at timestamptz not null default now()
);

create table social_post_stats (
  id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references social_posts(id) on delete cascade,
  likes integer,
  comments integer,
  shares integer,
  reach integer,
  fetched_at timestamptz not null default now()
);
```

### Крок 2 — Worker-логіка
- OAuth flow на кожну платформу (переюзати `encryptToken`/
  `decryptToken` з GSC/GA4-патерну) — починати MVP тільки з
  **Telegram** (вже є бот-інфраструктура з алертів,
  найдешевша інтеграція, без складного OAuth-рев'ю) і поступово
  додавати Instagram/Facebook/X
- `worker/src/lib/socialGeneration.ts` — AI-генерація постів і
  хештегів, переюзовує `contentGeneration.ts` (модуль 2), новий
  `kind: 'social_post'`
- Новий cron `run-social-publish` (щохвилинний або кожні 5 хв):
  знаходить `social_posts` де `status='scheduled'` і `scheduled_at <=
  now()`, публікує через API платформи, оновлює `published_at`/status
- Новий cron `run-social-stats` (щоденний): тягне лайки/коменти/охоплення
  для опублікованих постів, пише в `social_post_stats`
- Адаптація контенту під платформу (довжина, формат) — частина
  AI-промпту, не окрема таблиця

### Крок 3 — UI
`app/dashboard/social/page.tsx` — контент-календар (місячний вигляд,
картки постів по днях), кнопка "згенерувати AI", форма створення посту
з вибором платформ і часу публікації. Проста аналітика під кожним
постом (лайки/коменти/охоплення з `social_post_stats`).

### Крок 4 — Обмеження по тарифу
Ліміт кількості публікацій на місяць по тарифу + ai_credits на
генерацію (той самий пул, що AI/Content). Підключення додаткових
акаунтів — платна фіча вищих тарифів.

### Крок 5 — Готовність до "live"
MVP звужується до **Telegram-каналу тільки** (публікація +
розклад + AI-генерація тексту). Instagram/Facebook/X з їхнім OAuth-рев'ю
і API-обмеженнями — окремі ітерації, кожна зі своїм Кроком 2.

**Оцінка обсягу:** великий модуль, але з дешевим MVP якщо
почати тільки з Telegram. Повний обсяг (усі платформи) — найбільша
OAuth-складність з усього roadmap через множинність провайдерів.

---

## 9. CRO — оптимізація конверсії

**Чому дорого:** єдиний модуль другої хвилі, що вимагає збору
поведінкових даних КОРИСТУВАЧІВ клієнтського сайту (кліки, скрол,
заповнення форм) — це новий тип даних, якого зараз немає ніде в
системі (Audit/Analytics аналізують сам сайт і трафік, а не
поведінку конкретних відвідувачів). Потрібен окремий JS-сніпет на
сайті клієнта, схожий на монітор форм, але значно ширший.

### Крок 1 — Схема БД
```sql
create table cro_snippets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (site_id)
);

create table cro_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  event_type text not null,          -- 'pageview' | 'cta_click' | 'form_start' | 'form_submit' | 'scroll_depth'
  element_selector text,
  session_id text not null,
  occurred_at timestamptz not null default now()
);
-- партиціонування чи агрегація по днях — обов'язково, бо це найбільша
-- за обсягом таблиця в системі (кожен клік/скрол окремий рядок)

create table cro_daily_stats (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  date date not null,
  visitors integer not null default 0,
  cta_clicks integer not null default 0,
  form_starts integer not null default 0,
  form_submits integer not null default 0,
  conversion_rate numeric,
  unique (site_id, page_url, date)
);

create table cro_ab_tests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  variant_a jsonb not null,
  variant_b jsonb not null,
  status text not null default 'running', -- running | completed | stopped
  winner text,                       -- 'a' | 'b' | null
  created_at timestamptz not null default now()
);
```

### Крок 2 — Worker-логіка
- Легкий JS-сніпет (аналогічно ідеї uptime-моніторингу, але клієнтський
  скрипт, а не серверний чек) — вбудовується в Sites-сторінки (модуль
  4) автоматично, для зовнішніх сайтів — ручне встановлення тега,
  як зараз для form-моніторингу
- `POST /api/cro/track` — прийом подій від сніпета, пише в
  `cro_events` (потрібен агресивний rate-limit — це найгарячіший
  ендпоінт з усіх, переюзати `rateLimit.ts`)
- Новий cron `run-cro-aggregate` (щоночі): згортає `cro_events` за
  день в `cro_daily_stats`, видаляє/архівує сирі події старші N днів
  (щоб таблиця не росла безмежно)
- AI-рекомендації по покращенню CTA/форм/структури — переюзовує
  `contentGeneration.ts`/`aiInsights.ts` патерн, новий `kind:
  'cro_recommendation'` на основі `cro_daily_stats`
- Перевірка читаемості тексту — окрема легка функція (формула
  на кшталт Flesch), не потребує AI-виклику, можна порахувати
  на льоту з `project_pages.content`/HTML сторінки

### Крок 3 — UI
`app/dashboard/cro/[siteId]/page.tsx` — воронка (pageview → CTA click
→ form start → form submit) з відсотками на кожному кроці, графік
conversion_rate за 30 днів, список AI-рекомендацій. Окрема вкладка
A/B-тестів: список активних тестів, порівняння варіантів A/B.

### Крок 4 — Обмеження по тарифу
Тільки Pro+ (product vision: "Pro і вище"). Кількість активних
A/B-тестів обмежена тарифом. Обсяг зберігання сирих `cro_events` —
теж технічне обмеження незалежно від тарифу (архівація через cron).

### Крок 5 — Готовність до "live"
MVP: сніпет + базові події (pageview/CTA/form) + денна агрегація +
воронка в UI. AI-рекомендації і A/B-тести — друга ітерація, MVP може
жити без них (просто аналітика воронки вже дає цінність).

**Оцінка обсягу:** великий і технічно найризикованіший модуль другої
хвилі — єдиний з таблицею, що росте пропорційно трафіку клієнтських
сайтів (потрібне планування архівації з самого початку, не постфактум).

---

## 10. Academy — навчання користувачів

**Чому дешево, але велике за контентом:** з точки зору коду — це
найпростіший модуль (немає нових зовнішніх інтеграцій, немає складної
логіки), майже весь "обсяг" — це наповнення контентом (курси,
відео, статті), а не розробка. AI-наставник переюзовує ту саму
Gemini-інфраструктуру, що Qoraxus AI-чат (`chatHandler.ts`).

### Крок 1 — Схема БД
```sql
create table academy_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  is_premium boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references academy_courses(id) on delete cascade,
  title text not null,
  slug text not null,
  content jsonb,                     -- текст/відео-посилання/чек-лист блоки
  order_index integer not null default 0,
  unique (course_id, slug)
);

create table academy_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid not null references academy_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (profile_id, lesson_id)
);

create table academy_certificates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references academy_courses(id) on delete cascade,
  issued_at timestamptz not null default now(),
  certificate_url text,
  unique (profile_id, course_id)
);
```

### Крок 2 — Worker-логіка
Мінімальна: `POST /api/academy/progress` — позначити урок пройденим
(тригер видачі сертифіката, коли всі уроки курсу пройдені —
перевірка в тому ж ендпоінті, без окремого cron). AI-наставник —
переюзовує `chatHandler.ts`, новий system-промпт "відповідай як
наставник по SEO/платформі Qorax", контекст з прогресу користувача
(`academy_progress`) для персональних рекомендацій.

### Крок 3 — UI
`app/dashboard/academy/page.tsx` — список курсів (з позначкою
premium/безкоштовний), прогрес-бар. `app/dashboard/academy/[courseSlug]/
[lessonSlug]/page.tsx` — урок + кнопка "пройдено". Чек-листи як
окремий тип блоку в `academy_lessons.content`.

### Крок 4 — Обмеження по тарифу
Безкоштовна база (курси з `is_premium=false`) доступна всім,
преміум-курси — Academy+ підписка чи вищий тариф Qorax (окреме
рішення: чи Academy+ — надбавка до існуючого тарифу, чи входить в
Agency за замовчуванням).

### Крок 5 — Готовність до "live"
MVP: 3-5 безкоштовних курсів з реальним контентом (не заглушки) +
прогрес + один премium-курс як демонстрація монетизації. Сертифікати
і AI-наставник — можна в тому ж проході, вони дешеві технічно.

**Оцінка обсягу:** малий технічно, але найбільший за витраченим часом
на контент (написання курсів) — єдиний модуль, де "розробка" це
менша частина роботи, ніж "контент".

---

## 11. Docs — документація і база знань

**Чому недорого і поза чергою:** не монетизований продукт (окрім
Enterprise-розділів і платних гайдів), а супровідна інфраструктура —
можна будувати паралельно, невеликими шматками, коли є вільний час
між іншими модулями, а не як окрему фазу.

### Крок 1 — Схема БД
```sql
create table docs_articles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  content jsonb not null,
  category text not null,             -- 'getting-started' | 'api' | 'guides' | 'faq' | 'integrations'
  is_enterprise_only boolean not null default false,
  order_index integer not null default 0,
  updated_at timestamptz not null default now()
);
```
Одна таблиця — навмисно просто. Історія змін статей — через `git`
на рівні MDX-файлів у репозиторії, а не через окрему таблицю версій
(над-інженерія для документації одного продукту).

### Крок 2 — Worker-логіка
AI-пошук по документації — не окремий Gemini-виклик на кожен запит
(дорого і повільно для FAQ), а простий full-text search через
Postgres (`tsvector` на `docs_articles.content`), з опційним
"запитати AI" fallback через `chatHandler.ts`, якщо пошук нічого не
знайшов. `GET /api/docs/search?q=`.

### Крок 3 — UI
`app/docs/page.tsx` вже існує (маркетинговий /docs) — розширюється
реальним деревом статей замість поточного статичного опису платформи.
Приклади коду — підсвітка синтаксису (вже є patterns в проєкті для
коду, якщо є, або легка бібліотека). Інструкції прямо в інтерфейсі
дашборду — короткі тултіпи/onboarding-підказки (переюзати
onboarding checklist pattern з модуля 0037).

### Крок 4 — Обмеження
Публічна документація безкоштовна для всіх (в т.ч. неавторизованих
відвідувачів landing). `is_enterprise_only` розділи видно тільки
організаціям з Agency/Enterprise тарифом. Платні гайди/шаблони —
окремий одноразовий продаж, не підписка (простіше через
LemonSqueezy one-time checkout, а не organization_module_access).

### Крок 5 — Готовність до "live"
MVP: структуроване дерево статей (Getting Started, API Reference,
FAQ, Integrations) з реальним контентом під кожен вже готовий модуль
платформи, full-text пошук. AI-пошук fallback і платні гайди —
друга ітерація.

**Оцінка обсягу:** найменший технічно модуль з усього roadmap (1
таблиця, 1 ендпоінт). Обсяг роботи — контент, і його можна нарощувати
безкінечно малими проходами по мірі готовності інших модулів.

---

## Підсумкова таблиця (друга хвиля)

| # | Модуль | Нові таблиці | Нова зовнішня інтеграція | Розмір UI | Залежності |
|---|--------|--------------|---------------------------|-----------|------------|
| 5 | Translator | 2 | Немає (Gemini вже є) | Малий-середній | Sites (модуль 4) |
| 6 | Commerce | 6 | Немає (LemonSqueezy вже є) | Найбільший | Sites (модуль 4) |
| 7 | CRM | 4 | Немає | Середній | М'яко: Sites (форми) |
| 8 | Social | 3 | OAuth на кожну платформу (старт: Telegram) | Середній-великий | AES-GCM helper (вже є) |
| 9 | CRO | 4 | Немає, новий JS-сніпет + гарячий ендпоінт | Середній-великий | Sites (сніпет), rateLimit |
| 10 | Academy | 4 | Немає | Малий (код), великий (контент) | — |
| 11 | Docs | 1 | Немає | Малий, зростає контентом | — |

Порядок побудови другої хвилі: **Translator → Commerce → CRM →
Social → CRO → Academy**, з **Docs** паралельно в будь-який момент.
Обґрунтування порядку те саме, що й для першої хвилі — від дешевого й
безризикового (переюзання наявної AI/платіжної інфраструктури) до
дорогого й ризикованого (нові типи даних: гроші клієнта в Commerce,
поведінка відвідувачів у CRO).

---

## Третя хвиля: Qorax AI — єдиний AI-хаб платформи

**Архітектурне рішення (важливо, не переглядати без окремого
обговорення):** Agents НЕ виносяться в окремий пункт бокового меню.
Вони живуть ВСЕРЕДИНІ єдиного модуля `Qorax AI`, як одна з його
вкладок. Причина: якщо зробити тільки чат — не відчувається як
автоматизація; якщо зробити тільки агентів окремим пунктом меню —
користувачу треба самому розбиратись, якого агента запускати.
Об'єднання дає просту модель: **AI = мозок і інтерфейс, Agents =
виконавці всередині нього**. У бічному меню лишається один пункт
"Qorax AI", нові агенти додаються без зміни структури платформи.

**Що буде з Qoraxus:** поточний `QoraxusChat.tsx` — чат-віджет,
прив'язаний до ОДНОГО сайту (`/dashboard/sites/[id]`), що бачить
тільки дані цього сайту. Він не видаляється й не залишається окремим
продуктом — переноситься ВСЕРЕДИНУ `Qorax AI` як контекстний режим
чату: той самий `chatHandler.ts` бекенд, той самий UI-компонент
(перейменований, не переписаний з нуля), просто тепер доступний і
з екрану конкретного сайту (контекст = один сайт, як зараз), і з
головного AI Chat (контекст = вся організація, всі сайти). Технічно
це один чат-компонент з опційним `site_id` — звужує область видимості
контексту, а не два різні продукти.

`Qorax AI` складається з шести вкладок:

```
Qorax AI
├── 💬 Chat        — головний діалог, знає всі проекти/аудити/позиції/аналітику
├── 🤖 Agents      — команда спеціалізованих виконавців (SEO/Content/Rank/...)
├── 📂 Workspace   — Files (завантажені PDF/CSV/зображення) + історія дій
├── 🧠 Memory      — що AI запам'ятав про бізнес користувача
├── 📋 Tasks       — черга задач (написати статтю, зробити аудит...)
└── ⚙️ Automations — розклад агентів (те саме, що agent_subscriptions)
```

### Крок 1 — Схема БД
Базові таблиці агентів з попередньої версії плану лишаються без змін
(`agents`, `agent_subscriptions`, `agent_runs`, `agent_action_log` —
див. структуру нижче), плюс нові для Chat/Memory/Files/Tasks:
```sql
-- Агенти й автоматизація (без змін відносно попередньої версії плану)
create table agents (
  id text primary key,                -- 'seo' | 'content' | 'translator' | 'analytics' |
                                       -- 'rank' | 'cro' | 'commerce' | 'social' | 'crm' | 'support'
  name text not null,
  description text not null,
  underlying_module text,
  credit_cost_per_run integer not null default 0,
  is_active boolean not null default true
);

create table agent_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  schedule_cron text,
  is_enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, agent_id, site_id)
);

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_subscription_id uuid not null references agent_subscriptions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'running',
  credits_spent integer not null default 0,
  summary text,
  raw_output jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table agent_action_log (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  action_type text not null,
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now()
);

-- Chat (замінює й розширює поточний Qoraxus)
create table ai_chat_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade, -- null = чат на рівні всієї організації
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references ai_chat_threads(id) on delete cascade,
  role text not null,                 -- 'user' | 'model'
  content text not null,
  created_at timestamptz not null default now()
);

-- Memory
create table ai_memory (
  organization_id uuid primary key references organizations(id) on delete cascade,
  business_summary text,              -- чим займається бізнес клієнта
  tone_preference text,                -- стиль спілкування, який AI має тримати
  competitors jsonb,                   -- список конкурентів, про яких AI вже знає
  goals text,
  updated_at timestamptz not null default now()
);

-- Files (аналіз завантажених документів)
create table ai_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  thread_id uuid references ai_chat_threads(id) on delete set null,
  file_name text not null,
  file_type text not null,             -- 'pdf' | 'csv' | 'image' | 'docx'
  storage_path text not null,          -- шлях у Supabase Storage
  extracted_summary text,
  created_at timestamptz not null default now()
);

-- Tasks (черга задач, які AI ще має виконати чи вже виконує)
create table ai_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id text references agents(id) on delete set null,
  description text not null,
  status text not null default 'pending', -- pending | in_progress | done | failed
  agent_run_id uuid references agent_runs(id) on delete set null,
  created_at timestamptz not null default now()
);
```
`ai_chat_threads.site_id` — nullable: якщо `null`, це головний чат
рівня організації (бачить усі сайти), якщо заповнено — контекстний
чат конкретного сайту (те, чим зараз є Qoraxus). Один і той самий
механізм, різниця тільки в звуженні контексту при формуванні промпту.

### Крок 2 — Worker-логіка
**Головний принцип лишається той самий, що і в першій версії плану
агентів: AI Hub не винаходить нову бізнес-логіку, а оркеструє вже
готові модулі.**
- `worker/src/lib/aiChatHandler.ts` — розширення поточного
  `chatHandler.ts`: тепер приймає `thread_id` замість одноразового
  запиту, читає `ai_memory` організації для контексту, і, коли
  `site_id` в тред не заданий, збирає контекст з УСІХ сайтів
  організації (останні аудити, позиції, аналітика) замість одного —
  це і є технічна суть "AI знає всі проекти". Для контекстного чату
  сайту (колишній Qoraxus) поведінка не змінюється.
- Розпізнавання наміру в чаті ("зроби аудит" → запустити SEO Agent,
  "напиши статтю" → Content Agent) — не окрема ML-модель, а
  Gemini-виклик з `tools`/function-calling, де кожен інструмент —
  це виклик `agentRunner.runAgent(agentId, ...)` (той самий раннер,
  що і для запуску за розкладом). Тобто чат і автоматизації діляться
  одним виконавчим шаром — у чаті просто ще один спосіб викликати
  `runAgent`.
- `worker/src/lib/agentRunner.ts` — без змін відносно попередньої
  версії плану: `runAgent(agentId, subscriptionId)` викликає функцію
  відповідного модуля (`seoChecker.ts`, `contentGeneration.ts`,
  `rankHandler.ts`...), списує кредити, пише `agent_runs` +
  `agent_action_log`, надсилає сповіщення.
- **CEO Agent** — залишається агрегатором (`ceoAgentSummary.ts`),
  але тепер саме він формує ранковий дайджест у AI Chat ("Доброго
  ранку! За ніч я знайшов 4 нові SEO-помилки...") — рендериться як
  перше повідомлення в головному треді організації, генерується
  нічним cron, а не по запиту користувача.
- **Файли** (`ai_files`): завантаження в Supabase Storage +
  витяг тексту (PDF/DOCX через вже наявні parsing-підходи з
  pdfReport.ts, якщо застосовний, або нову легку бібліотеку) →
  короткий Gemini-виклик "витягни ключову інформацію" →
  `extracted_summary`, який далі йде в контекст чату
- **Deep Research** (аналіз ринку/конкурентів) — не нова
  інфраструктура, а комбінація вже наявного `competitorChecker.ts`
  + кілька послідовних Gemini-викликів з довшим `maxOutputTokens`,
  оформлена як один `ai_tasks` із `status` що змінюється по кроках
  (queued → researching → done) — довгий процес, тому Tasks-модель
  тут доречна (chat не чекає синхронно)
- **AI Actions** (створити сторінку, опублікувати статтю, змінити
  SEO) — не новий рівень прав, а виклик вже наявних
  ендпоінтів модулів (Sites/AI-Content/Translator) від імені
  користувача, з підтвердженням у чаті перед виконанням
  деструктивних дій (публікація, зміна SEO) — той самий принцип
  обережності, що і для будь-якої іншої дії, яка змінює дані
  клієнта, а не тільки читає їх
- Ендпоінти: `POST /api/ai/chat` (тепер приймає `thread_id`),
  `GET /api/ai/threads`, `POST /api/ai/files` (upload + аналіз),
  `GET/PATCH /api/ai/memory`, `GET /api/ai/tasks`,
  `POST /api/agents/:id/subscribe`, `POST /api/agents/:id/run-now`
  (два останні — без змін відносно версії плану з агентами)

### Крок 3 — UI
Один пункт бокового меню — `Qorax AI`
(`app/dashboard/ai/page.tsx`), з внутрішньою навігацією по вкладках,
не окремими пунктами головного меню:
- **Chat** — головний екран за замовчуванням: великий діалог,
  список тредів зліва (як в звичайних AI-чатах), ранковий дайджест
  від CEO Agent закріплений зверху
- **Agents** — картки агентів (як "співробітники": іконка/назва/
  статус/розклад/кнопка "запустити зараз") — той самий UI, що
  описаний в попередній версії плану, просто це вкладка всередині
  Qorax AI, а не окремий пункт меню
- **Workspace** — об'єднує Files (список завантажених документів +
  drag-and-drop завантаження) і History (стрічка `agent_action_log`,
  той самий "feed", що в попередній версії плану)
- **Memory** — форма перегляду/редагування `ai_memory`
  (бізнес/тон/конкуренти/цілі) — прозорість того, що AI "знає"
  про клієнта, з можливістю виправити чи стерти
- **Tasks** — список `ai_tasks` з фільтром за статусом
- **Automations** — те саме, що `agent_subscriptions` — розклад
  кожного агента, увімкнено/вимкнено

На сторінці конкретного сайту (`/dashboard/sites/[id]`) поточний
`QoraxusChat.tsx` замінюється на компактну версію того ж
Chat-компонента, просто з наперед заданим `site_id` — не окремий
код, той самий React-компонент з різними props.

### Крок 4 — Обмеження по тарифу
Монетизація з попередньої версії плану (ліміт активних
`agent_subscriptions`, кредити з єдиного пулу `ai_credits`)
доповнюється лімітами на сам Chat:
- Кількість повідомлень чату на місяць по тарифу (конкретні числа —
  рішення на етапі запуску, не частина технічного плану)
- Deep Research і AI Actions — Pro і вище (важчі й потенційно
  деструктивні дії — вимагають вищого рівня довіри до тарифу)
- Files — ліміт розміру/кількості завантажень по тарифу
- Automations (розклад) — вищі тарифи; Free/Starter — тільки ручний
  запуск, як і в попередній версії плану

### Крок 5 — Готовність до "live"
MVP не вимагає всіх шести вкладок одразу. Мінімальний робочий шлях:
1. **Chat** з розширеним контекстом (всі сайти організації, не один) —
   технічно найменша зміна відносно поточного Qoraxus
2. **Agents**-вкладка з тим самим мінімальним набором з попередньої
   версії плану (SEO + Content + Rank Agent)
3. **Memory** — проста форма, дешева технічно, дає AI одразу
   відчутно кращі відповіді
Workspace (Files), Tasks і Automations — друга ітерація, кожна
незалежна одна від одної. Deep Research і AI Actions — третя
ітерація, найдорожчі й найризикованіші (Actions змінюють дані
клієнта, Research — довгий процес з кількома AI-викликами поспіль).

**Оцінка обсягу:** середній-великий шар. 8 таблиць (4 з
попередньої версії плану агентів + 4 нові під Chat/Memory/Files/
Tasks), 1 UI-модуль з 6 внутрішніми вкладками замість 1 окремого
пункту меню. Головний ризик — не технічний обсяг, а дисципліна не
перетворити "єдиний AI-хаб" на розрізнений набір вкладок: кожна нова
можливість (Deep Research, Actions, Marketplace з ідеї "AI Marketplace"
для сторонніх агентів/промптів) додається тільки коли є реальний
попит, а не одразу всі гіпотези з продуктового бачення.

---

## Четверта хвиля (довгострокове бачення): Qorax як AI Business Operating System

**Джерело:** продуктове бачення від Артема (5 напрямків: AI Operating
System, Team Workspace, Knowledge Graph, Benchmarking, Predictive AI).
**Статус: не спринт, а горизонт.** На відміну від хвиль 1-3, це не
черга готових до розробки модулів — це орієнтир, куди веде кожен з
них. Нічого нижче не починається, поки хвилі 1-2 не переведені в
`live`, а хвиля 3 (Qorax AI: Chat/Agents/Memory) не має хоча б MVP —
всі 5 напрямків нижче технічно НАДБУДОВУЮТЬСЯ над Qorax AI, а не
замінюють його.

**Фінальна концепція одним реченням:** користувач купує не набір
інструментів, а цифрового операційного директора, який знає бізнес,
працює разом з командою, порівнює результати з ринком і прокладає
дорогу до мети. П'ять напрямків нижче — це п'ять рівнів однієї
системи, не п'ять окремих фіч:

```
Predictive AI      — прогнозує і будує дорожню карту
      ↑ використовує
Benchmarking        — знає, де користувач відносно ринку
      ↑ використовує
Knowledge Graph      — розуміє структуру бізнеса (сутності й зв'язки)
      ↑ живить
AI Operating System   — мозок, що координує агентів і виконує дії
      ↑ працює всередині
Team Workspace        — простір, де люди й AI працюють разом
```
Порядок побудови знизу вгору: Knowledge Graph і Team Workspace —
фундамент (без них AI Brain немає що координувати і нема кому
показувати результат), AI Operating System — розширення вже наявної
Qorax AI (хвиля 3), Benchmarking і Predictive AI — верхній шар,
що споживає дані з усіх нижніх.

---

### 12. AI Operating System — розширення Qorax AI до повного мозку платформи

**Важливо:** це НЕ новий модуль поруч з Qorax AI з хвилі 3 — це
розширення тих самих 6 вкладок (`Chat/Agents/Workspace/Memory/Tasks/
Automations`) новими можливостями. `ai_tasks` з хвилі 3 стає базовою
таблицею AI Task Manager, `agent_subscriptions` — базовою таблицею AI
Scheduler, `ai_memory` — базовою таблицею AI Memory. Нове тут —
рівень ЦІЛІ над ними (AI Planner) і рівень видимих рекомендацій
(AI Inbox), яких зараз немає.

**Концепція:** користувач більше не каже "запусти аудит" — він каже
"збільш органічний трафік", а AI Planner сам розкладає ціль на
послідовність задач для вже наявних агентів (SEO/Content/Rank/...).

#### Крок 1 — Схема БД
```sql
-- Ціль, яку поставив користувач (людською мовою)
create table ai_goals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,                 -- "Збільшити заявки на 30% за 3 місяці"
  status text not null default 'active', -- active | achieved | abandoned
  created_at timestamptz not null default now()
);

-- AI Planner: розклад цілі на кроки (кожен крок → 1+ ai_tasks)
create table ai_plans (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references ai_goals(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'draft', -- draft | active | completed
  created_at timestamptz not null default now()
);

create table ai_plan_steps (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references ai_plans(id) on delete cascade,
  step_order integer not null,
  description text not null,           -- "Перевірити SEO", "Оновити статті"
  agent_id text references agents(id) on delete set null,
  ai_task_id uuid references ai_tasks(id) on delete set null, -- заповнюється при запуску кроку
  status text not null default 'pending', -- pending | running | done | skipped
  unique (plan_id, step_order)
);

-- AI Inbox: рекомендації AI, які користувач ще не розглянув
create table ai_inbox_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  title text not null,                 -- "Оновити сторінку «Послуги»"
  reason text not null,                -- "Втрата позицій"
  source text not null,                -- 'rank' | 'audit' | 'cro' | 'ceo_agent' | ...
  suggested_agent_id text references agents(id) on delete set null,
  status text not null default 'new',  -- new | accepted | dismissed
  created_at timestamptz not null default now()
);
```
`ai_plan_steps.ai_task_id` — навмисно nullable і заповнюється тільки
в момент старту кроку: план може містити 10 кроків наперед, але
`ai_tasks`-запис створюється лише коли крок дійсно передається в
`agentRunner.runAgent` — так само, як зараз черга `ai_tasks` уже
працює в хвилі 3, тут просто додається джерело "хто поставив цю
задачу" (план, а не людина напряму чи розклад).

#### Крок 2 — Worker-логіка
- `worker/src/lib/aiPlanner.ts` (новий) — приймає `ai_goals.title`,
  один Gemini-виклик з function-calling, що повертає список кроків
  (`ai_plan_steps`) з прив'язкою до конкретних `agents.id` — planner
  не вигадує нову бізнес-логіку, а тільки МАПИТЬ ціль на вже наявних
  агентів, той самий принцип, що і в `aiChatHandler.ts` з хвилі 3
- Виконання плану — не новий раннер, а послідовні виклики вже
  наявного `agentRunner.runAgent()` по кроках плану, з паузою на
  підтвердження користувача між кроками, що змінюють дані
  (та сама логіка підтвердження деструктивних дій, що вже описана
  для AI Actions в хвилі 3)
- `worker/src/lib/aiInbox.ts` (новий) — не окремий cron, а
  ПІДПИСКА на вже наявні джерела: `checkSpeedDegradation`
  (Audit), `rankHandler.ts` (падіння позицій), `croAggregate`
  (CRO) — кожне з них при виявленні проблеми пише рядок в
  `ai_inbox_items` замість (або на додачу до) прямого email/Telegram
  сповіщення — це об'єднує розрізнені сповіщення модулів в один
  список для AI Chat
- Ендпоінти: `POST /api/ai/goals`, `GET /api/ai/plans/:goalId`,
  `POST /api/ai/plans/:id/start-step`, `GET /api/ai/inbox`,
  `POST /api/ai/inbox/:id/accept` (accept = запустити
  `suggested_agent_id` через `runAgent`), `POST /api/ai/inbox/:id/
  dismiss`

#### Крок 3 — UI
Нових пунктів меню немає — все всередині вкладок Qorax AI з хвилі 3:
- **Chat** отримує новий тип повідомлення: картку цілі з прогрес-баром
  кроків плану (клік по кроку → деталі `ai_task`)
- **Tasks**-вкладка отримує фільтр "за планом" на додачу до фільтра
  за статусом
- Новий блок **AI Inbox** зверху на `Chat` або як окрема секція на
  `/dashboard/home` (Головна сторінка вже показує AI-рекомендації за
  задумом — тут це стає реальним джерелом даних, а не заглушкою)

#### Крок 4 — Обмеження по тарифу
- Кількість активних `ai_goals` одночасно — по тарифу (Starter: 1,
  Growth: 3, Agency: без ліміту)
- Кожен крок плану, що запускає агента, списує кредити за тими ж
  правилами, що і прямий запуск агента (`credit_cost_per_run`) —
  Planner не створює новий тарифний вимір, тільки новий спосіб
  ІНІЦІЮВАННЯ вже тарифікованої дії
- AI Inbox — доступний на всіх тарифах (це утримання й залучення,
  не преміум-фіча), але `accept`, що запускає платного агента,
  списує кредити як завжди

#### Крок 5 — Готовність до "live"
MVP: тільки **AI Inbox**, підключений до 2-3 вже наявних джерел
(Rank + Audit) — дешево технічно (нема нового AI-виклику, просто
нова таблиця + запис у неї з місць, де вже є логіка виявлення
проблем), і одразу відчутна цінність. **AI Goals/Planner** — друга
ітерація, вимагає найбільше тестування якості (Gemini повинен
адекватно розкладати довільну ціль на наявних агентів, тут високий
ризик "AI придумав крок, для якого немає агента").

---

### 13. Team Workspace — командний простір

**Конфлікт з уже реалізованим (важливо, рішення потрібне ДО старту):**
міграція `0034_team_invites.sql` вже має робочі ролі `owner/admin/
editor/viewer` з RLS-політиками на їх основі по всій платформі.
Бачення пропонує ширший набір (Owner/Admin/Manager/SEO Specialist/
Content Manager/Developer/Sales/Viewer). **Це НЕ можна просто додати
рядком в enum** — кожна існуюча RLS-політика з `role in ('owner',
'admin', ...)` по всіх таблицях платформи (sites, projects,
subscriptions, agent_subscriptions...) писана під 4 ролі й буде
або блокувати нові ролі, або (гірше) випадково пропускати. Рішення
на момент старту цього напрямку: або (а) нові ролі — це PRESET-и,
що мапляться на існуючі 4 базові права (Manager→admin, SEO
Specialist/Content Manager→editor, Developer→editor, Sales→viewer
з розширенням тільки на CRM), або (б) повний перехід на
permission-based модель (окрема таблиця `permissions` замість
enum) — трудомісткіше, але правильніше довгостроково. Вибір — окреме
обговорення, не частина цього запису.

#### Крок 1 — Схема БД
```sql
-- Задачі всередині Workspace (людські, не плутати з ai_tasks)
create table workspace_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  title text not null,
  description text,
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null, -- null = створено AI
  status text not null default 'todo', -- todo | in_progress | done
  due_date date,
  created_at timestamptz not null default now()
);

-- Коментарі — поліморфні (сторінка, звіт, лід, товар, стаття)
create table comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  target_type text not null,           -- 'site' | 'report' | 'lead' | 'product' | 'article'
  target_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Activity Feed — уніфікована стрічка всіх дій (людських і AI)
create table activity_feed (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null, -- null = AI
  actor_type text not null default 'user', -- 'user' | 'ai'
  action text not null,                -- "оновив Title", "прийняв лід", "запустив аудит"
  target_type text,
  target_id uuid,
  created_at timestamptz not null default now()
);

-- Approval Flow — чернетка перед публікацією (AI → редактор → менеджер → публікація)
create table approval_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  target_type text not null,           -- 'article' | 'page' | 'seo_change'
  target_id uuid not null,
  requested_by text not null,          -- 'ai' | profiles.id як text
  current_step text not null default 'editor', -- editor | manager | published
  status text not null default 'pending', -- pending | approved | rejected
  created_at timestamptz not null default now()
);
```
`activity_feed` — навмисно окрема таблиця, не VIEW над іншими логами
(`agent_action_log` з хвилі 3 лишається технічним журналом дій AI,
`activity_feed` — людино-читабельна стрічка для UI, наповнюється і
з `agent_action_log`, і з прямих дій користувачів через тригери/явні
записи в коді ендпоінтів, що змінюють дані).

#### Крок 2 — Worker-логіка
- Прості CRUD-ендпоінти для `workspace_tasks`/`comments` — без
  особливої логіки, стандартний REST-патерн, як і решта платформи
- `worker/src/lib/activityLogger.ts` (новий) — одна допоміжна
  функція `logActivity(orgId, actorId, action, target)`, яку
  викликають з ключових існуючих ендпоінтів (оновлення сторінки,
  прийняття ліда, запуск агента) — не окремий сервіс, просто виклик
  в кінці вже наявних обробників
- `approval_requests` — при переході `current_step` між кроками
  надсилається сповіщення наступному в ланцюжку (Resend/Telegram,
  той самий механізм, що вже є для інших сповіщень)

#### Крок 3 — UI
- Новий пункт бокового меню **Workspace** (не плутати з вкладкою
  `Workspace` всередині Qorax AI з хвилі 3 — тут потрібна інша назва
  в UI, наприклад "Команда", щоб уникнути плутанини) з підвкладками
  Tasks / Activity Feed
- Коментарі — inline-віджет, що підключається до вже наявних
  сторінок (звіт аудиту, картка ліда в CRM, товар в Commerce) —
  не окрема сторінка
- Approval Flow — банер статусу на сторінці статті/сторінки
  ("Очікує підтвердження редактора") + окремий список "На
  затвердженні" для ролей editor/admin

#### Крок 4 — Обмеження по тарифу
- Кількість користувачів в організації — вже тарифікується (наявна
  система team invites), тут без змін
- Окремі Workspace (кілька незалежних організацій під одним
  власником) — Agency+
- Enterprise SSO, аудит дій (`activity_feed` з фільтрами й
  експортом) — майбутній Enterprise-тариф, якого зараз немає в
  PRICING.md — рішення чи вводити такий тариф лишається окремим
  питанням

#### Крок 5 — Готовність до "live"
MVP: **Activity Feed** тільки для читання (найдешевше — просто
логування вже наявних дій) → потім **Comments** (ізольована фіча,
не залежить від інших) → **Tasks** → **Approval Flow** останнім,
бо вимагає найбільше UI-роботи (ланцюжок станів, сповіщення на
кожному кроці) і найменше критичний, поки команди в основному
маленькі (1-3 людини), де формальне затвердження — оверхед, а не
допомога.

---

### 14. Knowledge Graph — граф знань про бізнес

**Це фундамент для Benchmarking і Predictive AI нижче — без графа
зв'язків "які сторінки впливають на продажі товару X" AI Chat може
тільки читати сирі дані модулів, а не відповідати на питання про
ЗВ'ЯЗКИ між ними.**

#### Крок 1 — Схема БД
Загальний граф, а не окремі таблиці під кожен тип зв'язку — так само,
як `activity_feed` вище, це навмисно generic-модель:
```sql
create table kg_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_type text not null,   -- 'service' | 'category' | 'page' | 'product' |
                              -- 'customer' | 'competitor' | 'keyword' | 'article' | 'lead'
  ref_table text,             -- 'sites' | 'projects' | 'crm_leads' | 'commerce_products' | ...
  ref_id uuid,                -- id рядка в ref_table, якщо вузол відповідає реальному запису
  label text not null,
  created_at timestamptz not null default now()
);

create table kg_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_node_id uuid not null references kg_nodes(id) on delete cascade,
  to_node_id uuid not null references kg_nodes(id) on delete cascade,
  relation text not null,     -- 'related_to' | 'targets_keyword' | 'mentions' | 'competes_with'
  weight real not null default 1.0, -- сила зв'язку, для майбутнього ранжування
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id, relation)
);
create index kg_edges_from_idx on kg_edges(from_node_id);
create index kg_edges_to_idx on kg_edges(to_node_id);
```
`ref_table`/`ref_id` — навмисний "м'який" зв'язок (не foreign key на
конкретну таблицю), бо вузол графа може вказувати на сторінку з
Sites, товар з Commerce, ліда з CRM — таблиці різні, а графу потрібен
один спільний тип вузла.

#### Крок 2 — Worker-логіка
- `worker/src/lib/knowledgeGraph.ts` (новий) — функції
  `upsertNode()`/`addEdge()`, які викликаються НЕ окремим сервісом,
  а з місць, де вже створюється контент: при створенні сторінки в
  Sites, товару в Commerce, ліда в CRM, статті в AI/Content — кожен
  такий ендпоінт додатково викликає `upsertNode` (і, де очевидно,
  `addEdge` — наприклад стаття → ключове слово, з яким вона вже
  зв'язана в наявній таблиці `content_pieces`/`rank_keywords`)
- Автоматичне зв'язування ключових слів — не нова AI-логіка, а
  перевикористання вже наявних зв'язків (`rank_keywords.site_id`,
  `content_pieces.target_keyword`) — граф просто РОБИТЬ ЇХ ЯВНИМИ
  для AI Chat, замість того щоб AI щоразу заново збирав контекст
  окремими SQL-запитами по різних таблицях
- `aiChatHandler.ts` (з хвилі 3) отримує новий крок формування
  контексту: перед Gemini-викликом — вибірка релевантних `kg_nodes`/
  `kg_edges` навколо сутностей, згаданих у запиті користувача, замість
  (або на додачу до) прямих запитів по окремих таблицях модулів

#### Крок 3 — UI
MVP без окремої сторінки — граф працює "під капотом" для якості
відповідей AI Chat. Візуалізація графа (інтерактивна карта зв'язків)
— не MVP, а майбутня преміум-фіча для Agency-тарифу, і тільки якщо
буде явний попит: сама по собі візуалізація графа не продає, продає
розумніший AI Chat.

#### Крок 4 — Обмеження по тарифу
Граф сам не тарифікується окремо — це інфраструктура, що покращує
якість Chat, а Chat вже тарифікується (хвиля 3, Крок 4). Візуалізація
графа (якщо буде побудована) — Agency+.

#### Крок 5 — Готовність до "live"
Немає окремого "live"-стану — це не модуль з власною сторінкою, а
шар даних. Готовність = `upsertNode`/`addEdge` викликаються з
достатньої кількості місць (мінімум: Sites-сторінки + Rank-ключові
слова + CRM-ліди), щоб AI Chat міг відповісти на прості
відносні питання ("які сторінки пов'язані з товаром X").

---

### 15. Benchmarking — порівняння з ринком

**Найчутливіша частина технічно: вимагає збору АНОНІМІЗОВАНОЇ
статистики по ВСІХ організаціях платформи. Юридично і продуктово
це вимагає явної згоди в Terms of Service (`/terms` вже існує,
цей пункт туди ще не внесений) і чіткого розмежування "агреговане
без ідентифікації" проти "дані конкретного клієнта" — без цього
розмежування напрямок не можна вмикати.**

#### Крок 1 — Схема БД
```sql
-- Знеособлені знімки метрик по організаціях (для агрегації, не для показу напряму)
create table benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  industry text,                -- ніша, визначена користувачем чи AI при онбордингу
  country text,
  business_size text,           -- 'solo' | 'small' | 'medium' — по кількості sites/projects
  metric text not null,         -- 'speed_ms' | 'conversion_rate' | 'ctr' | 'article_length' | 'pages_count'
  value real not null,
  captured_at timestamptz not null default now()
  -- НЕМАЄ organization_id — це навмисно, запис вже знеособлений на момент вставки
);
create index benchmark_snapshots_lookup_idx on benchmark_snapshots(industry, metric, captured_at);
```
Знеособлення відбувається в момент ЗАПИСУ (worker формує рядок без
`organization_id`), а не в момент читання — так простіше гарантувати,
що персональні дані фізично не потрапляють у цю таблицю.

#### Крок 2 — Worker-логіка
- Нічний cron `worker/src/lib/benchmarkAggregator.ts` (новий) —
  проходить по вже наявних метриках (`speed_checks`, CRO-конверсія,
  `content_pieces` довжина статей) і пише знеособлені агрегати в
  `benchmark_snapshots` — не новий збір даних, переиспользование
  вже наявних таблиць модулів
- `GET /api/benchmarks/:metric` — рахує процентиль конкретної
  організації відносно `benchmark_snapshots` того ж `industry`/
  `country`/`business_size` (SQL `percent_rank()` або еквівалент
  на клієнті) — легкий запит, без AI-виклику
- AI-пояснення різниці ("Ви швидші за 89% сайтів, але конверсія
  нижча за середню") — окремий, дешевший Gemini-виклик, що бере вже
  порахований процентиль + контекст з `ai_memory`/Knowledge Graph,
  не рахує сам

#### Крок 3 — UI
Нова вкладка/секція на `/dashboard/analytics` або окрема
`/dashboard/benchmark` (рішення на етапі дизайну) — картки "Ви
vs Середнє vs Найкращий конкурент" по кожній метриці, з
AI-поясненням знизу кожної картки.

#### Крок 4 — Обмеження по тарифу
Базові 2-3 метрики (наприклад швидкість, SEO score) — доступні всім
як гачок; повний набір метрик і AI-пояснення — Growth+; експорт
звіту в PDF — Agency (переиспользування вже наявної PDF-інфраструктури
з Audit).

#### Крок 5 — Готовність до "live"
**Блокер, не технічний обсяг:** потрібна критична маса даних —
`benchmark_snapshots` дає осмислені порівняння тільки коли в кожній
парі industry/country є десятки-сотні організацій. Технічно готово
рано, продуктово вмикати рано — цей напрямок реалістичний тільки
після того, як у платформі накопичиться помітна база платних
клієнтів, не разом з рештою хвилі 4.

---

### 16. Predictive AI — прогнозування і дорожня карта

**Верхній шар, споживає Knowledge Graph + Benchmarking + історичні
дані вже наявних модулів (Rank, Analytics, CRM). Найризикованіший
напрямок: прогнози, які не справджуються, шкодять довірі до AI
сильніше, ніж її відсутність — тому МВП свідомо вужчий, ніж
"Predictive Planner" з оригінального бачення.**

**Статус: MVP реалізовано (Risk/Opportunity Detection, Крок 5 нижче).**
`worker/src/lib/predictiveEngine.ts` — два детектори, обидва
переформулювання вже наявних даних, не нова ML/статистична логіка:
падіння/зростання позиції tracked-запиту (`gsc_metrics.average_position`,
поріг ≥3 позиції) і деградація швидкості (той самий поріг, що вже
перевірений `checkSpeedDegradation`). Підключено до нічного крону
`0 3 * * *` (не окремий тригер). Схема — `0066_ai_predictions.sql`
(тільки `ai_predictions`, без `ai_roadmap_milestones` — foreign key
на `ai_goals`, якої ще нема). UI — `PredictiveInsightsPanel.tsx` на
сторінці сайту (вкладка "AI Прогнози"), з позначкою "оцінка на
основі тренду, не гарантія". Traffic/Ranking/Revenue Forecast і
Predictive Planner — НЕ зроблено (наступні ітерації, як і
задокументовано в Кроці 5 нижче).

#### Крок 1 — Схема БД
```sql
create table ai_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  prediction_type text not null,  -- 'traffic' | 'ranking' | 'revenue' | 'leads' | 'risk'
  horizon_days integer not null,  -- на скільки днів вперед
  predicted_value jsonb not null, -- гнучко: число, діапазон, чи структура для risk/opportunity
  confidence real,                -- 0.0–1.0, якщо модель може це дати
  based_on jsonb,                 -- які джерела даних врахувались (для прозорості й дебагу)
  created_at timestamptz not null default now(),
  target_date date not null       -- на яку дату прогноз, для звірки факт/прогноз пізніше
);

-- Дорожня карта до цілі (споживає ai_goals/ai_plans з AI Operating System)
create table ai_roadmap_milestones (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references ai_goals(id) on delete cascade,
  title text not null,           -- "Створити 20 сторінок"
  target_date date not null,
  status text not null default 'pending', -- pending | in_progress | done | missed
  plan_step_id uuid references ai_plan_steps(id) on delete set null
);
```
`ai_predictions.target_date` — критичне поле: без нього неможливо
пізніше порахувати точність прогнозів (звірити `predicted_value` з
фактичними даними на `target_date`), а без цієї звірки Predictive AI
не можна довести — і не можна покращувати.

#### Крок 2 — Worker-логіка
- `worker/src/lib/predictiveEngine.ts` (новий) — MVP навмисно НЕ
  власна ML-модель (немає ні даних, ні ресурсу тренувати модель
  на старті), а проста статистична екстраполяція (лінійний тренд/
  сезонність по вже наявних історичних рядах — `rank_history`,
  `speed_checks`, CRM-ліди по місяцях) + Gemini для формулювання
  людською мовою й додавання контексту ("через сезонність попит
  зросте") — чесно позиціонувати як "оцінка на основі тренду", не
  "AI передбачає майбутнє"
- `AI Risk Analysis`/`Opportunity Detection` — не новий детектор, а
  переформулювання вже наявних сигналів (`checkSpeedDegradation`,
  `competitor_changes` з падінням позицій конкурента) в формат
  `ai_predictions` з `prediction_type='risk'`/`'opportunity'` —
  той самий принцип перевикористання, що і в AI Inbox з розділу 12
- **Predictive Planner** — не новий движок, а `ai_goals` +
  `ai_plans` (з розділу 12) + `ai_roadmap_milestones`: коли AI
  Planner розкладає ціль на кроки, кожному кроку з датою відповідає
  milestone — окремої "дорожньої карти"-системи не будується,
  вона є прямим наслідком уже описаного вище AI Operating System
- Cron `0 6 * * 1` (щопонеділка) — звірка минулих `ai_predictions`
  з фактичними даними, запис точності (для майбутнього UI
  "наші прогнози справджуються на X%" — довіра будується відкритістю)

#### Крок 3 — UI
- Картки прогнозу на `/dashboard/analytics` і `/dashboard/rank`
  (там, де вже є історичні графіки — прогноз як пунктирне
  продовження лінії тренду, не окрема сторінка)
- **Predictive Planner** — вкладка всередині Qorax AI (не новий
  пункт меню) — дорожня карта як вертикальний список
  `ai_roadmap_milestones` з датами і статусами
- Обов'язково: позначка "оцінка на основі тренду, не гарантія" —
  прозорість про межі точності, щоб не створювати завищених
  очікувань

#### Крок 4 — Обмеження по тарифу
Прогнози (`traffic`/`ranking`) — Growth+; Risk/Opportunity — усі
тарифи (звідси й приходить конверсія на апгрейд, тому дешевше
робити безкоштовним гачком); Predictive Planner (повна дорожня
карта) — Agency, бо споживає найбільше AI-викликів (Planner + Chat +
періодичні прогнози разом).

#### Крок 5 — Готовність до "live"
MVP: тільки **Risk/Opportunity Detection** (найдешевше — перевикористовує
вже наявні детектори, жодної нової ML/статистичної логіки). **Traffic/
Ranking/Revenue Forecast** — друга ітерація, вимагає щонайменше
кілька місяців історичних даних на організацію, щоб екстраполяція
мала сенс (з тижня даних тренд не порахувати чесно). **Predictive
Planner** — остання ітерація, бо технічно є прямим наслідком AI
Operating System (розділ 12) і не має сенсу починати раніше нього.

---

### Підсумок хвилі 4: залежності й порядок

```
Team Workspace ──┐
                  ├─→ AI Operating System (розширення хвилі 3)
Knowledge Graph ──┘         │
                             ├─→ Predictive AI (Risk/Opportunity — рано,
Knowledge Graph ────────────┘    Forecast/Planner — пізно)
                             │
Benchmarking (окремо, потребує критичної маси користувачів,
               не залежить від решти чотирьох технічно)
```
Team Workspace і Knowledge Graph можна починати незалежно одне від
одного й від решти. AI Operating System технічно можливий без них,
але значно слабший (без Knowledge Graph — гірший контекст у Chat,
без Team Workspace — нема кому показувати Activity Feed/Approval).
Benchmarking — єдиний напрямок, заблокований не технічно, а
масштабом бази клієнтів, тому свідомо йде останнім за реальним
календарем, навіть якщо технічно найпростіший з п'яти.

---

## Оновлена загальна послідовність

```
Хвиля 1 (готово):  Rank → AI/Content → Analytics → Sites
Хвиля 2:           Translator → Commerce → CRM → Social → CRO → Academy (Docs — паралельно)
Хвиля 3:           Qorax AI (Chat + Agents + Workspace + Memory + Tasks + Automations)
Хвиля 4 (бачення): Team Workspace + Knowledge Graph (паралельно, незалежно)
                       → AI Operating System (розширення хвилі 3)
                       → Predictive AI: Risk/Opportunity (рано) → Forecast/Planner (пізно)
                       → Benchmarking (окремо, чекає масштабу бази клієнтів)
```
Qorax AI — завжди останній шар хвиль 1-3, бо Chat і Agents всередині
нього є персонами/інтерфейсом над вже готовими модулями хвиль 1-2;
будувати шар оркестрації раніше за модулі, які він оркеструє,
неможливо за визначенням. Поточний Qoraxus (чат на сторінці сайту)
не видаляється і не залишається окремим продуктом — при переході на
Qorax AI він стає контекстним режимом головного Chat, не окремою
системою.

Хвиля 4 — довгостроковий горизонт, детально розписаний вище
(розділи 12-16), не черга завдань на найближчі спринти. Старт хвилі
4 має сенс не раніше, ніж хвилі 1-2 стабільно `live` і монетизуються
(`CHECKOUT_DISABLED` знято), і хвиля 3 має хоча б MVP (Chat + Agents
+ Memory) — усі п'ять напрямків хвилі 4 технічно спираються на це.
