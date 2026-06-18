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
}
