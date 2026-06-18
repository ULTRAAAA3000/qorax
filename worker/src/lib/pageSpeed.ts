// ============================================================
// pageSpeed.ts — интеграция с Google PageSpeed Insights API.
// Бесплатный, без лимита для разумного объёма запросов (квота
// 25,000/день на проект по умолчанию). Даёт реальные Core Web
// Vitals и общий Lighthouse performance score.
// ============================================================

export interface PageSpeedResult {
  available: boolean;
  performanceScore: number | null; // 0-100
  lcpMs: number | null; // Largest Contentful Paint
  inpMs: number | null; // Interaction to Next Paint
  clsScore: number | null; // Cumulative Layout Shift
  errorMessage: string | null;
}

const PAGESPEED_ENDPOINT =
  "https://www.googleapis.com/pagespeedonline/v5/runPagespeed";
const PAGESPEED_TIMEOUT_MS = 25_000; // Lighthouse-сканирование не быстрое

export async function runPageSpeedCheck(
  url: string,
  apiKey: string
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
    endpoint.searchParams.set("strategy", "mobile"); // mobile-first, як і Google індексує
    endpoint.searchParams.append("category", "performance");

    const response = await fetch(endpoint.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      const errorBody = await response.text();
      result.errorMessage = `PageSpeed API повернув помилку ${response.status}`;
      console.error("PageSpeed API error", response.status, errorBody.slice(0, 500));
      return result;
    }

    const data = (await response.json()) as PageSpeedApiResponse;

    const lighthouse = data.lighthouseResult;
    if (!lighthouse) {
      result.errorMessage = "PageSpeed не повернув дані Lighthouse";
      console.error("PageSpeed response missing lighthouseResult", JSON.stringify(data).slice(0, 500));
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
    console.error("PageSpeed check threw", err instanceof Error ? err.message : err);
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
