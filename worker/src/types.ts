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
  // KV namespace для rate limiting публічних ендпоінтів
  RATE_LIMIT_KV: KVNamespace;

  // Telegram Bot API токен — для Growth/Agency алертов
  TELEGRAM_BOT_TOKEN: string;
  // Необов'язковий секрет для верифікації webhook-запитів від Telegram
  // (задається при `wrangler secret put TELEGRAM_WEBHOOK_SECRET` і при setWebhook)
  TELEGRAM_WEBHOOK_SECRET?: string;
  // Особисті контакти власника студії — для сповіщень про нові
  // "Замовити виправлення" заявки (fixRequestHandler.ts). Не плутати
  // з клієнтськими notification_settings — це фіксовані контакти
  // власника Qorax, задаються один раз через wrangler secret put.
  OWNER_EMAIL?: string;
  OWNER_TELEGRAM_CHAT_ID?: string;
  // LemonSqueezy
  LS_WEBHOOK_SECRET: string;     // Signing secret з LS Dashboard → Webhooks
  LS_API_KEY: string;            // API key для server-side операцій (portal URL etc.)
  LS_STORE_ID: string;           // Store ID з LS Dashboard
  LS_COMMERCE_VARIANT_ID?: string; // Universal "Commerce Order" variant для Checkouts API з custom_price (Commerce-модуль, товари клієнтів створюються динамічно, не мають власного variant у LS Dashboard)

  // Токен для захищених admin-ендпоінтів
  ADMIN_TOKEN: string;
  // Окремий Gemini ключ для інтерактивного чату (Growth-фіча).
  // Якщо не заданий — fallback на GEMINI_API_KEY.
  GEMINI_CHAT_API_KEY?: string;
  // Google OAuth для GSC інтеграції
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_TOKEN_ENCRYPTION_KEY: string; // 32 hex chars (16 bytes)
  SOCIAL_TOKEN_ENCRYPTION_KEY?: string; // 32 hex chars (16 bytes) — окремий ключ для social_connections.encrypted_bot_token, не змішувати з Google OAuth-токенами. Optional — handler перевіряє наявність і повертає 503, якщо не налаштовано (Артему потрібно додати secret у Cloudflare Dashboard)
  API_BASE_URL?: string; // публічна адреса qorax-api worker-а, для генерації клієнтського CRO-сніпета (croHandler.ts). Optional — fallback на відомий продакшн-URL, якщо не задано
}