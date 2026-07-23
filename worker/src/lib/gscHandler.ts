import type { Env } from "../types";
import { hasProTierAccess } from "./planTiers";
import { selectRows, upsertRow, updateRows } from "./supabase";
import { addInboxItem } from "./aiInbox";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const GSC_API = "https://www.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ── AES-GCM encryption ───────────────────────────────────────────────────────

async function getKey(hexKey: string): Promise<CryptoKey> {
  const raw = hexToBytes(hexKey.slice(0, 32).padEnd(32, "0"));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}
function bytesToBase64(bytes: Uint8Array): string { return btoa(String.fromCharCode(...bytes)); }
function base64ToBytes(b64: string): Uint8Array { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }

async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ct))}`;
}
async function decrypt(encrypted: string, hexKey: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(".");
  const key = await getKey(hexKey);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(ivB64) }, key, base64ToBytes(ctB64));
  return new TextDecoder().decode(plain);
}

// ── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ── Auth helpers ─────────────────────────────────────────────────────────────

async function getUserIdFromToken(token: string, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: serviceKey },
    });
    if (!res.ok) return null;
    return ((await res.json()) as { id: string }).id ?? null;
  } catch { return null; }
}

async function getOrgIdForSite(siteId: string, userId: string, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  const siteRes = await selectRows<{ organization_id: string }>(
    "sites", `select=organization_id&id=eq.${encodeURIComponent(siteId)}`, supabaseUrl, serviceKey
  );
  const orgId = siteRes.data?.[0]?.organization_id;
  if (!orgId) return null;

  const memberRes = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&organization_id=eq.${encodeURIComponent(orgId)}&user_id=eq.${encodeURIComponent(userId)}`,
    supabaseUrl, serviceKey
  );
  return memberRes.data?.[0] ? orgId : null;
}

async function canUseGsc(orgId: string, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  const res = await selectRows<{ status: string; plans: { code: string } }>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(orgId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
    supabaseUrl, serviceKey
  );
  const code = (res.data?.[0]?.plans as { code: string } | null)?.code ?? "";
  return hasProTierAccess(code);
}

// ── Route: GET /api/gsc/auth ─────────────────────────────────────────────────

export function handleGscAuth(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const accessToken = url.searchParams.get("access_token");
  if (!siteId || !accessToken) return new Response("Missing site_id or access_token", { status: 400 });

  const redirectUri = `${new URL(request.url).origin}/api/gsc/callback`;
  const state = btoa(JSON.stringify({ siteId, accessToken }));

  const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  oauthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("scope", SCOPES);
  oauthUrl.searchParams.set("access_type", "offline");
  oauthUrl.searchParams.set("prompt", "consent");
  oauthUrl.searchParams.set("state", state);

  return Response.redirect(oauthUrl.toString(), 302);
}

// ── Route: GET /api/gsc/callback ─────────────────────────────────────────────

export async function handleGscCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const appBase = env.APP_URL || "https://qorax.mrcru96.workers.dev";

  if (url.searchParams.get("error") || !code || !stateRaw)
    return Response.redirect(`${appBase}/dashboard?gsc_error=denied`, 302);

  let siteId: string, accessToken: string;
  try { ({ siteId, accessToken } = JSON.parse(atob(stateRaw))); }
  catch { return Response.redirect(`${appBase}/dashboard?gsc_error=state`, 302); }

  const userId = await getUserIdFromToken(accessToken, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return Response.redirect(`${appBase}/dashboard?gsc_error=auth`, 302);

  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=site`, 302);

  if (!await canUseGsc(orgId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY))
    return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=plan`, 302);

  // Exchange code → tokens
  const redirectUri = `${new URL(request.url).origin}/api/gsc/callback`;
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=token`, 302);

  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokens.refresh_token) return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=no_refresh_token`, 302);

  // Get site URL
  const siteRes = await selectRows<{ url: string }>("sites", `select=url&id=eq.${encodeURIComponent(siteId)}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const siteUrl = siteRes.data?.[0]?.url;
  if (!siteUrl) return Response.redirect(`${appBase}/dashboard?gsc_error=site`, 302);

  const propertyUrl = siteUrl.endsWith("/") ? siteUrl : siteUrl + "/";
  const encryptedToken = await encrypt(tokens.refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY);

  await upsertRow("gsc_connections", {
    site_id: siteId,
    gsc_property_url: propertyUrl,
    encrypted_refresh_token: encryptedToken,
    is_active: true,
    connected_at: new Date().toISOString(),
  }, "site_id", env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Trigger initial sync (fire and forget)
  syncGscForSite(siteId, tokens.access_token, propertyUrl, env).catch(console.error);

  return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_connected=1`, 302);
}

