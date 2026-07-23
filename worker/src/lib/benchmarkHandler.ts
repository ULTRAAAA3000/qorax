// ============================================================
// benchmarkHandler.ts — GET /api/benchmarks/:metric
// (MODULE_ROADMAP.md, "Четверта хвиля", розділ 15, Крок 2-4)
// ============================================================
// Рахує процентиль організації відносно benchmark_snapshots того ж
// industry/country/business_size — легкий запит, БЕЗ AI-виклику.
// AI-пояснення різниці — окремий, дешевший Gemini-виклик, що бере вже
// порахований процентиль + контекст, не рахує сам (роадмап, Крок 2).
//
// Тарифний гейт (роадмап, Крок 4): базові 2-3 метрики (speed_ms,
// conversion_rate) — доступні всім як гачок; повний набір метрик +
// AI-пояснення — Growth+. Той самий список planCode, що croHandler.ts/
// ga4Handler.ts/усі інші фіче-флаги проєкту.

import type { Env } from "../types";
import { hasProTierAccess } from "./planTiers";
import { selectRows } from "./supabase";
import { requireOrgAccess } from "./orgAuth";
import { callGemini } from "./contentGeneration";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  return json({ error: status === 401 ? "Unauthorized" : "Forbidden" }, status ?? 403, corsHeaders);
}

// Базові метрики — доступні всім тарифам як "гачок" (роадмап, Крок 4).
const FREE_METRICS = ["speed_ms", "conversion_rate"];
const ALL_METRICS = ["speed_ms", "conversion_rate", "article_length"];

