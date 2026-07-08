// ============================================================
// orgAuth.ts — requireOrgAccess(): єдина перевірка "юзер належить
// organization_id (прямо чи транзитивно через site_id/project_id) і
// має роль ≥ minRole". Закриває Фазу 0.1 з EXECUTION_PLAN.md.
//
// ДО цього файлу перевірка членства була продубльована вручну в
// кожному handler'і (rankHandler.ts, gscHandler.ts — getUserIdFromToken
// + getOrgIdForSite викликались окремо в 4-5 місцях на файл) і жодна
// з них не перевіряла РОЛЬ — тільки факт членства в організації. Це
// означало, що viewer технічно міг викликати insert/delete ендпоінти
// нарівні з owner, якби Worker-код це не заборонив явно (а він і не
// забороняв — RLS тут не захищає, бо Worker ходить в Supabase з
// service role, див. SECURITY.md розділ 5).
//
// Цей файл не видаляє getUserIdFromToken/getOrgIdForSite з
// gscHandler.ts (щоб не ламати наявний працюючий код одним проходом),
// а дає єдину точку входу для НОВИХ ендпоінтів (Translator, Commerce,
// CRM...), яка одразу перевіряє і членство, і роль.
// ============================================================

import type { Env } from "../types";
import { selectRows } from "./supabase";

/** Ієрархія ролей — той самий порядок, що в SECURITY.md розділ 2. */
const ROLE_RANK: Record<string, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
  owner: 3,
  // "member" — застаріле значення (0033_extend_member_role_enum.sql),
  // нові перевірки на нього не покладаються; трактуємо як viewer,
  // щоб не випадково дати застарілим рядкам більше прав, ніж мали.
  member: 0,
};

export interface OrgAccessResult {
  ok: boolean;
  userId?: string;
  organizationId?: string;
  role?: string;
  /** 401 — немає/невалідний токен. 403 — залогінений, але роль замала чи не належить організації. 404 — ресурс (site/project) не знайдено. */
  status?: 401 | 403 | 404;
}

async function getUserIdFromToken(
  token: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceRoleKey },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { id?: string }).id ?? null;
  } catch {
    return null;
  }
}

async function getMemberRole(
  organizationId: string,
  userId: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string | null> {
  const res = await selectRows<{ role: string }>(
    "organization_members",
    `select=role&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(userId)}`,
    supabaseUrl,
    serviceRoleKey
  );
  return res.data?.[0]?.role ?? null;
}

/**
 * Перевіряє Authorization: Bearer <jwt> і роль юзера в конкретній
 * організації. Використовувати, коли organization_id уже відомий
 * напряму (не з site_id/project_id) — напр. CRM, Academy, Docs,
 * Qorax AI (модулі organization-рівня з DATA_MODEL.md розділ 2.1).
 */
export async function requireOrgAccess(
  request: Request,
  organizationId: string,
  minRole: "viewer" | "editor" | "admin" | "owner",
  env: Env
): Promise<OrgAccessResult> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401 };

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return { ok: false, status: 401 };

  const role = await getMemberRole(organizationId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!role || (ROLE_RANK[role] ?? -1) < ROLE_RANK[minRole]) {
    return { ok: false, status: 403, userId };
  }

  return { ok: true, userId, organizationId, role };
}

/**
 * Те саме, але коли відомий тільки site_id (найпоширеніший випадок
 * зараз — Rank, Audit, Analytics, майбутні Translator/Social/CRO
 * прив'язані до site_id, див. DATA_MODEL.md розділ 2.1). Дістає
 * organization_id сайту, потім перевіряє роль так само, як вище.
 */
export async function requireOrgAccessForSite(
  request: Request,
  siteId: string,
  minRole: "viewer" | "editor" | "admin" | "owner",
  env: Env
): Promise<OrgAccessResult> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401 };

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return { ok: false, status: 401 };

  const siteRes = await selectRows<{ organization_id: string }>(
    "sites",
    `select=organization_id&id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = siteRes.data?.[0]?.organization_id;
  if (!organizationId) return { ok: false, status: 404, userId };

  const role = await getMemberRole(organizationId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!role || (ROLE_RANK[role] ?? -1) < ROLE_RANK[minRole]) {
    return { ok: false, status: 403, userId, organizationId };
  }

  return { ok: true, userId, organizationId, role };
}

/**
 * Те саме для project_id (Sites-конструктор, Commerce — прив'язані
 * до project_id, див. DATA_MODEL.md розділ 2.1).
 */
export async function requireOrgAccessForProject(
  request: Request,
  projectId: string,
  minRole: "viewer" | "editor" | "admin" | "owner",
  env: Env
): Promise<OrgAccessResult> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401 };

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return { ok: false, status: 401 };

  const projectRes = await selectRows<{ organization_id: string }>(
    "projects",
    `select=organization_id&id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = projectRes.data?.[0]?.organization_id;
  if (!organizationId) return { ok: false, status: 404, userId };

  const role = await getMemberRole(organizationId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!role || (ROLE_RANK[role] ?? -1) < ROLE_RANK[minRole]) {
    return { ok: false, status: 403, userId, organizationId };
  }

  return { ok: true, userId, organizationId, role };
}
