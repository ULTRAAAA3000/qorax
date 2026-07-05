// ============================================================
// teamHandler.ts — управління командою організації: запрошення,
// прийняття, зміна ролей, видалення учасників.
//
// Доступно з Growth+ плану (Starter — 1 людина, командна робота не
// має сенсу на 1 сайт).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows, serviceRoleHeaders } from "./supabase";
import { corsHeaders } from "./cors";
import { sendEmail, buildInviteEmail } from "./email";

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

interface PlanRow { code: string; }
interface SubscriptionRow { status: string; plans: PlanRow | null; }
interface MemberRow { id: string; user_id: string; role: string; profiles: { full_name: string | null } | null; }
interface InviteRow {
  id: string; organization_id: string; email: string; role: string;
  token: string; status: string; expires_at: string; invited_by: string;
}
interface OrgRow { id: string; name: string; }

const MANAGER_ROLES = ["owner", "admin"];
const ALLOWED_INVITE_ROLES = ["admin", "editor", "viewer"];

async function getAuthedUser(request: Request, env: Env): Promise<{ id: string; email?: string } | null> {
  const jwt = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return null;
  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) return null;
  return await resp.json();
}

async function getUserOrgAndRole(userId: string, env: Env): Promise<{ organizationId: string; role: string } | null> {
  const result = await selectRows<{ organization_id: string; role: string }>(
    "organization_members",
    `select=organization_id,role&user_id=eq.${userId}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const row = result.data?.[0];
  return row ? { organizationId: row.organization_id, role: row.role } : null;
}

async function hasGrowthPlusAccess(organizationId: string, env: Env): Promise<boolean> {
  const subResult = await selectRows<SubscriptionRow>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sub = subResult.data?.[0];
  const planCode = (sub?.plans as PlanRow | null)?.code ?? "free";
  return ["growth", "agency", "admin", "trial"].includes(planCode);
}

// ─── GET /api/team — список учасників + pending-запрошень ─────────
export async function handleGetTeam(request: Request, env: Env, origin: string | null): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const membership = await getUserOrgAndRole(user.id, env);
  if (!membership) return json({ error: "Організацію не знайдено" }, 404, origin);

  const [membersResult, invitesResult] = await Promise.all([
    selectRows<MemberRow>(
      "organization_members",
      `select=id,user_id,role,profiles(full_name)&organization_id=eq.${membership.organizationId}&order=created_at.asc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<InviteRow>(
      "organization_invites",
      `select=id,email,role,status,expires_at,created_at&organization_id=eq.${membership.organizationId}&status=eq.pending&order=created_at.desc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  // Дістаємо email'и учасників окремо через auth admin API — profiles
  // не зберігає email (він живе в auth.users).
  const members = await Promise.all(
    (membersResult.data ?? []).map(async (m) => {
      const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${m.user_id}`, {
        headers: serviceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
      });
      const authUser = userResp.ok ? await userResp.json() as { email?: string } : null;
      return {
        id: m.id,
        userId: m.user_id,
        role: m.role,
        fullName: m.profiles?.full_name ?? null,
        email: authUser?.email ?? null,
      };
    })
  );

  return json({
    members,
    invites: invitesResult.data ?? [],
    currentUserRole: membership.role,
    canManage: MANAGER_ROLES.includes(membership.role),
  }, 200, origin);
}

