// ============================================================
// httpUtils.ts — спільні хелпери для зовнішніх fetch-запитів у
// checker-модулях (seoChecker, brokenLinksChecker, competitorChecker
// і т.д.), які скачують сторінки клієнтських сайтів.
//
// Раніше кожен checker писав свою копію "AbortController + setTimeout
// + fetch з User-Agent + clearTimeout" з дещо різними значеннями
// timeout/User-Agent. Тут — тільки два найбільш точно співпадаючі
// варіанти цього патерну (з seoChecker.ts і brokenLinksChecker.ts);
// інші checker'и (competitorChecker, formChecker, urlSpeedChecker)
// мають додаткову специфічну логіку (вимірювання часу, власні
// повідомлення помилок) і навмисно залишені без змін.
// ============================================================

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; QoraxBot/1.0; +https://qorax.com/bot)";

// ------------------------------------------------------------
// json() — єдиний JSON-response helper. Закриває Фазу 0.2 з
// EXECUTION_PLAN.md: раніше ця функція була продубльована майже
// ідентично у 8 файлах (index.ts, businessMetrics.ts,
// contentGeneration.ts, fixRequestHandler.ts, gscHandler.ts,
// rankHandler.ts, referralHandler.ts, teamHandler.ts) з двома
// різними сигнатурами — одні приймали `origin: string | null` і самі
// викликали corsHeaders(origin) всередині, інші приймали вже готовий
// `headers: Record<string, string>`. Щоб не ламати наявні виклики в
// старих файлах (вони лишаються як є — рефакторинг наявного коду не
// є цілью цього проходу, тільки нові файли), нижче — обидва варіанти
// в одній функції через перевантаження за типом другого аргументу.
// НОВІ handler-файли (Translator, Commerce, CRM...) імпортують ЦЮ
// функцію замість написання власної копії.
//
// cors.ts нічого не імпортує з httpUtils.ts, тож звичайний static
// import тут безпечний — циклічної залежності немає.
// ------------------------------------------------------------

import { corsHeaders } from "./cors";

/** Проста CORS-обгортка для варіанту headers: Record<string,string> — очікує, що заголовки (включно з CORS) уже сформовані викликачем. */
export function json(data: unknown, status: number, headers: Record<string, string>): Response;
/** Варіант origin: string | null — сам формує CORS-заголовки через уже наявний corsHeaders() з cors.ts. */
export function json(data: unknown, status: number, origin: string | null): Response;
export function json(
  data: unknown,
  status: number,
  headersOrOrigin: Record<string, string> | string | null
): Response {
  const headers: Record<string, string> =
    headersOrOrigin === null || typeof headersOrOrigin === "string"
      ? corsHeaders(headersOrOrigin)
      : headersOrOrigin;

  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}


/** Fetch з timeout, повертає сирий Response (як у seoChecker.ts). */
export async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  userAgent: string = DEFAULT_USER_AGENT
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": userAgent },
    });
  } finally {
    clearTimeout(t);
  }
}

/** Fetch з timeout, кидає при !ok, повертає text() (як у brokenLinksChecker.ts fetchHtml). */
export async function fetchTextWithTimeout(
  url: string,
  timeoutMs: number,
  userAgent: string = DEFAULT_USER_AGENT
): Promise<string> {
  const resp = await fetchWithTimeout(url, timeoutMs, userAgent);
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return await resp.text();
}

/** Нормалізує URL до "protocol//host" (без шляху) — як normalizeBaseUrl/normalizeBase. */
export function normalizeToOrigin(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}
