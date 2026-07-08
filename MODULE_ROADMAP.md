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