// ─── POST /api/team/invite — надіслати запрошення ──────────────────
export async function handlePostInvite(request: Request, env: Env, origin: string | null): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  let body: { email?: string; role?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту" }, 400, origin);
  }

  const email = (body.email ?? "").trim().toLowerCase();
  const role = body.role ?? "editor";
  if (!email || !email.includes("@")) return json({ error: "Вкажіть коректний email" }, 400, origin);
  if (!ALLOWED_INVITE_ROLES.includes(role)) return json({ error: "Невірна роль" }, 400, origin);

  const membership = await getUserOrgAndRole(user.id, env);
  if (!membership) return json({ error: "Організацію не знайдено" }, 404, origin);
  if (!MANAGER_ROLES.includes(membership.role)) {
    return json({ error: "Тільки власник або адміністратор може запрошувати" }, 403, origin);
  }

  const hasAccess = await hasGrowthPlusAccess(membership.organizationId, env);
  if (!hasAccess) {
    return json(
      { error: "upgrade_required", message: "Командна робота доступна з плану Growth ($99/міс)" },
      403,
      origin
    );
  }

  // Чи вже є учасник з таким email в цій організації?
  const existingUserResp = await fetch(
    `${env.SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`,
    { headers: serviceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY) }
  );
  if (existingUserResp.ok) {
    const existingData = await existingUserResp.json() as { users?: Array<{ id: string }> };
    const existingUserId = existingData.users?.[0]?.id;
    if (existingUserId) {
      const alreadyMemberResult = await selectRows<{ id: string }>(
        "organization_members",
        `select=id&organization_id=eq.${membership.organizationId}&user_id=eq.${existingUserId}&limit=1`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (alreadyMemberResult.data?.[0]) {
        return json({ error: "Ця людина вже в команді" }, 409, origin);
      }
    }
  }

  // Чи вже є pending-запрошення на цей email в цій організації?
  const existingInviteResult = await selectRows<{ id: string; status: string }>(
    "organization_invites",
    `select=id,status&organization_id=eq.${membership.organizationId}&email=eq.${encodeURIComponent(email)}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const existingInvite = existingInviteResult.data?.[0];
  if (existingInvite && existingInvite.status === "pending") {
    return json({ error: "Запрошення вже надіслано цій людині" }, 409, origin);
  }

  // Якщо є старий revoked/expired інвайт на цей email — видаляємо його,
  // бо є unique-constraint (organization_id, email) і insert інакше впаде.
  if (existingInvite) {
    await fetch(
      `${env.SUPABASE_URL}/rest/v1/organization_invites?id=eq.${existingInvite.id}`,
      {
        method: "DELETE",
        headers: serviceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
      }
    );
  }

  const orgResult = await selectRows<OrgRow>(
    "organizations",
    `select=id,name&id=eq.${membership.organizationId}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const org = orgResult.data?.[0];
  if (!org) return json({ error: "Організацію не знайдено" }, 404, origin);

  const insertResult = await insertRow(
    "organization_invites",
    { organization_id: membership.organizationId, email, role, invited_by: user.id },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertResult.ok) return json({ error: "Не вдалося створити запрошення" }, 500, origin);

  // Дістаємо токен щойно створеного інвайту для посилання в листі
  const createdInviteResult = await selectRows<{ token: string }>(
    "organization_invites",
    `select=token&organization_id=eq.${membership.organizationId}&email=eq.${encodeURIComponent(email)}&status=eq.pending&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const token = createdInviteResult.data?.[0]?.token;

  if (token) {
    const acceptUrl = `${env.APP_URL}/invite/${token}`;
    const { subject, html } = buildInviteEmail({
      organizationName: org.name,
      inviterName: user.email ?? "Колега",
      role,
      acceptUrl,
    });
    await sendEmail({ to: email, subject, html }, env.RESEND_API_KEY).catch(() => {});
  }

  return json({ ok: true }, 200, origin);
}

// ─── DELETE /api/team/invite/:id — відкликати запрошення ───────────
export async function handleRevokeInvite(request: Request, env: Env, origin: string | null, inviteId: string): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const membership = await getUserOrgAndRole(user.id, env);
  if (!membership || !MANAGER_ROLES.includes(membership.role)) {
    return json({ error: "Forbidden" }, 403, origin);
  }

  const result = await updateRows(
    "organization_invites",
    `id=eq.${inviteId}&organization_id=eq.${membership.organizationId}`,
    { status: "revoked" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!result.ok) return json({ error: "Не вдалося відкликати запрошення" }, 500, origin);
  return json({ ok: true }, 200, origin);
}

// ─── POST /api/team/accept — прийняти запрошення (для ІСНУЮЧОГО акаунту) ──
// Новий акаунт приймає запрошення автоматично через тригер handle_new_user()
// при реєстрації. Цей ендпоінт — тільки для випадку, коли людина вже має
// акаунт Qorax і заходить по посиланню-запрошенню під своїм існуючим логіном.
export async function handleAcceptInvite(request: Request, env: Env, origin: string | null): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  let body: { token?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту" }, 400, origin);
  }
  if (!body.token) return json({ error: "Токен обов'язковий" }, 400, origin);

  const inviteResult = await selectRows<InviteRow>(
    "organization_invites",
    `select=id,organization_id,email,role,status,expires_at&token=eq.${encodeURIComponent(body.token)}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const invite = inviteResult.data?.[0];
  if (!invite) return json({ error: "Запрошення не знайдено" }, 404, origin);
  if (invite.status !== "pending") return json({ error: "Це запрошення вже недійсне" }, 410, origin);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: "Термін дії запрошення закінчився" }, 410, origin);
  }
  if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    return json({ error: "Це запрошення адресоване іншій email-адресі" }, 403, origin);
  }

  // Чи не є вже учасником цієї організації?
  const alreadyMemberResult = await selectRows<{ id: string }>(
    "organization_members",
    `select=id&organization_id=eq.${invite.organization_id}&user_id=eq.${user.id}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (alreadyMemberResult.data?.[0]) {
    await updateRows("organization_invites", `id=eq.${invite.id}`, { status: "accepted", accepted_at: new Date().toISOString() }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json({ ok: true, organizationId: invite.organization_id }, 200, origin);
  }

  const insertResult = await insertRow(
    "organization_members",
    { organization_id: invite.organization_id, user_id: user.id, role: invite.role },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertResult.ok) return json({ error: "Не вдалося приєднатись до команди" }, 500, origin);

  await updateRows(
    "organization_invites",
    `id=eq.${invite.id}`,
    { status: "accepted", accepted_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return json({ ok: true, organizationId: invite.organization_id }, 200, origin);
}

// ─── PATCH /api/team/member/:id — змінити роль учасника ────────────
export async function handleUpdateMemberRole(request: Request, env: Env, origin: string | null, memberId: string): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const membership = await getUserOrgAndRole(user.id, env);
  if (!membership || !MANAGER_ROLES.includes(membership.role)) {
    return json({ error: "Forbidden" }, 403, origin);
  }

  let body: { role?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту" }, 400, origin);
  }
  const allRoles = ["admin", "editor", "viewer", "member"];
  if (!body.role || !allRoles.includes(body.role)) return json({ error: "Невірна роль" }, 400, origin);

  // Не можна змінити роль owner (їх лишається рівно один на організацію)
  const targetResult = await selectRows<{ id: string; role: string }>(
    "organization_members",
    `select=id,role&id=eq.${memberId}&organization_id=eq.${membership.organizationId}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const target = targetResult.data?.[0];
  if (!target) return json({ error: "Учасника не знайдено" }, 404, origin);
  if (target.role === "owner") return json({ error: "Не можна змінити роль власника" }, 400, origin);

  const result = await updateRows(
    "organization_members",
    `id=eq.${memberId}&organization_id=eq.${membership.organizationId}`,
    { role: body.role },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!result.ok) return json({ error: "Не вдалося оновити роль" }, 500, origin);
  return json({ ok: true }, 200, origin);
}

