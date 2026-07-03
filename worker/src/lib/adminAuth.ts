// ============================================================
// adminAuth.ts — спільна перевірка "юзер залогінений через Supabase
// JWT і має platform_role=admin". Раніше цей блок був продубльований
// в 4 місцях index.ts (admin/stats, admin/clients, admin/change-plan,
// другий admin/stats) — тепер один виклик.
// ============================================================

export interface AdminAuthResult {
  ok: boolean;
  userId?: string;
  /** HTTP-статус для відповіді, якщо ok=false (401 — не залогінений, 403 — не адмін). */
  status?: 401 | 403;
}

/**
 * Перевіряє Authorization: Bearer <jwt> проти Supabase Auth,
 * потім читає profiles.platform_role для цього юзера.
 * Повертає { ok: true, userId } тільки якщо platform_role === "admin".
 */
export async function requireAdmin(
  request: Request,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<AdminAuthResult> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace("Bearer ", "") ?? "";

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${token}` },
  });
  if (!userRes.ok) return { ok: false, status: 401 };

  const userData = (await userRes.json()) as { id?: string };
  if (!userData.id) return { ok: false, status: 401 };

  const profileRes = await fetch(
    `${supabaseUrl}/rest/v1/profiles?id=eq.${userData.id}&select=platform_role`,
    { headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` } }
  );
  const profiles = (await profileRes.json()) as Array<{ platform_role: string }>;
  if (profiles[0]?.platform_role !== "admin") return { ok: false, status: 403 };

  return { ok: true, userId: userData.id };
}