// ── Route: GET /api/gsc/metrics ──────────────────────────────────────────────

export async function handleGscMetrics(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!siteId || !token) return json([], 200, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  // Перевіряємо доступ до сайту
  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Not found" }, 404, corsHeaders);

  // Читаємо метрики через service role key (обходить RLS)
  const res = await selectRows<{
    date: string; clicks: number; impressions: number;
    ctr: number | null; average_position: number | null;
    page_url: string | null; query: string | null;
  }>(
    "gsc_metrics",
    `select=date,clicks,impressions,ctr,average_position,page_url,query&site_id=eq.${encodeURIComponent(siteId)}&order=date.desc,clicks.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return json(res.data ?? [], 200, corsHeaders);
}

// ── Route: GET /api/gsc/status ───────────────────────────────────────────────

export async function handleGscStatus(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!siteId || !token) return json({ connected: false }, 200, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ connected: false }, 200, corsHeaders);

  const res = await selectRows<{ gsc_property_url: string; last_synced_at: string; is_active: boolean }>(
    "gsc_connections", `select=gsc_property_url,last_synced_at,is_active&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY
  );
  const conn = res.data?.[0];
  return json({ connected: !!conn?.is_active, property_url: conn?.gsc_property_url ?? null, last_synced_at: conn?.last_synced_at ?? null }, 200, corsHeaders);
}

// ── Route: POST /api/gsc/disconnect ──────────────────────────────────────────

