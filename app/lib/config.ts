// ============================================================
// config.ts — конфигурация фронтенда.
// API_BASE_URL берётся из переменной окружения, чтобы можно было
// указать разные адреса для разработки/продакшена без правки кода.
// На Cloudflare Pages эта переменная задаётся в Settings → Environment
// variables как NEXT_PUBLIC_API_URL.
// ============================================================

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8787";
