// ============================================================
// gscHandler.ts — Google Search Console OAuth + sync
//
// Routes handled by index.ts:
//   GET  /api/gsc/auth       → redirect to Google OAuth consent
//   GET  /api/gsc/callback   → exchange code → store encrypted token
//   POST /api/gsc/sync       → manual sync for a site
//   POST /api/gsc/disconnect → remove connection
//   GET  /api/gsc/status     → check connection status for a site
// ============================================================

import type { Env } from "../types";
import { createSupabaseClient } from "./supabase";

const SCOPES = [
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/userinfo.email",
].join(" ");

const GSC_API = "https://www.googleapis.com/webmasters/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

// ── AES-GCM encryption (Web Crypto — available in Workers) ──────────────────

async function getKey(hexKey: string): Promise<CryptoKey> {
  const raw = hexToBytes(hexKey.slice(0, 32).padEnd(32, "0"));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function encrypt(plaintext: string, hexKey: string): Promise<string> {
  const key = await getKey(hexKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  // Store as "base64iv.base64ciphertext"
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

async function decrypt(encrypted: string, hexKey: string): Promise<string> {
  const [ivB64, ctB64] = encrypted.split(".");
  const key = await getKey(hexKey);
  const iv = base64ToBytes(ivB64);
  const ciphertext = base64ToBytes(ctB64);
  const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plaintext);
}

// ── Token refresh ────────────────────────────────────────────────────────────

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Verify JWT from frontend (Supabase access_token) ────────────────────────

async function getUserIdFromToken(
  token: string,
  supabaseUrl: string,
  serviceKey: string
): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: serviceKey,
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { id: string };
    return data.id ?? null;
  } catch {
    return null;
  }
}

async function getOrgIdForSite(
  supabase: ReturnType<typeof createSupabaseClient>,
  siteId: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("sites")
    .select("organization_id")
    .eq("id", siteId)
    .single();
  if (!data) return null;

  const { data: member } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("organization_id", data.organization_id)
    .eq("user_id", userId)
    .single();

  return member ? data.organization_id : null;
}

// ── Check plan allows GSC ─────────────────────────────────────────────────

async function canUseGsc(
  supabase: ReturnType<typeof createSupabaseClient>,
  orgId: string
): Promise<boolean> {
  const { data } = await supabase
    .from("subscriptions")
    .select("status, plans(code)")
    .eq("organization_id", orgId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const code = (data.plans as any)?.code as string | undefined;
  return ["growth", "agency", "admin", "trial"].includes(code ?? "");
}

// ── Route: GET /api/gsc/auth ─────────────────────────────────────────────────
// Redirect user to Google OAuth. Passes site_id + access_token in state.

export function handleGscAuth(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const accessToken = url.searchParams.get("access_token");

  if (!siteId || !accessToken) {
    return new Response("Missing site_id or access_token", { status: 400 });
  }

  const redirectUri = `${new URL(request.url).origin}/api/gsc/callback`;
  const state = btoa(JSON.stringify({ siteId, accessToken }));

  const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  oauthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("scope", SCOPES);
  oauthUrl.searchParams.set("access_type", "offline");
  oauthUrl.searchParams.set("prompt", "consent"); // force refresh_token
  oauthUrl.searchParams.set("state", state);

  return Response.redirect(oauthUrl.toString(), 302);
}

// ── Route: GET /api/gsc/callback ─────────────────────────────────────────────
// Google redirects here after consent. Exchange code → store token.

export async function handleGscCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const appBase = env.APP_URL || "https://qorax.mrcru96.workers.dev";

  if (error || !code || !stateRaw) {
    return Response.redirect(`${appBase}/dashboard?gsc_error=denied`, 302);
  }

  let siteId: string;
  let accessToken: string;
  try {
    const parsed = JSON.parse(atob(stateRaw));
    siteId = parsed.siteId;
    accessToken = parsed.accessToken;
  } catch {
    return Response.redirect(`${appBase}/dashboard?gsc_error=state`, 302);
  }

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Verify user
  const userId = await getUserIdFromToken(accessToken, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return Response.redirect(`${appBase}/dashboard?gsc_error=auth`, 302);

  // Check access to site
  const orgId = await getOrgIdForSite(supabase, siteId, userId);
  if (!orgId) return Response.redirect(`${appBase}/dashboard?gsc_error=site`, 302);

  // Check plan
  const allowed = await canUseGsc(supabase, orgId);
  if (!allowed) return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=plan`, 302);

  // Exchange code for tokens
  const redirectUri = `${new URL(request.url).origin}/api/gsc/callback`;
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    console.error("GSC token exchange failed:", await tokenRes.text());
    return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=token`, 302);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    scope: string;
  };

  if (!tokens.refresh_token) {
    return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=no_refresh_token`, 302);
  }

  // Get site URL to use as GSC property
  const { data: site } = await supabase.from("sites").select("url").eq("id", siteId).single();
  if (!site) return Response.redirect(`${appBase}/dashboard?gsc_error=site`, 302);

  // Normalize property URL: GSC uses trailing slash for domain properties
  const propertyUrl = site.url.endsWith("/") ? site.url : site.url + "/";

  // Encrypt refresh token
  const encryptedToken = await encrypt(tokens.refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY);

  // Upsert gsc_connections
  const { error: dbErr } = await supabase.from("gsc_connections").upsert(
    {
      site_id: siteId,
      gsc_property_url: propertyUrl,
      encrypted_refresh_token: encryptedToken,
      is_active: true,
      connected_at: new Date().toISOString(),
    },
    { onConflict: "site_id" }
  );

  if (dbErr) {
    console.error("GSC upsert error:", dbErr);
    return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_error=db`, 302);
  }

  // Trigger initial sync (fire and forget)
  syncGscForSite(siteId, tokens.access_token, propertyUrl, supabase).catch(console.error);

  return Response.redirect(`${appBase}/dashboard/sites/${siteId}?gsc_connected=1`, 302);
}

