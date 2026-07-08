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