export async function handleGscDisconnect(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const { site_id: siteId } = (await request.json()) as { site_id: string };
  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Not found" }, 404, corsHeaders);

  await updateRows("gsc_connections", `site_id=eq.${encodeURIComponent(siteId)}`, { is_active: false }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  return json({ ok: true }, 200, corsHeaders);
}

// ── Route: POST /api/gsc/sync ─────────────────────────────────────────────────

export async function handleGscSyncRequest(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const { site_id: siteId } = (await request.json()) as { site_id: string };
  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const result = await syncGscFromDb(siteId, env);
  return json(result, result.ok ? 200 : 400, corsHeaders);
}

// ── Cron sync — all active connections ───────────────────────────────────────

export async function runGscSync(env: Env): Promise<void> {
  const res = await selectRows<{ site_id: string }>(
    "gsc_connections", "select=site_id&is_active=eq.true", env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.data?.length) return;
  console.log(`GSC sync: ${res.data.length} sites`);
  await Promise.allSettled(res.data.map(({ site_id }) => syncGscFromDb(site_id, env)));
}

// ── Core: sync one site from DB ───────────────────────────────────────────────

async function syncGscFromDb(siteId: string, env: Env): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const connRes = await selectRows<{ encrypted_refresh_token: string; gsc_property_url: string }>(
    "gsc_connections",
    `select=encrypted_refresh_token,gsc_property_url&site_id=eq.${encodeURIComponent(siteId)}&is_active=eq.true`,
    env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY
  );
  const conn = connRes.data?.[0];
  if (!conn) return { ok: false, error: "No active connection" };

  let refreshToken: string;
  try { refreshToken = await decrypt(conn.encrypted_refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY); }
  catch { return { ok: false, error: "Decrypt failed" }; }

  let accessToken: string;
  try { accessToken = await refreshAccessToken(refreshToken, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET); }
  catch (e) {
    await updateRows("gsc_connections", `site_id=eq.${encodeURIComponent(siteId)}`, { is_active: false }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return { ok: false, error: String(e) };
  }

  return syncGscForSite(siteId, accessToken, conn.gsc_property_url, env);
}

// ── Core: fetch GSC API + store ───────────────────────────────────────────────

async function syncGscForSite(siteId: string, accessToken: string, propertyUrl: string, env: Env): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 28);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(new Date());

  const gscFetch = async (dimensions: string[], rowLimit = 28, orderBy?: object[], dimensionFilterGroups?: object[]) => {
    const body: Record<string, unknown> = { startDate: fmt(start), endDate: fmt(end), dimensions, rowLimit };
    if (orderBy) body.orderBy = orderBy;
    if (dimensionFilterGroups) body.dimensionFilterGroups = dimensionFilterGroups;
    const res = await fetch(`${GSC_API}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      if (res.status === 403 || res.status === 401)
        await updateRows("gsc_connections", `site_id=eq.${encodeURIComponent(siteId)}`, { is_active: false }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      throw new Error(`GSC API ${res.status}: ${await res.text()}`);
    }
    return (await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
  };

  try {
    // Модуль Rank: запити, які власник явно відстежує (rank_tracked_queries).
    // Топ-10 по кліках (queriesData нижче) не гарантує покриття нішевих
    // запитів — тому для tracked-запитів окремо тягнемо історію по датах
    // з GSC-фільтром по конкретному тексту запиту (contains-match).
    const trackedQueriesResult = await selectRows<{ query: string }>(
      "rank_tracked_queries",
      `site_id=eq.${encodeURIComponent(siteId)}&select=query`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const trackedQueries = trackedQueriesResult.ok ? trackedQueriesResult.data : [];

    const [aggData, pagesData, queriesData, ...trackedHistories] = await Promise.all([
      gscFetch(["date"], 28),
      gscFetch(["page"], 10, [{ fieldName: "clicks", sortOrder: "DESCENDING" }]),
      gscFetch(["query"], 10, [{ fieldName: "clicks", sortOrder: "DESCENDING" }]),
      ...trackedQueries.map(tq =>
        gscFetch(["date"], 28, undefined, [
          { filters: [{ dimension: "query", operator: "equals", expression: tq.query }] },
        ])
      ),
    ]);

    const rows: Record<string, unknown>[] = [];

    for (const r of aggData.rows ?? []) {
      rows.push({ site_id: siteId, date: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, average_position: r.position, page_url: null, query: null, synced_at: new Date().toISOString() });
    }
    for (const r of pagesData.rows ?? []) {
      rows.push({ site_id: siteId, date: today, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, average_position: r.position, page_url: r.keys[0], query: null, synced_at: new Date().toISOString() });
    }
    for (const r of queriesData.rows ?? []) {
      rows.push({ site_id: siteId, date: today, clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, average_position: r.position, page_url: null, query: r.keys[0], synced_at: new Date().toISOString() });
    }
    trackedHistories.forEach((history, i) => {
      const query = trackedQueries[i].query;
      for (const r of history.rows ?? []) {
        rows.push({ site_id: siteId, date: r.keys[0], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, average_position: r.position, page_url: null, query, synced_at: new Date().toISOString() });
      }
    });

    // Upsert rows one-by-one (REST API doesn't support multi-row upsert with complex conflict columns easily)
    let saved = 0;
    for (const row of rows) {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/gsc_metrics?on_conflict=site_id,date,page_url,query`,
        {
          method: "POST",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal",
          },
          body: JSON.stringify(row),
        }
      );
      if (res.ok) saved++;
    }

    await updateRows("gsc_connections", `site_id=eq.${encodeURIComponent(siteId)}`, { last_synced_at: new Date().toISOString() }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

    // AI Inbox (MODULE_ROADMAP.md, хвиля 4, розділ 12) — просте порівняння
    // "вчора vs сьогодні" по кожному tracked-запиту, не нова ML-модель:
    // якщо позиція погіршала на 5+ і запит раніше входив у топ-20 (був
    // сенс його відстежувати), додаємо запис в інбокс. Не блокує sync —
    // помилки тут ігноруються (addInboxItem сам не кидає виняток), але
    // await обов'язковий: без нього функція повертається раніше, ніж
    // запис в inbox встигає піти (той самий клас бага, що ctx.waitUntil
    // з кількома аргументами замість Promise.all).
    let siteForInboxCache: { organization_id: string; display_name: string } | null = null;
    await Promise.all(
      trackedHistories.map(async (history, i) => {
        const query = trackedQueries[i].query;
        const sorted = (history.rows ?? []).slice().sort((a, b) => a.keys[0].localeCompare(b.keys[0]));
        if (sorted.length < 2) return;
        const previous = sorted[sorted.length - 2];
        const latest = sorted[sorted.length - 1];
        const drop = latest.position - previous.position;
        if (drop < 5 || previous.position > 20) return;

        if (!siteForInboxCache) {
          const siteRes = await selectRows<{ organization_id: string; display_name: string }>(
            "sites",
            `select=organization_id,display_name&id=eq.${encodeURIComponent(siteId)}&limit=1`,
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY
          );
          siteForInboxCache = siteRes.data?.[0] ?? null;
        }
        if (!siteForInboxCache) return;

        await addInboxItem(
          {
            organizationId: siteForInboxCache.organization_id,
            siteId,
            title: `${siteForInboxCache.display_name}: «${query}» впав з позиції ${Math.round(previous.position)} на ${Math.round(latest.position)}`,
            reason: `Падіння на ${Math.round(drop)} позицій за останній день`,
            source: "rank",
            suggestedAgentId: "rank",
          },
          { SUPABASE_URL: env.SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY }
        );
      })
    ).catch(e => console.warn("[gscHandler] rank drop inbox hook failed:", e));

    return { ok: true, rows: saved };
  } catch (e) {
    console.error("GSC sync error:", e);
    return { ok: false, error: String(e) };
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

export { getUserIdFromToken, getOrgIdForSite };
