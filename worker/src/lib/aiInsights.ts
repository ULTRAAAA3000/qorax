// ============================================================
// aiInsights.ts — генерация AI-инсайтов для сайта и сохранение
// в таблицу ai_insights. Вызывается после ежедневного speed-скана.
//
// Логика кеширования:
// - Перед генерацией помечаем старые инсайты is_resolved=true
//   (они остаются в истории, но не показываются на дашборде).
// - Новые инсайты добавляем свежие на основании сегодняшних данных.
// - Это позволяет хранить историю "было найдено" и не дублировать.
// ============================================================

import type { BasicCheckResult } from "./basicCheck";
import type { PageSpeedResult } from "./pageSpeed";
import { insertRow, updateRows } from "./supabase";

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;

interface AiFinding {
  severity: "critical" | "warning" | "info";
  problemSummary: string;
  plainExplanation: string;
  estimatedMonthlyLossUsd: number | null;
  recommendation: string;
  sourceTable: string;
}

export async function generateSiteInsights(
  site: SiteRow,
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult,
  geminiApiKey: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<number> {
  const hostname = new URL(site.url).hostname;

  // Получаем инсайты от AI
  const findings = await fetchAiFindings(hostname, basic, pageSpeed, geminiApiKey);
  if (!findings.length) return 0;

  // Архивируем старые (не resolved) инсайты для этого сайта
  await updateRows(
    "ai_insights",
    `site_id=eq.${site.id}&is_resolved=eq.false`,
    { is_resolved: true },
    supabaseUrl,
    serviceRoleKey
  );

  // Сохраняем новые
  let saved = 0;
  for (const finding of findings) {
    const result = await insertRow(
      "ai_insights",
      {
        site_id: site.id,
        source_table: finding.sourceTable,
        severity: finding.severity,
        problem_summary: finding.problemSummary,
        plain_explanation: finding.plainExplanation,
        estimated_monthly_loss_usd: finding.estimatedMonthlyLossUsd,
        recommendation: finding.recommendation,
        is_resolved: false,
        generated_at: new Date().toISOString(),
      },
      supabaseUrl,
      serviceRoleKey
    );
    if (result.ok) saved++;
  }

  return saved;
}

async function fetchAiFindings(
  hostname: string,
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult,
  apiKey: string
): Promise<AiFinding[]> {
  const prompt = buildInsightsPrompt(hostname, basic, pageSpeed);

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
          temperature: 0.3,
          responseMimeType: "application/json",
        },
      }),
    });
    clearTimeout(timeout);

    if (!response.ok) return fallbackFindings(basic, pageSpeed);

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return fallbackFindings(basic, pageSpeed);

    const parsed = JSON.parse(text) as { findings?: AiFinding[] };
    if (!Array.isArray(parsed.findings)) return fallbackFindings(basic, pageSpeed);

    return parsed.findings.slice(0, 5);
  } catch {
    return fallbackFindings(basic, pageSpeed);
  }
}

function buildInsightsPrompt(
  hostname: string,
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult
): string {
  return `Ти — технічний аудитор сайтів. Аналізуй дані нижче про сайт ${hostname} та поверни ЛИШЕ валідний JSON (без markdown) у форматі:
{
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "problemSummary": "коротко що знайдено, українською",
      "plainExplanation": "пояснення простою мовою без техн. жаргону, 1-2 речення, українською",
      "estimatedMonthlyLossUsd": число або null,
      "recommendation": "що конкретно зробити, 1 речення, українською",
      "sourceTable": "speed_checks" | "ssl_certificates" | "uptime_checks" | "core_web_vitals_checks"
    }
  ]
}

Дані сайту:
- Час відповіді: ${basic.responseTimeMs ?? "невідомо"} мс
- HTTP статус: ${basic.httpStatus ?? "немає відповіді"}
- SSL: ${basic.sslValid ? "діє" : "відсутній або невалідний"}
- Title: "${basic.title ?? "відсутній"}" (${basic.titleLength} символів)
- Meta description: "${basic.metaDescription ?? "відсутній"}" (${basic.metaDescriptionLength} символів)
- Viewport meta: ${basic.hasViewportMeta ? "є" : "відсутній"}
- H1 заголовків: ${basic.h1Count}
- Розмір сторінки: ${basic.pageSizeKb ?? "невідомо"} КБ
- PageSpeed mobile score: ${pageSpeed.performanceScore ?? "недоступний"}/100
- LCP: ${pageSpeed.lcpMs ? Math.round(pageSpeed.lcpMs) : "невідомо"} мс
- CLS: ${pageSpeed.clsScore ?? "невідомо"}

Правила Revenue Impact ($):
- Час відповіді > 3с → ~$150-300/міс (дослідження Google: +1с = -7% конверсій)
- PageSpeed < 50 → ~$200-400/міс
- SSL відсутній → ~$500+/міс (браузери блокують сайт)
- Відсутній meta description → ~$50-100/міс (зниження CTR в пошуку)
- Якщо даних замало — null

Дай максимум 4 findings, лише реальні проблеми з наданих даних.`;
}

function fallbackFindings(
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult
): AiFinding[] {
  const findings: AiFinding[] = [];

  if (!basic.sslValid) {
    findings.push({
      severity: "critical",
      problemSummary: "Відсутній або невалідний SSL-сертифікат",
      plainExplanation: "Браузери показують відвідувачам попередження про небезпеку і більшість одразу закривають сайт.",
      estimatedMonthlyLossUsd: 500,
      recommendation: "Встановіть безкоштовний SSL-сертифікат через Let's Encrypt або ваш хостинг.",
      sourceTable: "ssl_certificates",
    });
  }

  if (basic.responseTimeMs && basic.responseTimeMs > 3000) {
    findings.push({
      severity: "warning",
      problemSummary: `Повільна відповідь сервера — ${basic.responseTimeMs} мс`,
      plainExplanation: "Сайт повільно відповідає на запити. Google враховує швидкість при ранжуванні, а відвідувачі закривають повільні сайти.",
      estimatedMonthlyLossUsd: 200,
      recommendation: "Перевірте хостинг-план або підключіть CDN для прискорення.",
      sourceTable: "speed_checks",
    });
  }

  if (pageSpeed.available && (pageSpeed.performanceScore ?? 100) < 50) {
    findings.push({
      severity: "warning",
      problemSummary: `Низький PageSpeed score — ${pageSpeed.performanceScore}/100`,
      plainExplanation: "Сайт повільно завантажується на мобільних пристроях. 53% користувачів покидають сайт якщо він вантажиться більше 3 секунд.",
      estimatedMonthlyLossUsd: 250,
      recommendation: "Стисніть зображення, підключіть lazy loading та оптимізуйте CSS/JS.",
      sourceTable: "core_web_vitals_checks",
    });
  }

  if (!basic.metaDescription) {
    findings.push({
      severity: "info",
      problemSummary: "Відсутній meta description",
      plainExplanation: "Google показує випадковий текст у пошуковій видачі замість продуманого опису — менше кліків.",
      estimatedMonthlyLossUsd: 75,
      recommendation: "Додайте унікальний meta description 120–160 символів на кожну важливу сторінку.",
      sourceTable: "speed_checks",
    });
  }

  return findings;
}
