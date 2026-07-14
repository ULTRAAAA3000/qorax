// ============================================================
// QORAX — Predictive AI: Risk/Opportunity Detection (MVP)
// ============================================================
// MODULE_ROADMAP.md, "Четверта хвиля (довгострокове бачення)",
// розділ 16 "Predictive AI", Крок 5: MVP = ТІЛЬКИ Risk/Opportunity
// Detection. Навмисно НЕ власна ML/статистична модель — детектори
// нижче переформулюють уже наявні дані (gsc_metrics.average_position,
// speed_checks.load_time_ms) у структурований формат ai_predictions
// для UI-карток. Той самий принцип перевикористання, що вже
// застосований для Knowledge Graph (0065) і AI Inbox (розділ 12).
//
// Traffic/Ranking/Revenue Forecast (наступна ітерація) і Predictive
// Planner (вимагає AI Operating System, розділ 12, якого ще нема) —
// НЕ в цьому файлі. horizon_days тут завжди 0: детектори констатують
// ІСНУЮЧИЙ тренд на момент запуску, не прогнозують майбутнє.
// ============================================================

import type { Env } from "../types";
import { selectRows, upsertRow, updateRows } from "./supabase";
import { requireOrgAccessForSite } from "./orgAuth";

interface SiteRow {
  id: string;
  organization_id: string;
}

interface GscMetricRow {
  date: string;
  average_position: number | null;
  query: string | null;
}

interface SpeedCheckRow {
  load_time_ms: number;
  checked_at: string;
}

const today = () => new Date().toISOString().slice(0, 10);

// ── Risk/Opportunity: позиція ключового слова ───────────────────
//
// Порівнюємо останнє відоме average_position tracked-запиту із
// середнім за попередні 14 днів (без сьогоднішнього заміру).
// Позиція в GSC — менше значення = вище в видачі, тому "risk" —
// зростання числа (позиція погіршилась), "opportunity" — падіння
// числа (позиція покращилась). Поріг — зміна щонайменше на 3
// позиції: менші коливання — шум ранжування, не тренд, вартий
// картки для власника сайту.
async function detectKeywordPositionSignals(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const trackedRes = await selectRows<{ id: string; query: string }>(
    "rank_tracked_queries",
    `select=id,query&site_id=eq.${encodeURIComponent(site.id)}`,
    supabaseUrl,
    serviceRoleKey
  );
  const tracked = trackedRes.data ?? [];
  if (tracked.length === 0) return;

  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const tq of tracked) {
    const metricsRes = await selectRows<GscMetricRow>(
      "gsc_metrics",
      `select=date,average_position,query&site_id=eq.${encodeURIComponent(site.id)}&query=eq.${encodeURIComponent(tq.query)}&date=gte.${fourteenDaysAgo}&average_position=not.is.null&order=date.desc`,
      supabaseUrl,
      serviceRoleKey
    );
    const rows = metricsRes.data ?? [];
    if (rows.length < 4) continue; // замало даних для чесного порівняння (той самий поріг, що checkSpeedDegradation)

    const [latest, ...history] = rows;
    if (history.length === 0) continue;

    const baseline = history.reduce((sum, r) => sum + (r.average_position ?? 0), 0) / history.length;
    const current = latest.average_position ?? 0;
    const changePct = baseline > 0 ? ((current - baseline) / baseline) * 100 : 0;
    const positionDelta = current - baseline; // додатнє = гірше (нижче у видачі)

    if (Math.abs(positionDelta) < 3) continue;

    const isRisk = positionDelta > 0;
    await upsertRow(
      "ai_predictions",
      {
        organization_id: site.organization_id,
        site_id: site.id,
        prediction_type: isRisk ? "risk" : "opportunity",
        signal: isRisk ? "keyword_position_drop" : "keyword_position_rise",
        horizon_days: 0,
        predicted_value: {
          metric: "average_position",
          query: tq.query,
          current: Math.round(current * 10) / 10,
          baseline: Math.round(baseline * 10) / 10,
          change_pct: Math.round(changePct * 10) / 10,
        },
        confidence: null, // проста екстраполяція середнього, не статистична модель — чесно не даємо число впевненості
        based_on: { source: "gsc_metrics", days: history.length, query: tq.query },
        target_date: today(),
      },
      "site_id,signal,target_date",
      supabaseUrl,
      serviceRoleKey
    );
  }
}

