// ============================================================
// referralHandler.ts — дашборд партнера (своя статистика) та
// адмін-панель (список усіх нарахувань, позначка "виплачено").
// ============================================================

import type { Env } from "../types";
import { selectRows, updateRows } from "./supabase";
import { corsHeaders } from "./cors";
import { requireAdmin } from "./adminAuth";

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

async function getAuthedUser(request: Request, env: Env): Promise<{ id: string } | null> {
  const jwt = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return null;
  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) return null;
  return await resp.json();
}

interface CommissionRow {
  id: string;
  referred_org_id: string;
  payment_amount_usd: number;
  commission_amount_usd: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}

// ─── GET /api/referrals — власна статистика партнера ───────────────
export async function handleGetReferralStats(request: Request, env: Env, origin: string | null): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const membershipResult = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&user_id=eq.${user.id}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = membershipResult.data?.[0]?.organization_id;
  if (!organizationId) return json({ error: "Організацію не знайдено" }, 404, origin);

  const [orgResult, commissionsResult, referredOrgsResult] = await Promise.all([
    selectRows<{ referral_code: string }>(
      "organizations",
      `select=referral_code&id=eq.${organizationId}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<CommissionRow>(
      "referral_commissions",
      `select=id,referred_org_id,payment_amount_usd,commission_amount_usd,status,created_at,paid_at&referrer_org_id=eq.${organizationId}&order=created_at.desc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<{ id: string }>(
      "organizations",
      `select=id&referred_by_org_id=eq.${organizationId}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const referralCode = orgResult.data?.[0]?.referral_code ?? null;
  const commissions = commissionsResult.data ?? [];
  const referredCount = referredOrgsResult.data?.length ?? 0;

  const totalEarned = commissions.reduce((sum, c) => sum + c.commission_amount_usd, 0);
  const totalPaid = commissions.filter(c => c.status === "paid").reduce((sum, c) => sum + c.commission_amount_usd, 0);
  const totalPending = commissions.filter(c => c.status !== "paid" && c.status !== "voided").reduce((sum, c) => sum + c.commission_amount_usd, 0);

  return json({
    referralCode,
    referredCount,
    totalEarned: Math.round(totalEarned * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
    commissions,
  }, 200, origin);
}

// ─── GET /api/admin/referral-commissions — усі нарахування (адмін) ──
export async function handleAdminListCommissions(request: Request, env: Env, origin: string | null): Promise<Response> {
  const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

  const result = await selectRows<CommissionRow & {
    referrer: { name: string } | null;
    referred: { name: string } | null;
  }>(
    "referral_commissions",
    "select=*,referrer:referrer_org_id(name),referred:referred_org_id(name)&order=created_at.desc&limit=200",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!result.ok) return json({ error: "Не вдалося завантажити нарахування" }, 500, origin);
  return json({ commissions: result.data }, 200, origin);
}

// ─── PATCH /api/admin/referral-commissions/:id — позначити виплаченим ──
export async function handleAdminUpdateCommission(
  request: Request,
  env: Env,
  origin: string | null,
  commissionId: string
): Promise<Response> {
  const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

  let body: { status?: string; admin_notes?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту" }, 400, origin);
  }

  const allowedStatuses = ["pending", "eligible", "paid", "voided"];
  const update: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!allowedStatuses.includes(body.status)) return json({ error: "Невірний статус" }, 400, origin);
    update.status = body.status;
    if (body.status === "paid") update.paid_at = new Date().toISOString();
  }
  if (body.admin_notes !== undefined) update.admin_notes = body.admin_notes;
  if (Object.keys(update).length === 0) return json({ error: "Немає що оновлювати" }, 400, origin);

  const result = await updateRows(
    "referral_commissions",
    `id=eq.${commissionId}`,
    update,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!result.ok) return json({ error: "Не вдалося оновити нарахування" }, 500, origin);
  return json({ ok: true }, 200, origin);
}