async function canUseFullBenchmarks(orgId: string, env: Env): Promise<boolean> {
  const res = await selectRows<{ status: string; plans: { code: string } }>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(orgId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const planCode = (res.data?.[0]?.plans as { code: string } | null)?.code;
  return hasProTierAccess(planCode ?? "");
}

interface OrgProfile {
  industry: string | null;
  country: string | null;
  business_size: string | null;
}

/** Рахує percentile організації в межах групи industry/country/business_size —
 * скільки % знімків групи мають value <= org value ("ви швидші за 89% сайтів"
 * для speed_ms, де менше = краще, обробляється на рівні напрямку метрики нижче). */
function computePercentile(orgValue: number, groupValues: number[], higherIsBetter: boolean): number {
  if (groupValues.length === 0) return 50; // немає з чим порівнювати — нейтральне значення
  const countBetterOrEqual = groupValues.filter(v => (higherIsBetter ? v <= orgValue : v >= orgValue)).length;
  return Math.round((countBetterOrEqual / groupValues.length) * 100);
}

// speed_ms: менше = краще. conversion_rate/article_length: більше = краще.
const HIGHER_IS_BETTER: Record<string, boolean> = {
  speed_ms: false,
  conversion_rate: true,
  article_length: true,
};

// GET /api/benchmarks/:metric?organization_id=... — той самий патерн
// query-параметра organization_id, що /api/crm/contacts (crmHandler.ts),
// не частина шляху (org-scoped, не site/project-scoped ресурс).

export async function handleBenchmarkGet(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  metric: string
): Promise<Response> {
  if (!ALL_METRICS.includes(metric)) {
    return json({ error: "Невідома метрика" }, 400, corsHeaders);
  }

  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const isFullTier = await canUseFullBenchmarks(organizationId, env);
  if (!FREE_METRICS.includes(metric) && !isFullTier) {
    return json({ error: "Ця метрика доступна на тарифі Growth і вище" }, 402, corsHeaders);
  }

  const orgRes = await selectRows<OrgProfile>(
    "organizations",
    `select=industry,country,business_size&id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const org = orgRes.data?.[0];
  if (!org || (!org.industry && !org.country && !org.business_size)) {
    return json(
      { error: "Заповніть галузь/країну в налаштуваннях організації, щоб отримати порівняння з ринком", available: false },
      200,
      corsHeaders
    );
  }

  // Своє останнє значення метрики беремо з тих самих джерел, що
  // benchmarkAggregator.ts пише в benchmark_snapshots — тут напряму з
  // сирих таблиць модулів (speed_checks/cro_daily_stats/ai_generations),
  // щоб не чекати на нічний cron для власного значення користувача.
  const orgValue = await getOrgOwnValue(metric, organizationId, env);
  if (orgValue === null) {
    return json({ error: "Недостатньо власних даних для цієї метрики ще", available: false }, 200, corsHeaders);
  }

  // Група порівняння — той самий industry/country/business_size, чим точніший
  // збіг тим краще, але з fallback на ширшу групу якщо вузька дає замало даних
  // (percent_rank() відносно 2-3 знімків не інформативний — роадмап, відоме обмеження).
  const groupFilters = [
    org.industry && org.country && org.business_size
      ? `industry=eq.${encodeURIComponent(org.industry)}&country=eq.${encodeURIComponent(org.country)}&business_size=eq.${encodeURIComponent(org.business_size)}`
      : null,
    org.industry ? `industry=eq.${encodeURIComponent(org.industry)}` : null,
  ].filter((f): f is string => f !== null);

  let groupValues: number[] = [];
  for (const filter of groupFilters) {
    const res = await selectRows<{ value: number }>(
      "benchmark_snapshots",
      `select=value&metric=eq.${encodeURIComponent(metric)}&${filter}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    groupValues = (res.data ?? []).map(r => r.value);
    if (groupValues.length >= 10) break; // достатньо для percent_rank(), не звужуємо далі
  }

  const higherIsBetter = HIGHER_IS_BETTER[metric] ?? true;
  const percentile = computePercentile(orgValue, groupValues, higherIsBetter);
  const marketAverage = groupValues.length > 0 ? groupValues.reduce((a, b) => a + b, 0) / groupValues.length : null;

  let aiExplanation: string | null = null;
  if (isFullTier && groupValues.length > 0) {
    aiExplanation = await generateExplanation(metric, orgValue, percentile, marketAverage, env);
  }

  return json(
    {
      available: true,
      metric,
      your_value: orgValue,
      market_average: marketAverage !== null ? Math.round(marketAverage * 100) / 100 : null,
      percentile,
      sample_size: groupValues.length,
      ai_explanation: aiExplanation,
    },
    200,
    corsHeaders
  );
}

async function getOrgOwnValue(metric: string, organizationId: string, env: Env): Promise<number | null> {
  const sitesRes = await selectRows<{ id: string }>(
    "sites",
    `select=id&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const siteIds = (sitesRes.data ?? []).map(s => s.id);
  if (siteIds.length === 0) return null;
  const siteIdsFilter = siteIds.map(id => encodeURIComponent(id)).join(",");

  if (metric === "speed_ms") {
    const res = await selectRows<{ load_time_ms: number }>(
      "speed_checks",
      `select=load_time_ms&site_id=in.(${siteIdsFilter})&order=checked_at.desc&limit=${siteIds.length * 5}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const values = (res.data ?? []).map(r => r.load_time_ms);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  if (metric === "conversion_rate") {
    const res = await selectRows<{ conversion_rate: number | null }>(
      "cro_daily_stats",
      `select=conversion_rate&site_id=in.(${siteIdsFilter})&conversion_rate=not.is.null&order=date.desc&limit=${siteIds.length * 7}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const values = (res.data ?? []).map(r => r.conversion_rate as number);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  if (metric === "article_length") {
    const res = await selectRows<{ output: string }>(
      "ai_generations",
      `select=output&kind=eq.article_intro&site_id=in.(${siteIdsFilter})&order=created_at.desc&limit=20`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const values = (res.data ?? []).map(r => r.output.trim().split(/\s+/).filter(Boolean).length);
    return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }

  return null;
}

const METRIC_LABELS: Record<string, string> = {
  speed_ms: "швидкість завантаження сайту (мс)",
  conversion_rate: "конверсія відвідувачів у ліди/заявки (%)",
  article_length: "довжина статей, що генеруються AI (слів)",
};

async function generateExplanation(
  metric: string,
  orgValue: number,
  percentile: number,
  marketAverage: number | null,
  env: Env
): Promise<string | null> {
  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  const label = METRIC_LABELS[metric] ?? metric;
  const prompt = `Ти — аналітик Qorax. Клієнт бачить своє порівняння з ринком по метриці "${label}".
Його значення: ${Math.round(orgValue * 100) / 100}. Середнє по ринку: ${marketAverage !== null ? Math.round(marketAverage * 100) / 100 : "невідомо"}.
Процентиль: ${percentile} (клієнт кращий за ${percentile}% подібних бізнесів).
Напиши 1-2 короткі речення українською, живою мовою аналітика (не сухо), що пояснюють цю різницю і дають одну конкретну пораду що покращити. Без вступних фраз типу "Ось аналіз", одразу суть.`;

  const result = await callGemini(prompt, apiKey);
  return result.ok ? result.text.trim() : null;
}