// ── Route: GET /api/gsc/status ───────────────────────────────────────────────

export async function handleGscStatus(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");

  if (!siteId || !token) return jsonResp({ connected: false }, 200, corsHeaders);

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return jsonResp({ connected: false }, 200, corsHeaders);

  const { data } = await supabase
    .from("gsc_connections")
    .select("gsc_property_url, last_synced_at, is_active")
    .eq("site_id", siteId)
    .single();

  return jsonResp({
    connected: !!data?.is_active,
    property_url: data?.gsc_property_url ?? null,
    last_synced_at: data?.last_synced_at ?? null,
  }, 200, corsHeaders);
}

// ── Route: POST /api/gsc/disconnect ──────────────────────────────────────────

export async function handleGscDisconnect(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return jsonResp({ error: "Unauthorized" }, 401, corsHeaders);

  const body = (await request.json()) as { site_id: string };
  const { site_id: siteId } = body;

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return jsonResp({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForSite(supabase, siteId, userId);
  if (!orgId) return jsonResp({ error: "Not found" }, 404, corsHeaders);

  await supabase.from("gsc_connections").delete().eq("site_id", siteId);
  await supabase.from("gsc_metrics").delete().eq("site_id", siteId);

  return jsonResp({ ok: true }, 200, corsHeaders);
}

// ── Route: POST /api/gsc/sync ─────────────────────────────────────────────────

export async function handleGscSyncRequest(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return jsonResp({ error: "Unauthorized" }, 401, corsHeaders);

  const body = (await request.json()) as { site_id: string };
  const { site_id: siteId } = body;

  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return jsonResp({ error: "Unauthorized" }, 401, corsHeaders);

  const result = await syncGscForSiteFromDb(siteId, supabase, env);
  return jsonResp(result, result.ok ? 200 : 400, corsHeaders);
}

// ── Core sync logic ──────────────────────────────────────────────────────────

export async function runGscSync(env: Env): Promise<void> {
  const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: connections } = await supabase
    .from("gsc_connections")
    .select("site_id")
    .eq("is_active", true);

  if (!connections?.length) return;

  console.log(`GSC sync: ${connections.length} sites`);

  await Promise.allSettled(
    connections.map(({ site_id }) =>
      syncGscForSiteFromDb(site_id, supabase, env).catch((e) =>
        console.error(`GSC sync failed for ${site_id}:`, e)
      )
    )
  );
}

async function syncGscForSiteFromDb(
  siteId: string,
  supabase: ReturnType<typeof createSupabaseClient>,
  env: Env
): Promise<{ ok: boolean; rows?: number; error?: string }> {
  const { data: conn } = await supabase
    .from("gsc_connections")
    .select("encrypted_refresh_token, gsc_property_url")
    .eq("site_id", siteId)
    .eq("is_active", true)
    .single();

  if (!conn) return { ok: false, error: "No active connection" };

  let refreshToken: string;
  try {
    refreshToken = await decrypt(conn.encrypted_refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  } catch {
    return { ok: false, error: "Decrypt failed" };
  }

  let accessToken: string;
  try {
    accessToken = await refreshAccessToken(refreshToken, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  } catch (e) {
    // Mark connection as inactive if refresh fails (revoked)
    await supabase.from("gsc_connections").update({ is_active: false }).eq("site_id", siteId);
    return { ok: false, error: String(e) };
  }

  return syncGscForSite(siteId, accessToken, conn.gsc_property_url, supabase);
}

async function syncGscForSite(
  siteId: string,
  accessToken: string,
  propertyUrl: string,
  supabase: ReturnType<typeof createSupabaseClient>
): Promise<{ ok: boolean; rows?: number; error?: string }> {
  // Fetch last 28 days of aggregated data
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 28);

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    // 1. Daily aggregates (clicks, impressions, ctr, position) — 28 rows
    const aggRes = await fetch(
      `${GSC_API}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["date"],
          rowLimit: 28,
        }),
      }
    );

    if (!aggRes.ok) {
      const err = await aggRes.text();
      console.error("GSC API error:", err);

      // Property not verified → mark inactive
      if (aggRes.status === 403 || aggRes.status === 401) {
        await supabase.from("gsc_connections").update({ is_active: false }).eq("site_id", siteId);
      }
      return { ok: false, error: `GSC API ${aggRes.status}` };
    }

    const aggData = (await aggRes.json()) as {
      rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
    };

    // 2. Top 10 pages (last 28 days aggregated)
    const pagesRes = await fetch(
      `${GSC_API}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["page"],
          rowLimit: 10,
          orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
        }),
      }
    );

    const pagesData = pagesRes.ok
      ? ((await pagesRes.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] })
      : { rows: [] };

    // 3. Top 10 queries
    const queriesRes = await fetch(
      `${GSC_API}/sites/${encodeURIComponent(propertyUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate: fmt(startDate),
          endDate: fmt(endDate),
          dimensions: ["query"],
          rowLimit: 10,
          orderBy: [{ fieldName: "clicks", sortOrder: "DESCENDING" }],
        }),
      }
    );

    const queriesData = queriesRes.ok
      ? ((await queriesRes.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] })
      : { rows: [] };

    // Build upsert rows
    const today = fmt(new Date());
    const rows: {
      site_id: string;
      date: string;
      clicks: number;
      impressions: number;
      ctr: number | null;
      average_position: number | null;
      page_url: string | null;
      query: string | null;
      synced_at: string;
    }[] = [];

    // Daily aggregate rows
    for (const row of aggData.rows ?? []) {
      rows.push({
        site_id: siteId,
        date: row.keys[0],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        average_position: row.position,
        page_url: null,
        query: null,
        synced_at: new Date().toISOString(),
      });
    }

    // Top pages — stored as single row with today's date + page_url
    for (const row of pagesData.rows ?? []) {
      rows.push({
        site_id: siteId,
        date: today,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        average_position: row.position,
        page_url: row.keys[0],
        query: null,
        synced_at: new Date().toISOString(),
      });
    }

    // Top queries — stored as single row with today's date + query
    for (const row of queriesData.rows ?? []) {
      rows.push({
        site_id: siteId,
        date: today,
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        average_position: row.position,
        page_url: null,
        query: row.keys[0],
        synced_at: new Date().toISOString(),
      });
    }

    if (rows.length === 0) {
      // No data yet (new site or no impressions) — still update last_synced_at
      await supabase.from("gsc_connections").update({ last_synced_at: new Date().toISOString() }).eq("site_id", siteId);
      return { ok: true, rows: 0 };
    }

    // Upsert — unique index: (site_id, date, coalesce(page_url,''), coalesce(query,''))
    const { error: upsertErr } = await supabase.from("gsc_metrics").upsert(rows, {
      onConflict: "site_id,date,page_url,query",
      ignoreDuplicates: false,
    });

    if (upsertErr) {
      console.error("GSC metrics upsert error:", upsertErr);
      return { ok: false, error: upsertErr.message };
    }

    // Update last_synced_at
    await supabase.from("gsc_connections").update({ last_synced_at: new Date().toISOString() }).eq("site_id", siteId);

    return { ok: true, rows: rows.length };
  } catch (e) {
    console.error("GSC sync exception:", e);
    return { ok: false, error: String(e) };
  }
}

function jsonResp(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}
