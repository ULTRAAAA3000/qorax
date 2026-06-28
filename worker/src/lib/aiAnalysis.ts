// ============================================================
// aiAnalysis.ts — превращает собранные технические данные в
// понятные простому человеку выводы + оценку Revenue Impact.
// Использует бесплатный tier Google Gemini API.
// ============================================================

import type { BasicCheckResult } from "./basicCheck";
import type { PageSpeedResult } from "./pageSpeed";

export interface AiFinding {
  severity: "critical" | "warning" | "info";
  problemSummary: string;
  plainExplanation: string;
  estimatedMonthlyLossUsd: number | null;
  recommendation: string;
}

export interface AiAnalysisResult {
  findings: AiFinding[];
  overallSummary: string;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 15_000;

export async function runAiAnalysis(
  hostname: string,
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult,
  apiKey: string
): Promise<AiAnalysisResult> {
  const prompt = buildPrompt(hostname, basic, pageSpeed);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const response = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          responseMimeType: "application/json",
        },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return fallbackAnalysis(basic, pageSpeed);
    }

    const data = (await response.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return fallbackAnalysis(basic, pageSpeed);
    }

    const parsed = JSON.parse(text) as AiAnalysisResult;
    if (!Array.isArray(parsed.findings)) {
      return fallbackAnalysis(basic, pageSpeed);
    }

    return parsed;
  } catch {
    return fallbackAnalysis(basic, pageSpeed);
  }
}

function buildPrompt(
  hostname: string,
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult
): string {
  return `Ти — технічний аудитор сайтів, який пояснює проблеми власникам малого бізнесу без технічного жаргону.
Аналізуй дані нижче про сайт ${hostname} та поверни ЛИШЕ валідний JSON (без markdown, без пояснень навколо) у такому форматі:

{
  "overallSummary": "одне речення про загальний стан сайту українською",
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "problemSummary": "коротко що знайдено, українською",
      "plainExplanation": "пояснення простою мовою без техн. жаргону, 1-2 речення, українською",
      "estimatedMonthlyLossUsd": число або null якщо неможливо оцінити,
      "recommendation": "що конкретно зробити, 1 речення, українською"
    }
  ]
}

Дані сайту:
- Час відповіді: ${basic.responseTimeMs ?? "невідомо"} мс
- HTTP статус: ${basic.httpStatus ?? "немає відповіді"}
- SSL: ${basic.sslValid ? "діє" : "відсутній або невалідний"}
- Title сторінки: "${basic.title ?? "відсутній"}" (довжина ${basic.titleLength} символів)
- Meta description: "${basic.metaDescription ?? "відсутній"}" (довжина ${basic.metaDescriptionLength} символів)
- Viewport meta (мобільна адаптація): ${basic.hasViewportMeta ? "є" : "відсутній"}
- Кількість H1 заголовків: ${basic.h1Count}
- Розмір сторінки: ${basic.pageSizeKb ?? "невідомо"} КБ
- PageSpeed score: ${pageSpeed.performanceScore ?? "недоступний"}/100
- LCP (швидкість основного контенту): ${pageSpeed.lcpMs ? Math.round(pageSpeed.lcpMs) : "невідомо"} мс
- CLS (стабільність верстки): ${pageSpeed.clsScore ?? "невідомо"}

Дай максимум 4 findings, тільки реальні проблеми з даних вище. Якщо даних замало для оцінки втрат у $ — поставь null, не вигадуй число.`;
}

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

/**
 * Запасной вариант без AI — на случай если Gemini недоступен/превышен лимит.
 * Простые правила вместо умного анализа, чтобы пользователь не остался без ответа.
 */
function fallbackAnalysis(
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult
): AiAnalysisResult {
  const findings: AiFinding[] = [];

  if (!basic.sslValid) {
    findings.push({
      severity: "critical",
      problemSummary: "Відсутній або невалідний SSL-сертифікат",
      plainExplanation:
        "Браузери показують відвідувачам попередження про небезпеку, що відштовхує більшість з них.",
      estimatedMonthlyLossUsd: null,
      recommendation: "Встановіть SSL-сертифікат якнайшвидше — це базова вимога безпеки.",
    });
  }

  if (pageSpeed.available && (pageSpeed.performanceScore ?? 100) < 50) {
    findings.push({
      severity: "warning",
      problemSummary: "Низька швидкість завантаження сторінки",
      plainExplanation:
        "Повільний сайт втрачає частину відвідувачів, які закривають вкладку не дочекавшись завантаження.",
      estimatedMonthlyLossUsd: null,
      recommendation: "Оптимізуйте зображення та підключіть кешування.",
    });
  }

  if (!basic.metaDescription) {
    findings.push({
      severity: "info",
      problemSummary: "Відсутній meta description",
      plainExplanation: "Google показує випадковий текст у пошуковій видачі замість продуманого опису.",
      estimatedMonthlyLossUsd: null,
      recommendation: "Додайте meta description 120-160 символів на кожну важливу сторінку.",
    });
  }

  if (!basic.hasH1) {
    findings.push({
      severity: "info",
      problemSummary: "Відсутній заголовок H1",
      plainExplanation: "Пошукові системи гірше розуміють, про що сторінка, без чіткого H1.",
      estimatedMonthlyLossUsd: null,
      recommendation: "Додайте один чіткий H1 заголовок на сторінку.",
    });
  }

  return {
    overallSummary: findings.length
      ? "Знайдено кілька проблем, які варто виправити."
      : "Базові перевірки пройдено без критичних проблем.",
    findings,
  };
}
