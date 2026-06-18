# Qorax API Worker

Cloudflare Worker, що обслуговує API Qorax: безкоштовний аудит сайтів
(`POST /api/audit`) та в подальшому — фонові задачі моніторингу.

## Локальна розробка

```bash
npm install
npm run dev
```

Worker піднімається на `http://localhost:8787`.

## Налаштування секретів

Перед першим деплоєм потрібно задати секрети (вони НЕ зберігаються в коді
чи `wrangler.toml`):

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put GOOGLE_PAGESPEED_API_KEY
```

- `SUPABASE_SERVICE_ROLE_KEY` — з Supabase Dashboard → Settings → API → `service_role` key.
  **Ніколи не використовувати anon key тут** — service_role обходить RLS, що потрібно для запису лідів.
- `GEMINI_API_KEY` — з [Google AI Studio](https://aistudio.google.com/apikey), безкоштовний tier.
- `GOOGLE_PAGESPEED_API_KEY` — з [Google Cloud Console](https://console.cloud.google.com/apis/credentials), увімкнути PageSpeed Insights API.

Також потрібно оновити `SUPABASE_URL` у `wrangler.toml` (`[vars]` секція) —
це не секрет, можна редагувати прямо в файлі.

## Деплой

```bash
npm run deploy
```

Після деплою Worker буде доступний на адресі виду
`https://qorax-api.<your-subdomain>.workers.dev`. Цю адресу потрібно
вказати у фронтенді як `NEXT_PUBLIC_API_URL` (Cloudflare Pages →
Settings → Environment variables).

## Структура

- `src/index.ts` — роутинг та оркестрація запитів
- `src/lib/url.ts` — валідація та нормалізація введеної адреси сайту
- `src/lib/basicCheck.ts` — fetch сайту, парсинг title/meta/viewport
- `src/lib/pageSpeed.ts` — інтеграція з Google PageSpeed Insights API
- `src/lib/aiAnalysis.ts` — AI-аналіз через Gemini (з fallback без AI)
- `src/lib/supabase.ts` — запис лідів у Supabase через REST API
