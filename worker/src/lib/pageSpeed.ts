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
// ============================================================

export interface PageSpeedResult {
  available: boolean;
  performanceScore: number | null; // 0-100
  lcpMs: number | null; // Largest Contentful Paint
  inpMs: number | null; // Interaction to Next Paint
  clsScore: number | null; // Cumulative Layout Shift
  errorMessage: string | null;
}

export interface PageSpeedDualResult {
  mobile: PageSpeedResult;
  desktop: PageSpeedResult;
}

const PAGESPEED_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PAGESPEED_TIMEOUT_MS = 25_000; // Lighthouse-сканирование не быстрое

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
    runSinglePageSpeedCheck(url, apiKey, "mobile"),
    runSinglePageSpeedCheck(url, apiKey, "desktop"),
  ]);

  return { mobile, desktop };
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
      console.error("PageSpeed response missing lighthouseResult", strategy, JSON.stringify(data).slice(0, 500));
      return result;
    }

    result.available = true;
    result.performanceScore = Math.round((lighthouse.categories.performance?.score ?? 0) * 100);
    result.lcpMs = lighthouse.audits["largest-contentful-paint"]?.numericValue ?? null;
    result.inpMs =
      lighthouse.audits["interaction-to-next-paint"]?.numericValue ??
      lighthouse.audits["max-potential-fid"]?.numericValue ??
      null;
    result.clsScore = lighthouse.audits["cumulative-layout-shift"]?.numericValue ?? null;
  } catch (err) {
    result.errorMessage =
      err instanceof Error && err.name === "AbortError"
        ? "PageSpeed-перевірка тривала занадто довго"
        : "Не вдалося отримати дані PageSpeed";
    console.error("PageSpeed check threw", strategy, err instanceof Error ? err.message : err);
  }

  return result;
}

// Типы только для нужных нам полей ответа PageSpeed API (он возвращает намного больше)
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