// ─── DELETE /api/team/member/:id — видалити учасника ───────────────
export async function handleRemoveMember(request: Request, env: Env, origin: string | null, memberId: string): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Unauthorized" }, 401, origin);

  const membership = await getUserOrgAndRole(user.id, env);
  if (!membership || !MANAGER_ROLES.includes(membership.role)) {
    return json({ error: "Forbidden" }, 403, origin);
  }

  const targetResult = await selectRows<{ id: string; role: string }>(
    "organization_members",
    `select=id,role&id=eq.${memberId}&organization_id=eq.${membership.organizationId}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const target = targetResult.data?.[0];
  if (!target) return json({ error: "Учасника не знайдено" }, 404, origin);
  if (target.role === "owner") return json({ error: "Не можна видалити власника організації" }, 400, origin);

  const resp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/organization_members?id=eq.${memberId}&organization_id=eq.${membership.organizationId}`,
    {
      method: "DELETE",
      headers: serviceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY),
    }
  );
  if (!resp.ok) return json({ error: "Не вдалося видалити учасника" }, 500, origin);
  return json({ ok: true }, 200, origin);
}

// ─── GET /api/invite/:token — публічна перевірка інвайту (без авторизації) ──
// Використовується сторінкою /invite/[token] щоб показати "Вас запрошує X
// до Y" ще ДО логіну/реєстрації.
export async function handleGetInvitePreview(env: Env, origin: string | null, token: string): Promise<Response> {
  const inviteResult = await selectRows<InviteRow & { organizations: OrgRow | null }>(
    "organization_invites",
    `select=id,email,role,status,expires_at,organizations(id,name)&token=eq.${encodeURIComponent(token)}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const invite = inviteResult.data?.[0];
  if (!invite) return json({ error: "Запрошення не знайдено" }, 404, origin);
  if (invite.status !== "pending") return json({ error: "Це запрошення вже недійсне" }, 410, origin);
  if (new Date(invite.expires_at).getTime() < Date.now()) {
    return json({ error: "Термін дії запрошення закінчився" }, 410, origin);
  }

  return json({
    email: invite.email,
    role: invite.role,
    organizationName: invite.organizations?.name ?? "організації",
  }, 200, origin);
}
