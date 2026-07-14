// ============================================================
// teamWorkspaceHandler.ts — Team Workspace (концептуальний документ
// "AI Business Operating System", п'ять напрямків). MVP-фундамент:
// задачі команди (людям), коментарі до довільної сутності, публічний
// фід дій. Approval Flow і повний Workspace Dashboard — наступні
// кроки поверх цього, не цей файл.
//
// Переюзовує requireOrgAccess()/json() з Фази 0 (orgAuth.ts,
// httpUtils.ts) — той самий шаблон, що crmHandler.ts.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";

const VALID_STATUSES = ["todo", "in_progress", "done"];

// ── Внутрішній helper: запис у activity_feed. Не найдено спільного
// helper'а на кшталт logSecurityEvent() для ПУБЛІЧНОГО (не приватного)
// фіда — окремий від security_audit_log намір (SECURITY.md розділ 8:
// той приватний для owner/admin, цей публічний для всіх членів). ──

async function logActivity(
  env: Env,
  params: { organizationId: string; actorId: string | null; actionType: string; targetTable?: string; targetId?: string; summary: string }
): Promise<void> {
  try {
    await insertRow(
      "activity_feed",
      {
        organization_id: params.organizationId,
        actor_id: params.actorId,
        action_type: params.actionType,
        target_table: params.targetTable ?? null,
        target_id: params.targetId ?? null,
        summary: params.summary,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (err) {
    // Той самий принцип, що logSecurityEvent() — не блокувати основну
    // дію, якщо запис у фід з якоїсь причини не вдався.
    console.error("[team-workspace] failed to log activity", params.actionType, err);
  }
}

// ── GET /api/team/tasks?organization_id=... ──

interface TeamTask {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_id: string | null;
  created_by: string | null;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export async function handleTeamTasksList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<TeamTask>(
    "team_tasks",
    `select=id,organization_id,title,description,status,assignee_id,created_by,due_date,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ tasks: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/team/tasks ── body: { organization_id, title, description?, assignee_id?, due_date? }

export async function handleTeamTaskCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; title?: string; description?: string; assignee_id?: string; due_date?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const title = body.title?.trim();
  if (!title || title.length > 200) return json({ error: "Некоректна назва задачі" }, 400, corsHeaders);

  // Ownership verification (SECURITY.md розділ 5): assignee_id, якщо
  // заданий, має бути реальним членом ЦІЄЇ організації — інакше
  // задачу можна було б призначити довільному user_id поза командою.
  if (body.assignee_id) {
    const memberCheck = await selectRows<{ user_id: string }>(
      "organization_members",
      `select=user_id&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(body.assignee_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data?.[0]) return json({ error: "assignee_id не є членом цієї організації" }, 400, corsHeaders);
  }

  const insertRes = await insertRow(
    "team_tasks",
    {
      organization_id: organizationId,
      title,
      description: body.description?.trim() || null,
      assignee_id: body.assignee_id || null,
      created_by: access.userId,
      due_date: body.due_date || null,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  await logActivity(env, {
    organizationId,
    actorId: access.userId ?? null,
    actionType: "task_created",
    targetTable: "team_tasks",
    summary: `створив(ла) задачу "${title}"`,
  });

  return json({ ok: true }, 201, corsHeaders);
}

// ── PATCH /api/team/tasks/:id ── body: { organization_id, status } — зміна статусу (канбан)

export async function handleTeamTaskStatusUpdate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  taskId: string
): Promise<Response> {
  let body: { organization_id?: string; status?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const status = body.status;
  if (!status || !VALID_STATUSES.includes(status)) {
    return json({ error: `status має бути одним з: ${VALID_STATUSES.join(", ")}` }, 400, corsHeaders);
  }

  // Ownership verification (SECURITY.md розділ 5): задача дійсно
  // належить цій organization_id, не тільки те, що юзер має доступ
  // до organization_id з тіла запиту.
  const taskRes = await selectRows<{ id: string; title: string }>(
    "team_tasks",
    `select=id,title&id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const task = taskRes.data?.[0];
  if (!task) return json({ error: "Задачу не знайдено" }, 404, corsHeaders);

  const updateRes = await updateRows(
    "team_tasks",
    `id=eq.${encodeURIComponent(taskId)}`,
    { status },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  if (status === "done") {
    await logActivity(env, {
      organizationId,
      actorId: access.userId ?? null,
      actionType: "task_completed",
      targetTable: "team_tasks",
      targetId: taskId,
      summary: `завершив(ла) задачу "${task.title}"`,
    });
  }

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/team/comments?organization_id=...&target_table=...&target_id=... ──

export async function handleTeamCommentsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  const targetTable = url.searchParams.get("target_table");
  const targetId = url.searchParams.get("target_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!targetTable || !targetId) return json({ error: "target_table і target_id обов'язкові" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<{ id: string; author_id: string | null; body: string; created_at: string }>(
    "team_comments",
    `select=id,author_id,body,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&target_table=eq.${encodeURIComponent(targetTable)}&target_id=eq.${encodeURIComponent(targetId)}&order=created_at.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ comments: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/team/comments ── body: { organization_id, target_table, target_id, body }

const ALLOWED_COMMENT_TARGETS = ["project_pages", "crm_deals", "products", "team_tasks"];

export async function handleTeamCommentCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; target_table?: string; target_id?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const targetTable = body.target_table;
  const targetId = body.target_id;
  if (!targetTable || !targetId) return json({ error: "target_table і target_id обов'язкові" }, 400, corsHeaders);
  if (!ALLOWED_COMMENT_TARGETS.includes(targetTable)) {
    return json({ error: `target_table має бути одним з: ${ALLOWED_COMMENT_TARGETS.join(", ")}` }, 400, corsHeaders);
  }

  const commentBody = body.body?.trim();
  if (!commentBody) return json({ error: "Текст коментаря обов'язковий" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "team_comments",
    {
      organization_id: organizationId,
      author_id: access.userId,
      target_table: targetTable,
      target_id: targetId,
      body: commentBody,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  await logActivity(env, {
    organizationId,
    actorId: access.userId ?? null,
    actionType: "comment_added",
    targetTable,
    targetId,
    summary: `залишив(ла) коментар`,
  });

  return json({ ok: true }, 201, corsHeaders);
}

// ── GET /api/team/activity?organization_id=... ──

interface ActivityFeedRow {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  action_type: string;
  target_table: string | null;
  target_id: string | null;
  summary: string;
  created_at: string;
}

export async function handleActivityFeedList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<ActivityFeedRow>(
    "activity_feed",
    `select=id,actor_id,actor_label,action_type,target_table,target_id,summary,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=50`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ activity: res.data ?? [] }, 200, corsHeaders);
}
