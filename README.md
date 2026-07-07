# Qorax

Технічний моніторинг та підтримка сайтів для малого бізнесу та агентств.

Qorax стежить за швидкістю, безпекою, SEO та доступністю сайту 24/7, пояснює
знайдені проблеми простою мовою через AI та перекладає їх у грошовий вплив —
замість сухих технічних звітів, які ніхто не розуміє.

## Стек

- **Frontend / хостинг** — Next.js, Cloudflare Pages
- **Backend** — Cloudflare Workers + Queues/Cron (фонові перевірки)
- **База даних** — Supabase (Postgres + Auth)
- **AI** — Google Gemini API
- **Оплати** — Stripe
- **Email** — Resend

## Розробка

```bash
npm install
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000).

## Структура

- `app/` — Next.js App Router, сторінки та компоненти лендінгу
- `worker/` — Cloudflare Worker API (безкоштовний аудит, надалі — моніторинг). Деплоїться окремо, див. `worker/README.md`

## Платформа

Qorax росте з продукту моніторингу в платформу з кількох модулів
(Audit, Sites, AI, Content, Rank, Analytics). Архітектура цього
переходу — реєстр модулів, RLS, catch-all заглушки, тимчасове
відключення checkout — описана в [`PLATFORM.md`](./PLATFORM.md).
- `supabase/migrations/` — SQL-міграції схеми бази даних, застосовуються по порядку (0001 → ...)