// ── Risk: деградація швидкості сайту ─────────────────────────────
//
// Той самий поріг, що вже перевірений і працює в
// monitoring.ts::checkSpeedDegradation (порівняння з 7-денним
// середнім) — не новий алгоритм, переформулювання вже наявного
// сигналу в ai_predictions замість (а точніше — на додачу до)
// прямого email/Telegram-алерту.
async function detectSpeedDegradationSignal(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const checksRes = await selectRows<SpeedCheckRow>(
    "speed_checks",
    `select=load_time_ms,checked_at&site_id=eq.${encodeURIComponent(site.id)}&checked_at=gte.${weekAgo}&order=checked_at.desc&limit=20`,
    supabaseUrl,
    serviceRoleKey
  );
  const checks = checksRes.data ?? [];
  if (checks.length < 3) return;

  const [latest, ...history] = checks;
  if (history.length === 0) return;

  const avg = history.reduce((sum, c) => sum + c.load_time_ms, 0) / history.length;
  const current = latest.load_time_ms;

  // Той самий поріг, що checkSpeedDegradation: удвічі гірше середнього
  // І абсолютно перевищує 3с — уникає хибних спрацювань на швидких
  // сайтах, де коливання 200мс→400мс статистично "вдвічі", але
  // непомітне для реального відвідувача.
  if (current < avg * 2 || current < 3000) return;

  const changePct = avg > 0 ? ((current - avg) / avg) * 100 : 0;

  await upsertRow(
    "ai_predictions",
    {
      organization_id: site.organization_id,
      site_id: site.id,
      prediction_type: "risk",
      signal: "speed_degradation",
      horizon_days: 0,
      predicted_value: {
        metric: "load_time_ms",
        current,
        baseline: Math.round(avg),
        change_pct: Math.round(changePct * 10) / 10,
      },
      confidence: null,
      based_on: { source: "speed_checks", days: history.length },
      target_date: today(),
    },
    "site_id,signal,target_date",
    supabaseUrl,
    serviceRoleKey
  );
}

// ── Точка входу для нічного крону ────────────────────────────────
//
// Викликається з того самого блоку 0 3 * * *, що вже запускає
// runSpeedChecks/runSeoChecks/runCompetitorChecks/runGscSync/
// runGa4Sync/runDueAgentAutomations — не окремий Cloudflare Cron
// Trigger, той самий підхід, що GA4-синк і Automations вище
// (щоб не вимагати від Артема заводити ще один тригер вручну).
// Жодна помилка в цьому файлі не повинна ронити решту нічних
// задач — детектори тут допоміжний шар (як і Knowledge Graph),
// не критичний шлях.
export async function runPredictiveDetectors(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ sitesChecked: number; errors: number }> {
  const sitesRes = await selectRows<SiteRow>(
    "sites",
    `select=id,organization_id`,
    supabaseUrl,
    serviceRoleKey
  );
  const sites = sitesRes.data ?? [];

  let errors = 0;
  for (const site of sites) {
    try {
      await detectKeywordPositionSignals(site, supabaseUrl, serviceRoleKey);
    } catch (err) {
      console.error("[predictive] keyword position detector failed for site:", site.id, err);
      errors++;
    }
    try {
      await detectSpeedDegradationSignal(site, supabaseUrl, serviceRoleKey);
    } catch (err) {
      console.error("[predictive] speed degradation detector failed for site:", site.id, err);
      errors++;
    }
  }

  return { sitesChecked: sites.length, errors };
}

// ── HTTP API ──────────────────────────────────────────────────────

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

interface AiPredictionRow {
  id: string;
  prediction_type: string;
  signal: string;
  predicted_value: Record<string, unknown>;
  confidence: number | null;
  target_date: string;
  created_at: string;
}

// GET /api/sites/:id/predictions — активні (dismissed_at is null)
// картки для картки на дашборді сайту. Той самий доступ, що Rank/
// Analytics (requireOrgAccessForSite, не requireOrgAccessForProject).
export async function handlePredictionsList(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireOrgAccessForSite(request, siteId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<AiPredictionRow>(
    "ai_predictions",
    `select=id,prediction_type,signal,predicted_value,confidence,target_date,created_at&site_id=eq.${encodeURIComponent(siteId)}&dismissed_at=is.null&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ predictions: res.data ?? [] }, 200, corsHeaders);
}

// POST /api/sites/:id/predictions/:predictionId/dismiss — приховати
// картку з активного UI. update, не delete — історія детекцій
// лишається в базі (задокументовано в 0066_ai_predictions.sql).
export async function handlePredictionDismiss(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string, predictionId: string): Promise<Response> {
  const access = await requireOrgAccessForSite(request, siteId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await updateRows(
    "ai_predictions",
    `id=eq.${encodeURIComponent(predictionId)}&site_id=eq.${encodeURIComponent(siteId)}`,
    { dismissed_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}
