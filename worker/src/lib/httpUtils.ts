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
