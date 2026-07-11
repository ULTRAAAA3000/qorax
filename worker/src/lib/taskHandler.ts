// ============================================================
// taskHandler.ts — Qorax AI Tasks (хвиля 3, шостий UI-крок).
//
// EXECUTION_PLAN.md: після Chat/Workspace/Memory/Agents.
// MODULE_ROADMAP.md (рядок 1162): "список ai_tasks з фільтром за
// статусом" — навмисно проста реалізація, без окремого воркера
// виконання задач (немає "AI сам виконує задачу в фоні" — задачі
// або ручні, або створюються агентами як лог того, що вже сталось).
//
// Зв'язок з Agents: запуск content-агента (agentHandler.ts) тепер
// автоматично створює задачу (pending -> in_progress -> done/failed)
// — так Tasks одразу корисна вкладка, а не порожній ручний to-do.
// ============================================================

import { selectRows, insertRow, updateRows } from "./supabase";
import type { Env } from "../types";
import { corsHeaders as sharedCorsHeaders } from "./cors";

const VALID_STATUSES = ["pending", "in_progress", "done", "failed"] as const;
type TaskStatus = (typeof VALID_STATUSES)[number];

interface TaskRow {
  id: string;
  organization_id: string;
  agent_id: string | null;
  description: string;
  status: TaskStatus;
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

async function getOrganizationId(userId: string, env: Env): Promise<string | null> {
  const memberResult = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return memberResult.data[0]?.organization_id ?? null;
}

// ─── GET /api/tasks?status=... ───────────────────────────────

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

    const organizationId = await getOrganizationId(userId, env);
    if (!organizationId) return jsonResponse({ error: "Організацію не знайдено" }, 404, corsHeaders);

    const url = new URL(request.url);
    const statusFilter = url.searchParams.get("status");

    let query = `select=id,organization_id,agent_id,description,status,agent_run_id,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=100`;
    if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
      query += `&status=eq.${encodeURIComponent(statusFilter)}`;
    }

    const result = await selectRows<TaskRow>("ai_tasks", query, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    return jsonResponse({ tasks: result.data }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── POST /api/tasks ─────────────────────────────────────────
// Ручне створення задачі (agent_id завжди null для ручних — той
// самий підхід, що createTask() нижче використовує для агентських
// задач з agent_id заповненим)

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

    let body: { description?: string };
    try {
      body = (await request.json()) as { description?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }

    const description = body.description?.trim().slice(0, 500);
    if (!description) return jsonResponse({ error: "description обов'язковий" }, 400, corsHeaders);

    const taskId = crypto.randomUUID();
    const insertResult = await insertRow(
      "ai_tasks",
      { id: taskId, organization_id: organizationId, description, status: "pending" },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!insertResult.ok) {
      console.error("[tasks] create failed:", insertResult.error);
      return jsonResponse({ error: "Не вдалося створити задачу" }, 500, corsHeaders);
    }

    return jsonResponse({ id: taskId, description, status: "pending" }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] create unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── PATCH /api/tasks/:id ────────────────────────────────────
// Зміна статусу вручну (напр. позначити ручну задачу як done)

export async function handleTaskUpdateRequest(
  request: Request,
  taskId: string,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const taskResult = await selectRows<TaskRow>(
      "ai_tasks",
      `select=id,organization_id&id=eq.${encodeURIComponent(taskId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const task = taskResult.data[0];
    if (!task) return jsonResponse({ error: "Задачу не знайдено" }, 404, corsHeaders);

    const memberCheck = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&organization_id=eq.${encodeURIComponent(task.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    let body: { status?: string };
    try {
      body = (await request.json()) as { status?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }

    if (!body.status || !(VALID_STATUSES as readonly string[]).includes(body.status)) {
      return jsonResponse({ error: "Невірний статус" }, 400, corsHeaders);
    }

    const updateResult = await updateRows(
      "ai_tasks",
      `id=eq.${encodeURIComponent(taskId)}`,
      { status: body.status },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!updateResult.ok) {
      return jsonResponse({ error: "Не вдалося оновити задачу" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] update unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── DELETE /api/tasks/:id ───────────────────────────────────

export async function handleTaskDeleteRequest(
  request: Request,
  taskId: string,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const taskResult = await selectRows<TaskRow>(
      "ai_tasks",
      `select=id,organization_id&id=eq.${encodeURIComponent(taskId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const task = taskResult.data[0];
    if (!task) return jsonResponse({ error: "Задачу не знайдено" }, 404, corsHeaders);

    const memberCheck = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&organization_id=eq.${encodeURIComponent(task.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin)`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    const deleteResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ai_tasks?id=eq.${encodeURIComponent(taskId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );

    if (!deleteResp.ok) return jsonResponse({ error: "Не вдалося видалити задачу" }, 500, corsHeaders);

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[tasks] delete unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── Для використання в agentHandler.ts ──────────────────────
// Створює задачу від імені агента (agent_id заповнений, на відміну
// від ручних задач). Повертає id для подальшого оновлення статусу.

export async function createAgentTask(
  organizationId: string,
  agentId: string,
  description: string,
  env: Env
): Promise<string | null> {
  const taskId = crypto.randomUUID();
  const result = await insertRow(
    "ai_tasks",
    { id: taskId, organization_id: organizationId, agent_id: agentId, description, status: "in_progress" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return result.ok ? taskId : null;
}

export async function finishAgentTask(
  taskId: string,
  status: "done" | "failed",
  agentRunId: string | null,
  env: Env
): Promise<void> {
  await updateRows(
    "ai_tasks",
    `id=eq.${encodeURIComponent(taskId)}`,
    { status, agent_run_id: agentRunId },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
}

// ─── Helpers ─────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
