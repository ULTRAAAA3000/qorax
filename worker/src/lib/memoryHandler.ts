// ============================================================
// memoryHandler.ts — Qorax AI Memory (хвиля 3, третій UI-крок).
//
// EXECUTION_PLAN.md: після Chat і Workspace. MODULE_ROADMAP.md
// (рядок 1189): "проста форма, дешева технічно, дає AI одразу
// [контекст]" — тому реалізація навмисно проста: GET/PUT одного
// рядка на organization (ai_memory, 0049_qorax_ai_hub.sql), без
// жодної AI-логіки автогенерації полів.
//
// Інтеграція з Chat: business_summary/tone_preference/goals/
// competitors додаються в системний промпт chatHandler.ts (і
// site-scoped, і org-scoped гілки) — це і робить Memory реально
// корисною вкладкою, а не просто формою в порожнечу.
// ============================================================

import { selectRows, upsertRow } from "./supabase";
import type { Env } from "../types";
import { corsHeaders as sharedCorsHeaders } from "./cors";

interface MemoryRow {
  organization_id: string;
  business_summary: string | null;
  tone_preference: string | null;
  competitors: string[] | null;
  goals: string | null;
  updated_at: string;
}

interface MemoryUpdateBody {
  business_summary?: string | null;
  tone_preference?: string | null;
  competitors?: string[] | null;
  goals?: string | null;
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

// ─── GET /api/memory ─────────────────────────────────────────

export async function handleMemoryGetRequest(
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

    const result = await selectRows<MemoryRow>(
      "ai_memory",
      `select=organization_id,business_summary,tone_preference,competitors,goals,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const memory = result.data[0] ?? {
      organization_id: organizationId,
      business_summary: null,
      tone_preference: null,
      competitors: null,
      goals: null,
      updated_at: null,
    };

    return jsonResponse({ memory }, 200, corsHeaders);
  } catch (err) {
    console.error("[memory] get unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── PUT /api/memory ─────────────────────────────────────────

export async function handleMemoryUpdateRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    // Тільки owner/admin/editor можуть редагувати — той самий рівень
    // доступу, що ai_memory_update_own_org policy в 0049
    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    let body: MemoryUpdateBody;
    try {
      body = (await request.json()) as MemoryUpdateBody;
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }

    // Обмеження довжини — щоб довільно великий текст не роздував
    // системний промпт Chat (Memory додається в кожен запит до Gemini)
    const businessSummary = clampText(body.business_summary, 2000);
    const tonePreference = clampText(body.tone_preference, 500);
    const goals = clampText(body.goals, 2000);
    const competitors = Array.isArray(body.competitors)
      ? body.competitors.filter((c): c is string => typeof c === "string" && c.trim().length > 0).slice(0, 20)
      : null;

    const upsertResult = await upsertRow(
      "ai_memory",
      {
        organization_id: organizationId,
        business_summary: businessSummary,
        tone_preference: tonePreference,
        competitors,
        goals,
      },
      "organization_id",
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!upsertResult.ok) {
      console.error("[memory] upsert failed:", upsertResult.error);
      return jsonResponse({ error: "Не вдалося зберегти" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[memory] update unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── Для використання в chatHandler.ts ──────────────────────
// Повертає готовий текстовий блок для вставки в системний промпт,
// або null якщо Memory ще порожня (щоб не додавати порожній розділ
// в промпт даремно).

export async function buildMemoryContext(organizationId: string, env: Env): Promise<string | null> {
  const result = await selectRows<MemoryRow>(
    "ai_memory",
    `select=business_summary,tone_preference,competitors,goals&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const memory = result.data[0];
  if (!memory) return null;

  const lines: string[] = [];
  if (memory.business_summary) lines.push(`Чим займається бізнес: ${memory.business_summary}`);
  if (memory.tone_preference) lines.push(`Бажаний стиль спілкування: ${memory.tone_preference}`);
  if (memory.goals) lines.push(`Цілі користувача: ${memory.goals}`);
  if (memory.competitors && memory.competitors.length > 0) {
    lines.push(`Відомі конкуренти: ${memory.competitors.join(", ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

// ─── Helpers ─────────────────────────────────────────────────

function clampText(value: string | null | undefined, maxLength: number): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
