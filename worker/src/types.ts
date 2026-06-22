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
  // Telegram Bot API токен — для Growth/Agency алертов
  TELEGRAM_BOT_TOKEN: string;
  // Необов'язковий секрет для верифікації webhook-запитів від Telegram
  // (задається при `wrangler secret put TELEGRAM_WEBHOOK_SECRET` і при setWebhook)
  TELEGRAM_WEBHOOK_SECRET?: string;
  // Токен для захищених admin-ендпоінтів
  ADMIN_TOKEN: string;
}
