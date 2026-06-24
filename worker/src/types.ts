// ============================================================
// Env — типы переменных окружения и секретов Worker'а.
// Должны совпадать с тем, что задано в wrangler.toml [vars]
// и через `wrangler secret put`.
// ============================================================

export interface Env {
  ENVIRONMENT: string;
  SUPABASE_URL: string;

  // Секреты (задаются через wrangler secret put, не в коде)
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  GOOGLE_PAGESPEED_API_KEY: string;
  RESEND_API_KEY: string;
  // Базовый URL фронтенда — для ссылок в письмах
  APP_URL: string;
  // Stripe
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  // Telegram Bot API токен — для Growth/Agency алертов
  TELEGRAM_BOT_TOKEN: string;
  // Необов'язковий секрет для верифікації webhook-запитів від Telegram
  // (задається при `wrangler secret put TELEGRAM_WEBHOOK_SECRET` і при setWebhook)
  TELEGRAM_WEBHOOK_SECRET?: string;
  // LemonSqueezy
  LS_WEBHOOK_SECRET: string;     // Signing secret з LS Dashboard → Webhooks
  LS_API_KEY: string;            // API key для server-side операцій (portal URL etc.)
  LS_STORE_ID: string;           // Store ID з LS Dashboard

  // Токен для захищених admin-ендпоінтів
  ADMIN_TOKEN: string;
  // Окремий Gemini ключ для інтерактивного чату (Growth-фіча).
  // Якщо не заданий — fallback на GEMINI_API_KEY.
  GEMINI_CHAT_API_KEY?: string;
}
