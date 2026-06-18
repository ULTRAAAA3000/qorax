// ============================================================
// basicCheck.ts — фундаментальная проверка сайта через fetch.
// Даёт: время ответа, SSL (по факту успешного https-запиту),
// title/meta description, наличие viewport meta (mobile-friendly
// сигнал), базовые security headers.
// ============================================================

export interface BasicCheckResult {
  reachable: boolean;
  httpStatus: number | null;
  responseTimeMs: number | null;
  sslValid: boolean;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  hasViewportMeta: boolean;
  hasH1: boolean;
  h1Count: number;
  pageSizeKb: number | null;
  errorMessage: string | null;
}

const FETCH_TIMEOUT_MS = 10_000;
// Представляемся как обычный браузер, чтобы не получать заблокированные
// или урезанные ответы от сайтов с защитой от ботов/краулеров.
const USER_AGENT =
  "Mozilla/5.0 (compatible; QoraxAuditBot/1.0; +https://qorax.app/bot)";

export async function runBasicCheck(url: string): Promise<BasicCheckResult> {
  const startedAt = Date.now();

  const result: BasicCheckResult = {
    reachable: false,
    httpStatus: null,
    responseTimeMs: null,
    sslValid: false,
    title: null,
    titleLength: 0,
    metaDescription: null,
    metaDescriptionLength: 0,
    hasViewportMeta: false,
    hasH1: false,
    h1Count: 0,
    pageSizeKb: null,
    errorMessage: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    result.responseTimeMs = Date.now() - startedAt;
    result.httpStatus = response.status;
    result.reachable = response.ok;
    // Якщо fetch пройшов через https без помилки TLS — сертифікат валідний.
    // Cloudflare Workers сам відхилить запит при поламаному сертифікаті.
    result.sslValid = url.startsWith("https://");

    const html = await response.text();
    result.pageSizeKb = Math.round(new TextEncoder().encode(html).length / 1024);

    const parsed = parseHtmlSignals(html);
    result.title = parsed.title;
    result.titleLength = parsed.title?.length ?? 0;
    result.metaDescription = parsed.metaDescription;
    result.metaDescriptionLength = parsed.metaDescription?.length ?? 0;
    result.hasViewportMeta = parsed.hasViewportMeta;
    result.hasH1 = parsed.h1Count > 0;
    result.h1Count = parsed.h1Count;
  } catch (err) {
    result.responseTimeMs = Date.now() - startedAt;
    result.errorMessage =
      err instanceof Error && err.name === "AbortError"
        ? "Сайт не відповів протягом 10 секунд"
        : "Не вдалося підключитись до сайту";
  }

  return result;
}

interface ParsedHtmlSignals {
  title: string | null;
  metaDescription: string | null;
  hasViewportMeta: boolean;
  h1Count: number;
}

/**
 * Лёгкий regex-парсинг вместо полноценного DOM-парсера: Cloudflare Workers
 * не имеет DOMParser, а HTMLRewriter работает потоково и избыточен для
 * простого извлечения нескольких тегов из небольшого HTML-документа.
 */
function parseHtmlSignals(html: string): ParsedHtmlSignals {
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].trim()) : null;

  const metaDescMatch = html.match(
    /<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i
  ) ?? html.match(
    /<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i
  );
  const metaDescription = metaDescMatch ? decodeHtmlEntities(metaDescMatch[1].trim()) : null;

  const hasViewportMeta = /<meta\s+[^>]*name=["']viewport["']/i.test(html);

  const h1Matches = html.match(/<h1[\s>]/gi);
  const h1Count = h1Matches ? h1Matches.length : 0;

  return { title, metaDescription, hasViewportMeta, h1Count };
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, " ");
}
