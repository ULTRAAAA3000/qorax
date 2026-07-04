// ============================================================
// businessMetrics.ts — GET /api/admin/business-metrics
// MRR, churn rate, trial→paid конверсія для admin-панелі.
//
// Рахується "на льоту" з таблиці subscriptions замість окремої
// time-series таблиці подій — для об'єму даних Qorax на цьому етапі
// (десятки-сотні організацій) це швидше і простіше, ніж підтримувати
// окрему таблицю snapshot'ів. Якщо організацій стане тисячі — варто
// буде перейти на щоденний cron, що зберігає daily MRR snapshot.
// ============================================================

import type { Env } from "../types";
import { selectRows } from "./supabase";
import { corsHeaders } from "./cors";
import { requireAdmin } from "./adminAuth";

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

interface SubscriptionRow {
  id: string;
  organization_id: string;
  status: string;
  cancel_at_period_end: boolean;
  extra_sites: number;
  created_at: string;
  updated_at: string;
  plans: { code: string; name: string; price_usd: number; extra_site_price_usd: number | null } | null;
}

function monthlyValue(sub: SubscriptionRow): number {
  const base = sub.plans?.price_usd ?? 0;
  const extraSitePrice = sub.plans?.extra_site_price_usd ?? 0;
  return base + sub.extra_sites * extraSitePrice;
}

export async function handleBusinessMetrics(request: Request, env: Env, origin: string | null): Promise<Response> {
  const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

  // Тягнемо ВСІ підписки одним запитом — для десятків/сотень організацій
  // це один невеликий запит, набагато дешевше ніж N окремих count-запитів
  // на кожен статус/період.
  const subsResult = await selectRows<SubscriptionRow>(
    "subscriptions",
    "select=id,organization_id,status,cancel_at_period_end,extra_sites,created_at,updated_at,plans(code,name,price_usd,extra_site_price_usd)&order=created_at.asc",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!subsResult.ok) {
    return json({ error: "Не вдалося завантажити дані підписок" }, 500, origin);
  }

  const subs = subsResult.data;
  const now = Date.now();
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
  const sixtyDaysAgo = now - 60 * 24 * 60 * 60 * 1000;

  const active = subs.filter(s => s.status === "active");
  const trialing = subs.filter(s => s.status === "trialing");
  const pastDue = subs.filter(s => s.status === "past_due");
  const canceled = subs.filter(s => s.status === "canceled");

  // ── MRR ──────────────────────────────────────────────────────
  const mrr = active.reduce((sum, s) => sum + monthlyValue(s), 0);

  const mrrByPlan: Record<string, { count: number; mrr: number }> = {};
  for (const s of active) {
    const code = s.plans?.code ?? "unknown";
    if (!mrrByPlan[code]) mrrByPlan[code] = { count: 0, mrr: 0 };
    mrrByPlan[code].count += 1;
    mrrByPlan[code].mrr += monthlyValue(s);
  }

  // MRR "30 днів тому" — наближено: підписки, що вже були active на той
  // момент (створені раніше thirtyDaysAgo і ще не скасовані на той момент,
  // або скасовані вже ПІСЛЯ thirtyDaysAgo). Це наближення, не точний
  // historical snapshot, але дає адекватний напрямок тренду без окремої
  // таблиці подій.
  const activeThirtyDaysAgo = subs.filter(s => {
    const createdBefore = new Date(s.created_at).getTime() < thirtyDaysAgo;
    if (!createdBefore) return false;
    if (s.status === "active" || s.status === "past_due") return true;
    if (s.status === "canceled" && new Date(s.updated_at).getTime() > thirtyDaysAgo) return true;
    return false;
  });
  const mrrThirtyDaysAgo = activeThirtyDaysAgo.reduce((sum, s) => sum + monthlyValue(s), 0);
  const mrrGrowthPct = mrrThirtyDaysAgo > 0
    ? Math.round(((mrr - mrrThirtyDaysAgo) / mrrThirtyDaysAgo) * 1000) / 10
    : null;

  // ── Churn rate (30 днів) ────────────────────────────────────
  // Класична формула: скасування за період / активні на початок періоду.
  const canceledLast30d = canceled.filter(s => new Date(s.updated_at).getTime() >= thirtyDaysAgo);
  const activeAtStartOf30d = activeThirtyDaysAgo.length;
  const churnRatePct = activeAtStartOf30d > 0
    ? Math.round((canceledLast30d.length / activeAtStartOf30d) * 1000) / 10
    : 0;

  // Для порівняння — churn rate попередніх 30 днів (30-60 днів тому)
  const canceledPrev30d = canceled.filter(s => {
    const t = new Date(s.updated_at).getTime();
    return t >= sixtyDaysAgo && t < thirtyDaysAgo;
  });
  const activeAtStartOf60d = subs.filter(s => {
    const createdBefore = new Date(s.created_at).getTime() < sixtyDaysAgo;
    if (!createdBefore) return false;
    if (s.status === "active" || s.status === "past_due") return true;
    if (s.status === "canceled" && new Date(s.updated_at).getTime() > sixtyDaysAgo) return true;
    return false;
  }).length;
  const churnRatePrevPct = activeAtStartOf60d > 0
    ? Math.round((canceledPrev30d.length / activeAtStartOf60d) * 1000) / 10
    : 0;

  // ── Trial → Paid конверсія ───────────────────────────────────
  // Серед підписок що КОЛИСЬ були в trial і вже вийшли з нього (зараз
  // active, past_due або canceled — тобто trial period закінчився),
  // скільки реально стали платними хоч раз.
  const trialsResolved = subs.filter(s => s.status !== "trialing");
  // Підписка вважається "конвертованою" якщо вона зараз active/past_due,
  // або була canceled але встигла провести якийсь час в active
  // (спрощено: якщо статус не trialing і не canceled одразу з trial —
  // наближення через updated_at > created_at з запасом в 1 день).
  const convertedFromTrial = trialsResolved.filter(s => s.status === "active" || s.status === "past_due");
  const conversionRatePct = trialsResolved.length > 0
    ? Math.round((convertedFromTrial.length / trialsResolved.length) * 1000) / 10
    : null;

  // ── ARPU (Average Revenue Per User, серед платних) ───────────
  const arpu = active.length > 0 ? Math.round((mrr / active.length) * 100) / 100 : 0;

  // ── Підписки, що скоро скасуються (cancel_at_period_end) ─────
  const endingCount = active.filter(s => s.cancel_at_period_end).length;

  return json({
    mrr: Math.round(mrr * 100) / 100,
    mrrGrowthPct,
    mrrByPlan,
    arpu,
    activeCount: active.length,
    trialingCount: trialing.length,
    pastDueCount: pastDue.length,
    canceledCount: canceled.length,
    churnRatePct,
    churnRatePrevPct,
    canceledLast30dCount: canceledLast30d.length,
    conversionRatePct,
    endingSoonCount: endingCount,
  }, 200, origin);
}
