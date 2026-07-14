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
import { addInboxItem } from "./aiInbox";

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  organization_id?: string;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
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

    // AI Inbox (MODULE_ROADMAP.md, хвиля 4, розділ 12) — тільки critical,
    // щоб не заспамити інбокс щоденними warning/info знахідками;
    // organization_id опційний (не всі select-запити SiteRow його містять) —
    // якщо відсутній, addInboxItem просто не викликається
    if (result.ok && finding.severity === "critical" && site.organization_id) {
      await addInboxItem(
        {
          organizationId: site.organization_id,
          siteId: site.id,
          title: `${site.display_name}: ${finding.problemSummary}`,
          reason: finding.plainExplanation,
          source: "audit",
          suggestedAgentId: "seo",
        },
        { SUPABASE_URL: supabaseUrl, SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey }
      );
    }
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
          temperature: 0.6,
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
  // Готуємо людський контекст по кожному метрику — щоб AI не перераховував числа а одразу їх інтерпретував
  const rtMs = basic.responseTimeMs;
  const rtCtx = rtMs === null ? "не виміряно" :
    rtMs > 3000 ? `${(rtMs / 1000).toFixed(1)} с — це дуже повільно` :
    rtMs > 1500 ? `${(rtMs / 1000).toFixed(1)} с — трохи вище норми` :
    `${rtMs} мс — норма`;

  const psScore = pageSpeed.performanceScore;
  const psCtx = psScore === null ? "не вдалось отримати" :
    psScore < 50 ? `${psScore}/100 — погано` :
    psScore < 75 ? `${psScore}/100 — є куди рости` :
    psScore < 90 ? `${psScore}/100 — непогано` :
    `${psScore}/100 — відмінно`;

  const lcpMs = pageSpeed.lcpMs ? Math.round(pageSpeed.lcpMs) : null;
  const lcpCtx = lcpMs === null ? "невідомо" :
    lcpMs > 4000 ? `${(lcpMs / 1000).toFixed(1)} с — провал (норма < 2.5 с)` :
    lcpMs > 2500 ? `${(lcpMs / 1000).toFixed(1)} с — потребує покращення` :
    `${(lcpMs / 1000).toFixed(1)} с — норма`;

  const cls = pageSpeed.clsScore;
  const clsCtx = cls === null ? "невідомо" :
    cls > 0.25 ? `${cls} — сильні стрибки верстки (норма < 0.1)` :
    cls > 0.1 ? `${cls} — незначні стрибки` :
    `${cls} — стабільно`;

  const inp = pageSpeed.inpMs;
  const inpCtx = inp === null ? "невідомо" :
    inp > 500 ? `${inp} мс — повільний відгук (норма < 200 мс)` :
    inp > 200 ? `${inp} мс — можна краще` :
    `${inp} мс — добре`;

  const titleCtx = !basic.title ? "відсутній" :
    basic.titleLength < 30 ? `"${basic.title}" — занадто короткий (${basic.titleLength} симв., треба 30-60)` :
    basic.titleLength > 60 ? `занадто довгий (${basic.titleLength} симв., Google обрізає після 60)` :
    `в порядку (${basic.titleLength} симв.)`;

  const descCtx = !basic.metaDescription ? "відсутній" :
    basic.metaDescriptionLength < 70 ? `короткий (${basic.metaDescriptionLength} симв., треба 70-160)` :
    basic.metaDescriptionLength > 160 ? `задовгий (${basic.metaDescriptionLength} симв., Google обрізає)` :
    `в порядку (${basic.metaDescriptionLength} симв.)`;

  const h1Ctx = basic.h1Count === 0 ? "жодного H1 — пошуковики не розуміють тему сторінки" :
    basic.h1Count > 1 ? `${basic.h1Count} H1 — забагато, має бути рівно один` :
    "один H1 — норма";

  return `Ти — веб-аналітик, який щойно перевірив сайт ${hostname} і зараз розповідає власнику бізнесу що знайшов. Говори як живий спеціаліст, не як автоматичний звіт.

Стиль:
- Прив'язуй кожне пояснення до конкретних чисел з вимірювань — не "сайт повільний", а "сервер відповідав 3.2 секунди, це вдвічі довше ніж норма"
- Уникай кліше і загальних фраз — кожен findings має бути про цей конкретний сайт
- Якщо щось добре — так і скажи, не шукай проблем де їх нема
- Тон: прямий, дружній, без зайвих страшилок
- estimatedMonthlyLossUsd: тільки якщо є реальна проблема і ти можеш обґрунтувати суму; інакше null

Поверни ЛИШЕ валідний JSON (без markdown):
{
  "findings": [
    {
      "severity": "critical" | "warning" | "info",
      "problemSummary": "коротко суть — конкретна, не шаблонна (українська)",
      "plainExplanation": "2-3 речення живою мовою з прив'язкою до реальних чисел цього сайту",
      "estimatedMonthlyLossUsd": число або null,
      "recommendation": "конкретний наступний крок, одне речення (українська)",
      "sourceTable": "speed_checks" | "ssl_certificates" | "uptime_checks" | "core_web_vitals_checks"
    }
  ]
}

Результати вимірювань ${hostname} (щойно):
- Час відповіді сервера: ${rtCtx}
- HTTP статус: ${basic.httpStatus ?? "немає відповіді"}
- SSL: ${basic.sslValid ? "активний" : "ВІДСУТНІЙ або невалідний — Chrome/Firefox показують блокуючий екран"}
- Title: ${titleCtx}
- Meta description: ${descCtx}
- Мобільна адаптація (viewport meta): ${basic.hasViewportMeta ? "є" : "відсутня — сайт зламаний на телефонах"}
- H1: ${h1Ctx}
- Розмір HTML: ${basic.pageSizeKb ? `${basic.pageSizeKb} КБ` : "невідомо"}
- PageSpeed mobile: ${psCtx}
- LCP: ${lcpCtx}
- CLS: ${clsCtx}
- INP: ${inpCtx}

Орієнтири для estimatedMonthlyLossUsd (тільки де є реальна підстава):
- Сервер > 3 с: кожна +1 с = -7% конверсій (Google/Deloitte). Для малого бізнесу ~50 лідів/міс → $150-250
- PageSpeed mobile < 50: 80% трафіку на телефонах, повільний досвід → $200-350
- SSL відсутній: браузер блокує перехід → $400-600
- Відсутній meta description: CTR нижче на 10-15% → $50-120
- Дрібні SEO проблеми (H1, title) → null або $30-80 якщо є трафік

Дай 2-4 findings. Якщо сайт технічно здоровий — один info з підтвердженням.`;
}

