# Qorax — Deployment Checklist

Зведений, актуальний список усіх ручних дій, які накопичились у
`EXECUTION_PLAN.md` і потребують дій Артема поза кодом (Supabase
Dashboard, Cloudflare Dashboard, Google Cloud Console). Кожна сесія
(включно з паралельними) додає код і документує потребу в ручній дії
в `EXECUTION_PLAN.md`, але сам список ручних дій ніде не збирався в
одному місці — цей файл саме для цього.

**Це знімок стану на момент написання, не автоматично оновлюваний
документ.** Джерело істини для деталей кожного пункту —
відповідний запис в `EXECUTION_PLAN.md`, тут лише короткий опис і
посилання "чому це потрібно". Коли пункт зроблено — витри його
звідси (чи познач ✅), не лишай як false-негатив для майбутніх
сесій.

---

## 1. Supabase-міграції, ще не накочені (0063–0081)

**Найкритичніше — без цього більшість нового коду з останніх сесій
не працює взагалі, навіть якщо код на проді.** Застосовувати
послідовно за номером (стандартний `supabase db push` чи ручний
запуск кожного файлу в SQL Editor). Дублікат номера `0075`
(`creator_components_brand_kit.sql` і `office_slides.sql`) —
історична колізія найменування файлів (як і раніші `0018`/`0020`/
`0061`), не впливає на порядок застосування: обидва файли незалежні,
можна застосувати в будь-якому порядку між собою.

| Файл | Що додає | Якщо не застосовано |
|---|---|---|
| `0063_orders_coupon_reference.sql` | `orders.coupon_id` — купон рахується при оплаті, не при checkout | Insert замовлення з купоном впаде |
| `0064_analytics_module.sql` | GA4-модуль (Analytics) | `/dashboard/analytics` не працює |
| `0065_knowledge_graph.sql` | `kg_nodes`/`kg_edges` | Knowledge Graph, Diagram Mode в Creator, AI Chat контекст — усе мовчки деградує |
| `0066_ai_predictions.sql` | `ai_predictions` (Predictive AI) | Детектори тихо нічого не пишуть, `/dashboard/sites/[id]` вкладка "AI Прогнози" порожня |
| `0067_academy_more_courses.sql` | 4 нові курси Academy (5 замість 1) | Каталог і далі показує тільки 1 курс |
| `0068_team_workspace.sql` | Team Workspace (задачі/коментарі) | `/dashboard/team` не працює |
| `0069_benchmarking.sql` | Benchmarking модуль | `/dashboard/benchmark` не працює |
| `0070_ai_inbox.sql` | AI Inbox (AI Operating System MVP) | `/dashboard/home` AI Inbox порожній |
| `0071_creator_canvas.sql` | `canvas_boards`/`canvas_nodes` (Website Mode) | Весь `/creator` не працює — жодну дошку не створити |
| `0072_office_docs.sql` | Office Docs MVP | `/office` не працює |
| `0073_office_templates.sql` | Office шаблони документів | Бібліотека шаблонів `/office` порожня |
| `0074_browser_workspace.sql` | Browser history (MVP) | `/browser` частково не працює |
| `0075_creator_components_brand_kit.sql` | `creator_brand_kits`/`creator_components` | `/creator/components` не працює |
| `0075_office_slides.sql` | Office Slides MVP | `/office/slides` не працює |
| `0076_office_sheets.sql` | Office Sheets MVP | `/office/sheets` не працює |
| `0077_browser_collections.sql` | Browser Collections | Collections у `/browser` не працюють |
| `0078_mail_core.sql` | Qorax Mail (Inbox/Compose/Contacts) | Весь `/mail` не працює |
| `0079_creator_smart_components.sql` | `bound_ref_table`/`bound_ref_id`/`field_bindings` на `canvas_nodes` | Smart Components в Creator не працюють |
| `0080_creator_history.sql` | `canvas_node_versions` (History) | Кнопка "Історія" в Creator не працює |
| `0081_browser_workspace_tabs.sql` | Workspace Tabs — групування вкладок у проєкти | Workspace Tabs у `/browser` не працюють |
| `0082_ai_product_toggles.sql` | `ai_product_toggles` — адмінський вимикач AI по продуктах (Business/Mail/Creator/Office/Browser) | `/dashboard/admin` AI-тумблери не працюють; `checkAiCredits()` за замовчуванням fail-open (AI лишається доступним, не блокером) |
| `0083_office_version_history.sql` | `office_document_versions` — Version History для Docs/Sheets/Slides (append-only знімки, узагальнена схема на всі три редактори) | Кнопка "Історія версій" у `/office`, `/office/sheets/[id]`, `/office/slides/[id]` не працює |

