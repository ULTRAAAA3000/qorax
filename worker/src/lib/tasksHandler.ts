// ============================================================
// tasksHandler.ts — Qorax AI Tasks (хвиля 3, шостий UI-крок).
//
// EXECUTION_PLAN.md ("Agents — п'ятий UI-крок хвилі 3"): Tasks і
// Automations свідомо лишені на потім. Схема (ai_tasks) і RLS уже
// готові з 0049_qorax_ai_hub.sql — цей файл лише worker-логіка й UI.
//
// MODULE_ROADMAP.md (рядок "Tasks — список ai_tasks з фільтром за
// статусом"): MVP — ручна черга задач (створити/переглянути/змінити
// статус/видалити), БЕЗ автоматичного заповнення з агентів у цьому
// проході. `agent_id`/`agent_run_id` — nullable FK, які підключаються
// пізніше, коли Automations запускатиме агентів за розкладом і сам
// створюватиме записи в ai_tasks (roadmap явно розділяє Tasks і
// Automations на дві незалежні вкладки — MVP кожної не вимагає іншої).
// ============================================================

import { selectRows, insertRow, updateRows } from "./supabase";
import type { Env } from "../types";
import { corsHeaders as sharedCorsHeaders } from "./cors";

const VALID_STATUSES = ["pending", "in_progress", "done", "failed"];

interface TaskRow {
  id: string;
  organization_id: string;
  agent_id: string | null;
  description: string;
  status: string;
  agent_run_id: string | null;
  created_at: string;
}

async function authenticate(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "").trim();
  if (!jwt) return null;

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userResp.ok) return null;
  return ((await userResp.json()) as { id: string }).id;
}

// ─── GET /api/tasks?status=... ──────────────────────────────
// Список задач організації, опційний фільтр за статусом (той самий
// UX, що roadmap явно просить: "список ai_tasks з фільтром за статусом")

export async function handleTasksListRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) return jsonResponse({ error: "Організацію не знайдено" }, 404, corsHeaders);

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");
    let query = `select=id,organization_id,agent_id,description,status,agent_run_id,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=100`;
    if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
      query += `&status=eq.${encodeURIComponent(statusFilter)}`;
    }

    const result = await selectRows<TaskRow>("ai_tasks", query, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    return jsonResponse({ tasks: result.data }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── POST /api/tasks ── body: { description, agent_id? } ───────
// Ручне створення задачі — editor+ (ai_tasks_insert_own_org policy)

export async function handleTaskCreateRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    let body: { description?: string; agent_id?: string | null };
    try {
      body = (await request.json()) as { description?: string; agent_id?: string | null };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }

    const description = body.description?.trim();
    if (!description) return jsonResponse({ error: "Опис задачі обов'язковий" }, 400, corsHeaders);
    if (description.length > 1000) return jsonResponse({ error: "Опис задачі занадто довгий (макс. 1000 символів)" }, 400, corsHeaders);

    // agent_id — опційна прив'язка до довідника agents (не обов'язкова
    // для ручної задачі; nullable FK, on delete set null у схемі)
    let agentId: string | null = null;
    if (body.agent_id) {
      const agentResult = await selectRows<{ id: string }>(
        "agents",
        `select=id&id=eq.${encodeURIComponent(body.agent_id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (agentResult.data[0]) agentId = body.agent_id;
    }

    const insertResult = await insertRow(
      "ai_tasks",
      { organization_id: organizationId, agent_id: agentId, description, status: "pending" },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!insertResult.ok) {
      console.error("[tasks] insert failed:", insertResult.error);
      return jsonResponse({ error: "Не вдалося створити задачу" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 201, corsHeaders);
  } catch (err) {
    console.error("[tasks] create unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── PATCH /api/tasks/:id ── body: { status } ───────────────────
// Зміна статусу — editor+ (ai_tasks_update_own_org policy). Ручний
// перехід pending → in_progress → done/failed; MVP не автоматизує
// цей перехід (Automations, наступний крок, робитиме це за агента).

export async function handleTaskUpdateRequest(
  request: Request,
  env: Env,
  origin: string | null,
  taskId: string,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    let body: { status?: string };
    try {
      body = (await request.json()) as { status?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }

    if (!body.status || !VALID_STATUSES.includes(body.status)) {
      return jsonResponse({ error: `status має бути одним з: ${VALID_STATUSES.join(", ")}` }, 400, corsHeaders);
    }

    // Ownership check ДО update — переконуємось, що задача належить
    // саме організації користувача, не просто "будь-який id, що існує"
    const taskResult = await selectRows<{ id: string }>(
      "ai_tasks",
      `select=id&id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!taskResult.data[0]) return jsonResponse({ error: "Задачу не знайдено" }, 404, corsHeaders);

    const updateResult = await updateRows(
      "ai_tasks",
      `id=eq.${encodeURIComponent(taskId)}`,
      { status: body.status },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!updateResult.ok) {
      console.error("[tasks] update failed:", updateResult.error);
      return jsonResponse({ error: "Не вдалося оновити задачу" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] update unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── DELETE /api/tasks/:id ── admin+ (ai_tasks_delete_own_org policy) ──

export async function handleTaskDeleteRequest(
  request: Request,
  env: Env,
  origin: string | null,
  taskId: string,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin)&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    const taskResult = await selectRows<{ id: string }>(
      "ai_tasks",
      `select=id&id=eq.${encodeURIComponent(taskId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!taskResult.data[0]) return jsonResponse({ error: "Задачу не знайдено" }, 404, corsHeaders);

    const deleteResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ai_tasks?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          Prefer: "return=minimal",
        },
      }
    );
    if (!deleteResp.ok) {
      console.error("[tasks] delete failed:", deleteResp.status, await deleteResp.text());
      return jsonResponse({ error: "Не вдалося видалити задачу" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] delete unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
