import type { Env } from "../types";
import { selectRows, insertRowReturning } from "./supabase";
import { getUserIdFromToken, getOrgIdForSite } from "./gscHandler";
import { upsertNode } from "./knowledgeGraph";

/**
 * Модуль Rank (MODULE_ROADMAP.md, розділ 1). Читає позиції з уже наявних
 * gsc_metrics (заповнюються GSC sync-циклом, включно з history для
 * tracked-запитів — див. syncGscForSite в gscHandler.ts). Цей файл
 * відповідає лише за CRUD над списком запитів, які власник сайту хоче
 * відстежувати — не за сам збір даних з Google.
 */

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

const MAX_TRACKED_QUERIES = 30; // м'який ліміт на сайт, незалежно від тарифу — захист від зловживання GSC API

// ── Route: GET /api/sites/:id/rank/queries — список tracked-запитів + остання позиція ──

export async function handleRankQueriesList(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Not found" }, 404, corsHeaders);

  const queriesRes = await selectRows<{ id: string; query: string; target_url: string | null; created_at: string }>(
    "rank_tracked_queries",
    `select=id,query,target_url,created_at&site_id=eq.${encodeURIComponent(siteId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!queriesRes.ok) return json({ error: queriesRes.error }, 500, corsHeaders);

  // Остання відома позиція по кожному tracked-запиту — з gsc_metrics
  // (query IS NOT NULL), найсвіжіший запис на запит
  const metricsRes = await selectRows<{ query: string; date: string; average_position: number | null; clicks: number; impressions: number }>(
    "gsc_metrics",
    `select=query,date,average_position,clicks,impressions&site_id=eq.${encodeURIComponent(siteId)}&query=not.is.null&order=date.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const latestByQuery = new Map<string, { date: string; average_position: number | null; clicks: number; impressions: number }>();
  for (const m of metricsRes.data ?? []) {
    if (!latestByQuery.has(m.query)) latestByQuery.set(m.query, m);
  }

  const queries = (queriesRes.data ?? []).map(q => ({
    ...q,
    latest: latestByQuery.get(q.query) ?? null,
  }));

  return json({ queries }, 200, corsHeaders);
}

// ── Route: POST /api/sites/:id/rank/queries — додати tracked-запит ──

export async function handleRankQueryCreate(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Not found" }, 404, corsHeaders);

  let body: { query?: string; target_url?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const query = body.query?.trim();
  if (!query || query.length > 200) return json({ error: "Некоректний запит" }, 400, corsHeaders);

  const existingRes = await selectRows<{ id: string }>(
    "rank_tracked_queries",
    `select=id&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if ((existingRes.data ?? []).length >= MAX_TRACKED_QUERIES) {
    return json({ error: `Максимум ${MAX_TRACKED_QUERIES} запитів на сайт` }, 400, corsHeaders);
  }

  const insertRes = await insertRowReturning<{ id: string }>(
    "rank_tracked_queries",
    { site_id: siteId, query, target_url: body.target_url?.trim() || null },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) {
    // unique(site_id, query) конфлікт — запит вже відстежується
    return json({ error: insertRes.error?.includes("duplicate") ? "Цей запит вже відстежується" : insertRes.error }, 400, corsHeaders);
  }

  const newQueryId = insertRes.data?.[0]?.id;
  if (newQueryId) {
    // Knowledge Graph (MODULE_ROADMAP.md, хвиля 4, розділ 14) — не блокує
    // основний потік, помилка ігнорується
    await upsertNode(orgId, "keyword", query, "rank_tracked_queries", newQueryId, env);
  }

  return json({ ok: true }, 201, corsHeaders);
}

// ── Route: DELETE /api/sites/:id/rank/queries/:queryId — прибрати tracked-запит ──

export async function handleRankQueryDelete(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string, queryId: string): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Not found" }, 404, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rank_tracked_queries?id=eq.${encodeURIComponent(queryId)}&site_id=eq.${encodeURIComponent(siteId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!res.ok) return json({ error: `Delete failed: ${res.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── Route: GET /api/sites/:id/rank/history?query=... — історія позиції по датах ──

export async function handleRankQueryHistory(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const url = new URL(request.url);
  const query = url.searchParams.get("query");
  if (!query) return json({ error: "query обов'язковий" }, 400, corsHeaders);

  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Not found" }, 404, corsHeaders);

  const res = await selectRows<{ date: string; average_position: number | null; clicks: number; impressions: number }>(
    "gsc_metrics",
    `select=date,average_position,clicks,impressions&site_id=eq.${encodeURIComponent(siteId)}&query=eq.${encodeURIComponent(query)}&order=date.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ history: res.data ?? [] }, 200, corsHeaders);
}