---

## 2. Cloudflare Dashboard — Cron Triggers

Акаунт не дозволяє керувати `[triggers]` через `wrangler.toml`
(задокументовано прямо в файлі: "Cloudflare API не дозволяє їх
оновлювати через wrangler в цьому акаунті") — усі розклади нижче
мають бути додані вручну в Cloudflare Dashboard → Worker
`qorax-api` → Settings → Triggers → Cron Triggers. Список зібраний
з фактичних `event.cron === "..."` перевірок у
`worker/src/index.ts::scheduled()`, плюс одна безумовна fallback-
гілка в кінці функції (нема свого `if`, спрацьовує для будь-якого
cron-виклику, що не підійшов під жоден з попередніх) — якщо тригера
нема в Dashboard, відповідний код ніколи не виконується.

| Розклад | Що виконує |
|---|---|
| `*/5 * * * *` | Кожні 5 хв — Uptime + SSL перевірки (fallback-гілка без явного `if`, критичний для базового моніторингу — без цього тригера Uptime/SSL не працюють ВЗАГАЛІ) |
| `0 3 * * *` | Щоденно о 3:00 — Speed/SEO/Competitor checks, GSC/GA4 sync, Automations, **Predictive AI детектори** |
| `0 4 1 * *` | Першого числа щомісяця о 4:00 — генерація місячних PDF-звітів |
| `0 5 * * *` | Щоденно о 5:00 — expire trials, email-нагадування; по понеділках додатково weekly digest |
| `30 4 * * 0` | Щонеділі о 4:30 — перевірка битих посилань |
| `* * * * *` | Щохвилини — Social publish |
| `*/10 * * * *` | Кожні 10 хв — CRO aggregate, **Mail sync** |
| `0 * * * *` | Щогодини — CRM-нагадування |

**Це найважливіший рядок у всій таблиці:** `*/5 * * * *` не має
власного `if (event.cron === ...)` — це остання, безумовна гілка
`scheduled()`. Якщо ЦЕЙ тригер не додано в Cloudflare Dashboard,
базовий Uptime/SSL моніторинг (те, з чого Qorax почався) не працює
зовсім, незалежно від решти тригерів.

---

## 3. Cloudflare Dashboard — Secrets

Задаються через `wrangler secret put <NAME>` чи напряму в Dashboard
→ Worker → Settings → Variables (Secret). Список зібраний з усіх
`env.XXX` звернень у `worker/src/`. Позначка певності — чи є
конкретна документована згадка "ще не зроблено" в
`EXECUTION_PLAN.md`, не гарантія поточного стану Dashboard (немає
доступу перевірити напряму).

| Секрет | Для чого | Статус |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Базовий доступ до БД | ⚠️ Ймовірно вже є (платформа працює) |
| `GEMINI_API_KEY`, `GEMINI_CHAT_API_KEY` | AI-генерація (Content Agent, Chat, Creator AI Collaboration) | ⚠️ Ймовірно вже є |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY` | OAuth для GSC/GA4/**Mail (Gmail API)** | ⚠️ Ймовірно вже є для GSC/GA4 — **перевір застосовується коректно і до Mail** (той самий secret, новий scope, див. розділ 4 нижче) |
| `GOOGLE_PAGESPEED_API_KEY` | Швидкість сайтів | ⚠️ Ймовірно вже є |
| `LS_API_KEY`, `LS_STORE_ID`, `LS_WEBHOOK_SECRET` | LemonSqueezy платежі | ⚠️ Ймовірно вже є |
| `LS_COMMERCE_VARIANT_ID` | Commerce checkout | 🔴 Задокументовано як "ще не зроблено" в попередніх записах |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | Social OAuth-токени | 🔴 Задокументовано як "ще не зроблено" в попередніх записах |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Telegram-бот (Social/CRM) | ⚠️ Ймовірно вже є |
| `RESEND_API_KEY` | Транзакційні email (не Qorax Mail, а системні листи Qorax) | ⚠️ Ймовірно вже є |
| `ADMIN_TOKEN` | `/dashboard/admin` захист | ⚠️ Ймовірно вже є |
| `OWNER_EMAIL`, `OWNER_TELEGRAM_CHAT_ID` | Сповіщення власнику Qorax | ⚠️ Ймовірно вже є |
| `APP_URL`, `API_BASE_URL` | Redirect URI, install-сніпети | ⚠️ Опціональні (мають fallback у коді) |

---

## 4. Google Cloud Console — окремо від Cloudflare

**Це не Cloudflare Dashboard і легко пропустити.** Qorax Mail
(`mailHandler.ts`) використовує Gmail API з scope `gmail.readonly` +
`gmail.send`. Обидва — "restricted scopes" за класифікацією Google,
що типово вимагає:

1. Gmail API увімкнено в тому самому Google Cloud проєкті, що вже
   видає `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` для GSC/GA4
2. OAuth consent screen додатково пройшов verification review від
   Google для цих scope (може тривати дні-тижні з боку Google) —
   без цього сторонні користувачі (не власник проєкту в Google
   Cloud Console) бачитимуть попередження "unverified app" при
   спробі підключити Gmail-акаунт до Qorax Mail
3. Redirect URI для Mail OAuth flow додано до дозволених у Google
   Cloud Console (той самий список, де вже є GSC/GA4 redirect URIs)

**Перевір це першим, якщо Qorax Mail після накочування `0078` все
одно не дає підключити Gmail-акаунт** — найімовірніша причина не в
коді чи Supabase, а саме тут.

---

## 5. `/dashboard/admin` — модулі, ще `coming_soon`

Статус `platform_modules.status` встановлюється при реєстрації
модуля (`coming_soon` за замовчуванням) і перемикається на `live`
вручну через `/dashboard/admin` після особистої перевірки Артема.
Нижче — модулі, чиї міграції реєструють їх як `coming_soon`
(перевіряй актуальний стан у самому `/dashboard/admin`, цей список
відображає лише те, з яким статусом їх ЗАРЕЄСТРОВАНО спочатку, не
поточний стан після можливих ручних перемикань):

- `sites` — Sites-конструктор
- `crm` — CRM
- `social` — Social
- `academy` — Academy
- `cro` — CRO
- `translator` — Translator
- `commerce` — Commerce
- `team` — Team Workspace
- `benchmark` — Benchmarking

(`audit` вже `live` за замовчуванням — основний Dashboard.)

**Qorax Creator, Office, Browser, Mail НЕ в цьому списку** — вони
навмисно НЕ модулі `platform_modules` (окремі топ-левел продукти,
задокументовано в `MODULE_ROADMAP.md`), нема чого перемикати в
адмінці для них.

---

## 6. Домен

Custom Hostnames для Sites-конструктора (публікація клієнтських
сайтів на власному домені, не тільки `workers.dev`) — заблокований
пункт, задокументований раніше в `EXECUTION_PLAN.md`
("Custom Hostnames для Sites-конструктора — ВІДКЛАДЕНО"): вимагає
власної Cloudflare-зони (купленого домену), якого поки немає.
Не змінюється цим чек-листом — просто нагадування, що це відкрито.

---

## 7. Токени, показані в чаті

Кожного разу, коли GitHub PAT чи Cloudflare API token з'являється
відкритим текстом у переписці з Claude (навіть ненавмисно) —
перевипусти (regenerate) його. Це траплялось кілька разів за історію
проєкту.
