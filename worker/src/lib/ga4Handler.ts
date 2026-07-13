// ga4Handler.ts — Google Analytics 4 OAuth + синхронізація метрик.
// Структура один-в-один копіює gscHandler.ts (той самий OAuth-патерн:
// authorize → callback → encrypt refresh_token → щоденний cron sync),
// щоб не винаходити другий спосіб зберігання/оновлення Google-токенів
// у тому ж проєкті. Прив'язка до site_id (не project_id) — той самий
// патерн, що Rank/Audit (DATA_MODEL.md розділ 2.1, підтверджено
// коментарем у requireOrgAccessForSite в orgAuth.ts).
//
// Відмінності від GSC:
//   - GSC property = URL сайту (відомий одразу), GA4 property = вибір
//     зі списку accountSummaries (юзер може мати кілька GA4-акаунтів) —
//     тому є проміжний крок handleGa4PropertiesList після callback.
//   - Дані з Data API (runReport), а не Search Console API.

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { requireOrgAccessForSite } from "./orgAuth";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/analytics.readonly";

// ── AES-GCM шифрування refresh_token — той самий helper, що gscHandler.ts ──

async function getEncryptionKey(env: Env): Promise<CryptoKey> {
  const keyBytes = hexToBytes(env.GOOGLE_TOKEN_ENCRYPTION_KEY);
  return crypto.subtle.importKey("raw", keyBytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function encryptToken(token: string, env: Env): Promise<string> {
  const key = await getEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(token);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  return `${bytesToHex(iv)}:${bytesToHex(new Uint8Array(ciphertext))}`;
}

async function decryptToken(encrypted: string, env: Env): Promise<string> {
  const [ivHex, ciphertextHex] = encrypted.split(":");
  const key = await getEncryptionKey(env);
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(decrypted);
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

// ── GET /api/sites/:siteId/ga4/authorize ── редірект на Google OAuth ────
// Авторизація тут навмисно без requireOrgAccessForSite — це прямий
// browser-редірект (як у gscHandler.ts handleGscAuthorize), доступ
// перевіряється пізніше на кроці handleGa4Connect, коли зберігаємо
// зв'язок з реальним Authorization header.

export async function handleGa4Authorize(request: Request, env: Env, siteId: string): Promise<Response> {
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/ga4/callback`;
  const state = btoa(JSON.stringify({ siteId }));

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

// ── GET /api/ga4/callback ── Google повертає сюди з ?code=&state= ──────
// На відміну від GSC (одразу зберігає connection), тут проміжний крок:
// property заздалегідь невідомий (юзер може мати кілька GA4-акаунтів),
// тому редіректимо на сторінку вибору property з токеном у fragment
// (не query string — не потрапляє в server logs/Referer).

export async function handleGa4Callback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  if (!code || !stateParam) return new Response("Missing code or state", { status: 400 });

  let siteId: string;
  try {
    ({ siteId } = JSON.parse(atob(stateParam)));
  } catch {
    return new Response("Invalid state", { status: 400 });
  }

  const redirectUri = `${url.origin}/api/ga4/callback`;
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
  if (!tokenRes.ok) return new Response(`Token exchange failed: ${await tokenRes.text()}`, { status: 400 });

  const tokenData = (await tokenRes.json()) as { refresh_token?: string; access_token: string };
  if (!tokenData.refresh_token) {
    // Google не видає новий refresh_token, якщо юзер вже раз давав дозвіл
    // без прибирання доступу — access_type=offline+prompt=consent мають
    // це запобігати, але про всяк випадок повідомляємо явно, а не тихо
    // падаємо на decrypt неіснуючого токена пізніше.
    return new Response("Google не повернув refresh_token. Спробуйте відключити доступ додатку в Google Account → Security і повторити.", { status: 400 });
  }

  const encryptedRefreshToken = await encryptToken(tokenData.refresh_token, env);

  const appUrl = env.ENVIRONMENT === "production" ? "https://qorax.mrcru96.workers.dev" : url.origin;
  const redirect = new URL(`${appUrl}/dashboard/analytics/${siteId}/connect`);
  redirect.hash = `token=${encodeURIComponent(encryptedRefreshToken)}&access_token=${encodeURIComponent(tokenData.access_token)}`;

  return Response.redirect(redirect.toString(), 302);
}

// ── GET /api/ga4/properties?access_token=... ── список GA4 properties ──
// Викликається з /dashboard/analytics/:siteId/connect — юзер вибирає
// property зі списку, тоді фронт викликає handleGa4Connect нижче.
// access_token тут — короткоживучий Google OAuth token з fragment
// callback-редіректу вище, не Supabase Authorization header.

export async function handleGa4PropertiesList(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const accessToken = url.searchParams.get("access_token");
  if (!accessToken) return json({ error: "Missing access_token" }, 400, {});

  const res = await fetch("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return json({ error: `Google API error: ${await res.text()}` }, 400, {});

  const data = (await res.json()) as {
    accountSummaries?: Array<{ displayName: string; propertySummaries?: Array<{ property: string; displayName: string }> }>;
  };

  const properties = (data.accountSummaries ?? []).flatMap(account =>
    (account.propertySummaries ?? []).map(prop => ({
      property_id: prop.property, // формат "properties/123456789"
      display_name: prop.displayName,
      account_name: account.displayName,
    }))
  );

  return json({ properties }, 200, {});
}

// ── POST /api/sites/:siteId/ga4/connect ── зберегти зв'язок ─────────────

export async function handleGa4Connect(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireOrgAccessForSite(request, siteId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { property_id?: string; encrypted_refresh_token?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.property_id || !body.encrypted_refresh_token) {
    return json({ error: "property_id та encrypted_refresh_token обов'язкові" }, 400, corsHeaders);
  }

  const existingRes = await selectRows<{ id: string }>(
    "ga4_connections",
    `select=id&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (existingRes.data?.length) {
    const updateRes = await updateRows(
      "ga4_connections",
      `site_id=eq.${encodeURIComponent(siteId)}`,
      { property_id: body.property_id, encrypted_refresh_token: body.encrypted_refresh_token, is_active: true, connected_at: new Date().toISOString() },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);
  } else {
    const insertRes = await insertRow(
      "ga4_connections",
      { site_id: siteId, property_id: body.property_id, encrypted_refresh_token: body.encrypted_refresh_token },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);
  }

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /api/sites/:siteId/ga4/disconnect ───────────────────────────────

export async function handleGa4Disconnect(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireOrgAccessForSite(request, siteId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await updateRows(
    "ga4_connections",
    `site_id=eq.${encodeURIComponent(siteId)}`,
    { is_active: false },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/sites/:siteId/analytics ── зведення за період ──────────────

interface SnapshotRow {
  date: string;
  sessions: number | null;
  conversions: number | null;
  bounce_rate: number | null;
  source: string;
}

export async function handleAnalyticsSummary(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireOrgAccessForSite(request, siteId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const url = new URL(request.url);
  const days = Math.min(Math.max(parseInt(url.searchParams.get("days") ?? "30", 10) || 30, 1), 90);
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().slice(0, 10);

  const [connectionRes, snapshotRes] = await Promise.all([
    selectRows<{ property_id: string; is_active: boolean; last_synced_at: string | null }>(
      "ga4_connections",
      `select=property_id,is_active,last_synced_at&site_id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<SnapshotRow>(
      "analytics_daily_snapshot",
      `select=date,sessions,conversions,bounce_rate,source&site_id=eq.${encodeURIComponent(siteId)}&date=gte.${sinceStr}&order=date.asc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const connection = connectionRes.data?.[0] ?? null;
  const snapshots = snapshotRes.data ?? [];

  const totals = snapshots.reduce(
    (acc, row) => {
      acc.sessions += row.sessions ?? 0;
      acc.conversions += row.conversions ?? 0;
      return acc;
    },
    { sessions: 0, conversions: 0 }
  );
  const bounceRateRows = snapshots.filter(r => r.bounce_rate !== null);
  const avgBounceRate = bounceRateRows.length > 0 ? bounceRateRows.reduce((sum, row) => sum + (row.bounce_rate ?? 0), 0) / bounceRateRows.length : 0;

  return json(
    {
      connected: !!connection?.is_active,
      last_synced_at: connection?.last_synced_at ?? null,
      totals: { sessions: totals.sessions, conversions: totals.conversions, bounce_rate: Math.round(avgBounceRate * 1000) / 1000 },
      daily: snapshots,
    },
    200,
    corsHeaders
  );
}

// ── Cron sync — викликається з index.ts scheduled handler ──────────────
// Той самий блок виклику, що runGscSync (0 3 * * * у index.ts).

export async function runGa4Sync(env: Env): Promise<void> {
  const connectionsRes = await selectRows<{ site_id: string; property_id: string; encrypted_refresh_token: string }>(
    "ga4_connections",
    "select=site_id,property_id,encrypted_refresh_token&is_active=eq.true",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!connectionsRes.ok || !connectionsRes.data) return;

  for (const conn of connectionsRes.data) {
    try {
      await syncSiteGa4Data(conn.site_id, conn.property_id, conn.encrypted_refresh_token, env);
    } catch (err) {
      // Один сайт з битим токеном не повинен зупиняти синк решти сайтів
      // (той самий підхід, що runGscSync) — просто логуємо і йдемо далі.
      console.error(`GA4 sync failed for site ${conn.site_id}:`, err);
    }
  }
}

async function syncSiteGa4Data(siteId: string, propertyId: string, encryptedRefreshToken: string, env: Env): Promise<void> {
  const refreshToken = await decryptToken(encryptedRefreshToken, env);

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });
  if (!tokenRes.ok) throw new Error(`Token refresh failed: ${await tokenRes.text()}`);
  const { access_token: accessToken } = (await tokenRes.json()) as { access_token: string };

  // Щоденний звіт за останні 7 днів (rolling window — GA4 дані за останню
  // добу можуть допрацьовуватись, тому синкаємо трохи назад щодня, а не
  // тільки "вчора", як GSC-синк).
  const reportRes = await fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "conversions" }, { name: "bounceRate" }],
    }),
  });
  if (!reportRes.ok) throw new Error(`runReport failed: ${await reportRes.text()}`);

  const report = (await reportRes.json()) as {
    rows?: Array<{ dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }>;
  };

  for (const row of report.rows ?? []) {
    const rawDate = row.dimensionValues[0]?.value; // формат YYYYMMDD
    if (!rawDate || rawDate.length !== 8) continue;
    const date = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;
    const sessions = parseInt(row.metricValues[0]?.value ?? "0", 10);
    const conversions = parseInt(row.metricValues[1]?.value ?? "0", 10);
    const bounceRate = parseFloat(row.metricValues[2]?.value ?? "0");

    await fetch(`${env.SUPABASE_URL}/rest/v1/analytics_daily_snapshot`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ site_id: siteId, date, sessions, conversions, bounce_rate: bounceRate, source: "ga4" }),
    });
  }

  await updateRows(
    "ga4_connections",
    `site_id=eq.${encodeURIComponent(siteId)}`,
    { last_synced_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
}