function fallbackFindings(
  basic: BasicCheckResult,
  pageSpeed: PageSpeedResult
): AiFinding[] {
  const findings: AiFinding[] = [];

  if (!basic.sslValid) {
    findings.push({
      severity: "critical",
      problemSummary: "SSL-сертифікат відсутній або недійсний",
      plainExplanation: `Chrome і Firefox показують червоний екран "Небезпечний сайт" перед входом на ${basic.httpStatus ? "сторінку з кодом " + basic.httpStatus : "ваш сайт"}. Більшість відвідувачів одразу закривають вкладку — не тому що бояться, а тому що браузер буквально блокує перехід.`,
      estimatedMonthlyLossUsd: 500,
      recommendation: "Активуйте SSL через панель хостингу (зазвичай безкоштовно через Let's Encrypt) або зверніться до підтримки хостингу.",
      sourceTable: "ssl_certificates",
    });
  }

  if (basic.responseTimeMs && basic.responseTimeMs > 3000) {
    const secs = (basic.responseTimeMs / 1000).toFixed(1);
    findings.push({
      severity: "warning",
      problemSummary: `Сервер відповідає за ${secs} с — вдвічі довше норми`,
      plainExplanation: `При кожному відкритті сторінки відвідувач чекає ${secs} секунди до першого байту відповіді. За дослідженнями Google, кожна додаткова секунда знижує конверсію на 7%. Для сайту з хоча б 50 зверненнями на місяць це відчутно.`,
      estimatedMonthlyLossUsd: Math.round((basic.responseTimeMs - 1000) / 1000 * 100),
      recommendation: "Перевірте план хостингу — shared-хостинг часто дає такі результати. VPS або CDN (Cloudflare free tier) вирішують проблему.",
      sourceTable: "speed_checks",
    });
  }

  if (pageSpeed.available && pageSpeed.performanceScore !== null && pageSpeed.performanceScore < 50) {
    findings.push({
      severity: "warning",
      problemSummary: `PageSpeed mobile: ${pageSpeed.performanceScore}/100 — нижче критичної позначки`,
      plainExplanation: `${pageSpeed.performanceScore} балів означає що на більшості телефонів сайт завантажується повільно або з помилками. Враховуючи що 60-80% вашої аудиторії зараз на мобільних — це безпосередньо впливає на відмови.${pageSpeed.lcpMs ? ` Основний контент з'являється через ${(pageSpeed.lcpMs / 1000).toFixed(1)} с (норма — до 2.5 с).` : ""}`,
      estimatedMonthlyLossUsd: 250,
      recommendation: "Запустіть Google PageSpeed Insights щоб побачити топ-3 причини — зазвичай це важкі зображення або невикористаний JS.",
      sourceTable: "core_web_vitals_checks",
    });
  }

  if (!basic.metaDescription) {
    findings.push({
      severity: "info",
      problemSummary: "Meta description відсутній — Google показує випадковий текст",
      plainExplanation: "Коли немає meta description, пошуковик сам вирізає шматок тексту зі сторінки — часто незрозумілий або технічний. Це знижує CTR в пошуку на 10-15%, бо люди не розуміють про що сайт перш ніж клікнути.",
      estimatedMonthlyLossUsd: 75,
      recommendation: "Напишіть опис 120-160 символів — одне речення про що сайт і що отримає відвідувач.",
      sourceTable: "speed_checks",
    });
  }

  return findings;
}
