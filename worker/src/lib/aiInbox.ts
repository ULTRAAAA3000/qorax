// ============================================================
// aiInbox.ts — AI Inbox (MODULE_ROADMAP.md, "Четверта хвиля",
// розділ 12 "AI Operating System"). Перший (найдешевший) шматок
// того розділу: не новий детектор проблем, а об'єднання вже
// наявних сигналів (aiInsights.ts, checkSpeedDegradation в
// monitoring.ts, падіння позицій у gscHandler.ts) в один список.
//
// addInboxItem() викликається з місць, де проблему ВЖЕ виявлено —
// той самий принцип, що upsertNode() в knowledgeGraph.ts: не кидає
// виняток при помилці (інбокс — допоміжний UI-шар, не критичний
// шлях; фейл запису сюди не повинен ламати основний потік аудиту/
// sync). Дедуплікація: не створює новий запис, якщо схожий (той
// самий site_id+source+title) уже висить зі статусом 'new' —
// інакше щоденний аудит заспамить інбокс однією й тією ж
// проблемою щодня.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { corsHeaders as sharedCorsHeaders } from "./cors";

export type InboxSource = "rank" | "audit" | "cro" | "ceo_agent";

// Мінімальний доступ до Supabase, а не повний Env — addInboxItem
// викликається з місць (monitoring.ts, gscHandler.ts), де на руках
// часто лише supabaseUrl/serviceRoleKey як окремі рядки, не об'єкт
// Env цілком.
interface SupabaseCreds {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
}

interface InboxItemRow {
  id: string;
  organization_id: string;
  site_id: string | null;
  title: string;
  reason: string;
  source: InboxSource;
  suggested_agent_id: string | null;
  status: "new" | "accepted" | "dismissed";
  created_at: string;
}

export async function addInboxItem(
  params: {
    organizationId: string;
    siteId?: string | null;
    title: string;
    reason: string;
    source: InboxSource;
    suggestedAgentId?: string | null;
  },
  env: SupabaseCreds
): Promise<void> {
  try {
    const dupCheck = await selectRows<{ id: string }>(
      "ai_inbox_items",
      `select=id&organization_id=eq.${encodeURIComponent(params.organizationId)}&title=eq.${encodeURIComponent(params.title)}&source=eq.${encodeURIComponent(params.source)}&status=eq.new&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if ((dupCheck.data ?? []).length > 0) return; // вже висить нерозглянутим — не дублюємо

    await insertRow(
      "ai_inbox_items",
      {
        organization_id: params.organizationId,
        site_id: params.siteId ?? null,
        title: params.title,
        reason: params.reason,
        source: params.source,
        suggested_agent_id: params.suggestedAgentId ?? null,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (err) {
    console.error("[aiInbox] addInboxItem failed:", err instanceof Error ? err.message : err);
  }
}

// ─── HTTP handlers ────────────────────────────────────────────
// Той самий патерн authenticate()/getOrganizationId(), що в
// taskHandler.ts — organization_id виводиться з JWT, а не з
// query-параметра.

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

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

// ── GET /api/ai/inbox?status=new|accepted|dismissed (default: new) ──

export async function handleInboxListRequest(
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
    const status = url.searchParams.get("status") ?? "new";

    const res = await selectRows<InboxItemRow>(
      "ai_inbox_items",
      `select=id,organization_id,site_id,title,reason,source,suggested_agent_id,status,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.${encodeURIComponent(status)}&order=created_at.desc&limit=50`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!res.ok) return jsonResponse({ error: res.error }, 500, corsHeaders);

    return jsonResponse({ items: res.data ?? [] }, 200, corsHeaders);
  } catch (err) {
    console.error("[aiInbox] list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ── PATCH /api/ai/inbox/:id — body: { status: 'accepted' | 'dismissed' } ──
//
// НЕ запускає агента автоматично (немає єдиного runAgent(agentId) —
// окремі per-agent HTTP-хендлери в agentHandler.ts очікують
// повноцінний Request з власною авторизацією/лімітами, вбудовувати
// їх виклик звідси означало б дублювати ту логіку тут). 'accepted'
// лише фіксує, що користувач погодився з рекомендацією — UI веде
// його на відповідний модуль (suggested_agent_id підказує, який),
// де він запускає агента звичайним шляхом. Задокументовано як
// свідоме спрощення MVP в EXECUTION_PLAN.md.

export async function handleInboxUpdateRequest(
  request: Request,
  itemId: string,
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

    let body: { status?: string };
    try {
      body = await request.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, corsHeaders);
    }
    if (body.status !== "accepted" && body.status !== "dismissed") {
      return jsonResponse({ error: "status має бути 'accepted' або 'dismissed'" }, 400, corsHeaders);
    }

    const updateRes = await updateRows(
      "ai_inbox_items",
      `id=eq.${encodeURIComponent(itemId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
      { status: body.status },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!updateRes.ok) return jsonResponse({ error: updateRes.error }, 500, corsHeaders);

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[aiInbox] update unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}
