// ============================================================
// pageSpeed.ts — интеграция с Google PageSpeed Insights API.
// Бесплатный, без лимита для разумного объёма запросов (квота
// 25,000/день на проект по умолчанию). Даёт реальные Core Web
// Vitals и общий Lighthouse performance score.
//
// Гоняем mobile И desktop раздельно — это два разных Lighthouse-
// прогона з різними throttling-профілями (Google емулює мобільний
// CPU/мережу для mobile), тому показники відрізняються суттєво
// (типово desktop score вищий) і показувати лише один з них
// дезорієнтує власника сайту, який дивиться на нього з ПК.
//
// RETRY: PageSpeed API часто падает с 500/503 на первом холодном
// запросе (Lighthouse-сессия ещё не прогрета). Используем
// exponential backoff: 2 повторные попытки с задержкой 2s → 4s.
// Это убирает необходимость нажимать "проверить ещё раз" вручную.
// ============================================================

export interface PageSpeedResult {
  available: boolean;
  performanceScore: number | null; // 0-100
  lcpMs: number | null;            // Largest Contentful Paint
  inpMs: number | null;            // Interaction to Next Paint
  clsScore: number | null;         // Cumulative Layout Shift
  errorMessage: string | null;
}

export interface PageSpeedDualResult {
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
}

const PAGESPEED_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PAGESPEED_TIMEOUT_MS = 25_000; // Lighthouse не швидкий, але треба вкластись в Worker limit
const RETRY_DELAYS_MS = [1_500, 3_000]; // швидші повторні спроби
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1; // 3 спроби всього

/**
 * Запускає mobile і desktop перевірки паралельно (Promise.all) — це два
 * незалежні запити до Google API, паралельність економить ~10-20с
 * порівняно з послідовним виконанням і не створює жодних додаткових
 * проблем з квотою (рахується однаково, просто два окремих запити).
 */
export async function runPageSpeedChecks(
  url: string,
  apiKey: string
): Promise<PageSpeedDualResult> {
  const [mobile, desktop] = await Promise.all([
    runSinglePageSpeedCheckWithRetry(url, apiKey, "mobile"),
    runSinglePageSpeedCheckWithRetry(url, apiKey, "desktop"),
  ]);

  return { mobile, desktop };
}

/**
 * Обёртка с retry-логикой вокруг runSinglePageSpeedCheck.
 * Повторяем при HTTP 5xx или при отсутствии lighthouseResult —
 * оба случая это временный сбой на стороне Google API, не ошибка
 * входных данных (для которых сразу возвращаем ошибку без retry).
 */
async function runSinglePageSpeedCheckWithRetry(
  url: string,
  apiKey: string,
  strategy: "mobile" | "desktop"
): Promise<PageSpeedResult> {
  let lastResult: PageSpeedResult | null = null;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      // Ждём перед повторной попыткой
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }

    const result = await runSinglePageSpeedCheck(url, apiKey, strategy);

    if (result.available) {
      console.log(`PageSpeed ${strategy} success on attempt ${attempt + 1}`);
      return result;
    }

    lastResult = result;

    // Если ошибка явно не серверная (например, невалидный URL или
    // заблокированный сайт) — нет смысла ретраить
    if (result.errorMessage && isNonRetryableError(result.errorMessage)) {
      break;
    }

    console.warn(
      `PageSpeed ${strategy} attempt ${attempt + 1}/${MAX_ATTEMPTS} failed: ${result.errorMessage}`
    );
  }

  return lastResult!;
}

/**
 * Ошибки, при которых повтор не поможет: таймаут самого fetch,
 * явные 4xx (неверный URL/ключ), или конкретное сообщение о недоступности
 * целевого сайта — в отличие от 500/503 на стороне Google API.
 */
function isNonRetryableError(errorMessage: string): boolean {
  return (
    errorMessage.includes("занадто довго") || // AbortError / timeout
    errorMessage.includes("400") ||
    errorMessage.includes("401") ||
    errorMessage.includes("403") ||
    errorMessage.includes("404")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSinglePageSpeedCheck(
  url: string,
  apiKey: string,
  strategy: "mobile" | "desktop"
): Promise<PageSpeedResult> {
  const result: PageSpeedResult = {
    available: false,
    performanceScore: null,
    lcpMs: null,
    inpMs: null,
    clsScore: null,
    errorMessage: null,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PAGESPEED_TIMEOUT_MS);

    const endpoint = new URL(PAGESPEED_ENDPOINT);
    endpoint.searchParams.set("url", url);
    endpoint.searchParams.set("key", apiKey);
    endpoint.searchParams.set("strategy", strategy);
    endpoint.searchParams.append("category", "performance");

    const response = await fetch(endpoint.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      result.errorMessage = `PageSpeed API повернув помилку ${response.status}`;
      console.error("PageSpeed API error", strategy, response.status, errorBody.slice(0, 500));
      return result;
    }

    const data = (await response.json()) as PageSpeedApiResponse;

    const lighthouse = data.lighthouseResult;
    if (!lighthouse) {
      result.errorMessage = "PageSpeed не повернув дані Lighthouse";
      console.error(
        "PageSpeed response missing lighthouseResult",
        strategy,
        JSON.stringify(data).slice(0, 500)
      );
      return result;
    }

    result.available = true;
    result.performanceScore = Math.round(
      (lighthouse.categories.performance?.score ?? 0) * 100
    );
    result.lcpMs =
      lighthouse.audits["largest-contentful-paint"]?.numericValue ?? null;
    result.inpMs =
      lighthouse.audits["interaction-to-next-paint"]?.numericValue ??
      lighthouse.audits["max-potential-fid"]?.numericValue ??
      null;
    result.clsScore =
      lighthouse.audits["cumulative-layout-shift"]?.numericValue ?? null;
  } catch (err) {
    result.errorMessage =
      err instanceof Error && err.name === "AbortError"
        ? "PageSpeed-перевірка тривала занадто довго"
        : "Не вдалося отримати дані PageSpeed";
    console.error(
      "PageSpeed check threw",
      strategy,
      err instanceof Error ? err.message : err
    );
  }

  return result;
}

// Типы только для нужных нам полей ответа PageSpeed API
interface PageSpeedApiResponse {
  lighthouseResult?: {
    categories: {
      performance?: { score: number };
    };
    audits: {
      [auditId: string]: { numericValue?: number } | undefined;
    };
  };
}
