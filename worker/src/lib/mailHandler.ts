// ============================================================
// mailHandler.ts — Qorax Mail, Шар 1 (Inbox/Compose/Contacts/Files).
// MODULE_ROADMAP.md "Qorax Mail — окремий продукт екосистеми".
//
// OAuth-конектор до Gmail API (варіант 3 з документа) — той самий
// патерн, що вже працює для GSC у Rank-модулі (gscHandler.ts):
// authorization code flow, refresh_token зашифрований і збережений,
// access_token отримується на льоту при кожному sync.
//
// tokenCrypto.ts (не приватні encrypt/decrypt всередині файлу, як у
// gscHandler.ts/ga4Handler.ts) — нові OAuth-інтеграції переюзовують
// спільний helper, не плодять четвертий дубль AES-GCM коду.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, insertRowReturning, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";
import { encryptToken, decryptToken } from "./tokenCrypto";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send";

async function getUserIdFromToken(token: string, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: serviceKey } });
    if (!res.ok) return null;
    return ((await res.json()) as { id: string }).id ?? null;
  } catch {
    return null;
  }
}

async function refreshAccessToken(refreshToken: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`);
  return ((await res.json()) as { access_token: string }).access_token;
}

// ── Route: GET /api/mail/auth?organization_id=...&access_token=... ──
// Стартує OAuth flow. access_token тут — Supabase JWT юзера
// (передається як query param, бо redirect-based OAuth не може нести
// Authorization header) — той самий підхід, що handleGscAuth().

export function handleMailAuth(request: Request, env: Env): Response {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  const accessToken = url.searchParams.get("access_token");
  if (!organizationId || !accessToken) return new Response("Missing organization_id or access_token", { status: 400 });

  const redirectUri = `${new URL(request.url).origin}/api/mail/callback`;
  const state = btoa(JSON.stringify({ organizationId, accessToken }));

  const oauthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  oauthUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
  oauthUrl.searchParams.set("redirect_uri", redirectUri);
  oauthUrl.searchParams.set("response_type", "code");
  oauthUrl.searchParams.set("scope", GMAIL_SCOPE);
  oauthUrl.searchParams.set("access_type", "offline");
  oauthUrl.searchParams.set("prompt", "consent");
  oauthUrl.searchParams.set("state", state);

  return Response.redirect(oauthUrl.toString(), 302);
}

// ── Route: GET /api/mail/callback ──

export async function handleMailCallback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const appBase = env.APP_URL || "https://qorax.mrcru96.workers.dev";

  if (url.searchParams.get("error") || !code || !stateRaw) {
    return Response.redirect(`${appBase}/mail?mail_error=denied`, 302);
  }

  let organizationId: string, accessToken: string;
  try {
    ({ organizationId, accessToken } = JSON.parse(atob(stateRaw)));
  } catch {
    return Response.redirect(`${appBase}/mail?mail_error=state`, 302);
  }

  const userId = await getUserIdFromToken(accessToken, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return Response.redirect(`${appBase}/mail?mail_error=auth`, 302);

  // Ownership verification (SECURITY.md розділ 5): юзер дійсно
  // належить organizationId з state, не тільки те, що state
  // валідний JSON — інакше можна було б підмінити organization_id.
  const memberCheck = await selectRows<{ role: string }>(
    "organization_members",
    `select=role&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!memberCheck.data?.[0]) return Response.redirect(`${appBase}/mail?mail_error=forbidden`, 302);

  const redirectUri = `${new URL(request.url).origin}/api/mail/callback`;
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!tokenRes.ok) return Response.redirect(`${appBase}/mail?mail_error=token`, 302);

  const tokens = (await tokenRes.json()) as { access_token: string; refresh_token?: string };
  if (!tokens.refresh_token) return Response.redirect(`${appBase}/mail?mail_error=no_refresh_token`, 302);

  // Email-адреса акаунта — через userinfo endpoint (Gmail API сама
  // по собі не віддає адресу власника напряму без окремого виклику).
  const profileRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!profileRes.ok) return Response.redirect(`${appBase}/mail?mail_error=profile`, 302);
  const profile = (await profileRes.json()) as { email?: string };
  if (!profile.email) return Response.redirect(`${appBase}/mail?mail_error=profile`, 302);

  const encryptedRefreshToken = await encryptToken(tokens.refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY);

  const upsertRes = await insertRowReturning<{ id: string }>(
    "mail_accounts",
    {
      organization_id: organizationId,
      provider: "gmail",
      email_address: profile.email,
      encrypted_refresh_token: encryptedRefreshToken,
      is_active: true,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (upsertRes.ok && upsertRes.data[0]) {
    // Fire-and-forget початковий sync — не блокувати redirect користувача
    runMailSync(upsertRes.data[0].id, env).catch(err => console.error("[mail] initial sync failed", err));
  }

  return Response.redirect(`${appBase}/mail?mail_connected=1`, 302);
}

// ── Route: GET /api/mail/accounts?organization_id=... ──

export async function handleMailAccountsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<{ id: string; provider: string; email_address: string; last_synced_at: string | null }>(
    "mail_accounts",
    `select=id,provider,email_address,last_synced_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=connected_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ accounts: res.data ?? [] }, 200, corsHeaders);
}

// ── Route: GET /api/mail/threads?mail_account_id=... ──

export async function handleMailThreadsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const mailAccountId = url.searchParams.get("mail_account_id");
  if (!mailAccountId) return json({ error: "mail_account_id обов'язковий" }, 400, corsHeaders);

  // Ownership verification через organization_id акаунта
  const accountRes = await selectRows<{ organization_id: string }>(
    "mail_accounts",
    `select=organization_id&id=eq.${encodeURIComponent(mailAccountId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = accountRes.data?.[0]?.organization_id;
  if (!organizationId) return json({ error: "Not found" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<{ id: string; subject: string | null; participants: string[] | null; last_message_at: string; is_read: boolean }>(
    "mail_threads",
    `select=id,subject,participants,last_message_at,is_read&mail_account_id=eq.${encodeURIComponent(mailAccountId)}&order=last_message_at.desc&limit=50`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ threads: res.data ?? [] }, 200, corsHeaders);
}

// ── Route: GET /api/mail/threads/:id/messages ──

export async function handleMailMessagesList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  threadId: string
): Promise<Response> {
  const threadRes = await selectRows<{ mail_account_id: string }>(
    "mail_threads",
    `select=mail_account_id&id=eq.${encodeURIComponent(threadId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const mailAccountId = threadRes.data?.[0]?.mail_account_id;
  if (!mailAccountId) return json({ error: "Not found" }, 404, corsHeaders);

  const accountRes = await selectRows<{ organization_id: string }>(
    "mail_accounts",
    `select=organization_id&id=eq.${encodeURIComponent(mailAccountId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = accountRes.data?.[0]?.organization_id;
  if (!organizationId) return json({ error: "Not found" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<{ id: string; direction: string; from_address: string; to_addresses: string[]; body_html: string | null; body_text: string | null; sent_at: string }>(
    "mail_messages",
    `select=id,direction,from_address,to_addresses,body_html,body_text,sent_at&thread_id=eq.${encodeURIComponent(threadId)}&order=sent_at.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  await updateRows("mail_threads", `id=eq.${encodeURIComponent(threadId)}`, { is_read: true }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  return json({ messages: res.data ?? [] }, 200, corsHeaders);
}

// ── Route: POST /api/mail/accounts/:id/sync — ручний запуск sync ──

export async function handleMailSyncRequest(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  mailAccountId: string
): Promise<Response> {
  const accountRes = await selectRows<{ organization_id: string }>(
    "mail_accounts",
    `select=organization_id&id=eq.${encodeURIComponent(mailAccountId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = accountRes.data?.[0]?.organization_id;
  if (!organizationId) return json({ error: "Not found" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const result = await runMailSync(mailAccountId, env);
  return json(result, result.ok ? 200 : 500, corsHeaders);
}

// ── Route: POST /api/mail/send ── body: { mail_account_id, to, subject, body_html }
// Compose — відправка через Gmail API messages.send (RFC 2822 raw
// base64url, найпростіший MVP-шлях без побудови повного MIME-дерева
// з вкладеннями — вкладення у відправлених листах не MVP першого
// проходу, тільки текст/HTML тіло).

export async function handleMailSend(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { mail_account_id?: string; to?: string; subject?: string; body_html?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const mailAccountId = body.mail_account_id;
  if (!mailAccountId) return json({ error: "mail_account_id обов'язковий" }, 400, corsHeaders);

  const to = body.to?.trim();
  if (!to || !to.includes("@")) return json({ error: "Некоректна адреса отримувача" }, 400, corsHeaders);

  const subject = body.subject?.trim() || "(без теми)";
  const bodyHtml = body.body_html?.trim();
  if (!bodyHtml) return json({ error: "Текст листа обов'язковий" }, 400, corsHeaders);

  const accountRes = await selectRows<{ organization_id: string; encrypted_refresh_token: string; email_address: string }>(
    "mail_accounts",
    `select=organization_id,encrypted_refresh_token,email_address&id=eq.${encodeURIComponent(mailAccountId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const account = accountRes.data?.[0];
  if (!account) return json({ error: "Не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, account.organization_id, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  let accessToken: string;
  try {
    const refreshToken = await decryptToken(account.encrypted_refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
    accessToken = await refreshAccessToken(refreshToken, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Не вдалось оновити токен" }, 500, corsHeaders);
  }

  const rawMessage = [
    `From: ${account.email_address}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    "Content-Type: text/html; charset=UTF-8",
    "",
    bodyHtml,
  ].join("\r\n");

  const encodedMessage = btoa(unescape(encodeURIComponent(rawMessage)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const sendRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!sendRes.ok) {
    const errText = await sendRes.text();
    return json({ error: `Не вдалось надіслати лист: ${errText}` }, 502, corsHeaders);
  }

  // Fire-and-forget sync — щоб відправлений лист одразу зʼявився в
  // треді (не чекати наступного cron-запуску run-mail-sync).
  runMailSync(mailAccountId, env).catch(err => console.error("[mail] post-send sync failed", err));

  return json({ ok: true }, 200, corsHeaders);
}

// ── Sync logic (Gmail API) ──
//
// Перший sync (history_id відсутній): messages.list з обмеженням
// (останні 50 листів) — повний ре-фетч на старті, не безкінечна
// історія скриньки. Наступні sync: history.list з startHistoryId
// (інкрементальний, дешевший — 2 quota units проти 5 у messages.list,
// підтверджено в документації Gmail API). HTTP 404 на history.list
// (startHistoryId застарів, Google тримає ~тиждень) → fallback на
// повний ре-фетч.

interface MailSyncResult {
  ok: boolean;
  synced: number;
  error?: string;
}

export async function runMailSync(mailAccountId: string, env: Env): Promise<MailSyncResult> {
  const accountRes = await selectRows<{ encrypted_refresh_token: string; history_id: string | null }>(
    "mail_accounts",
    `select=encrypted_refresh_token,history_id&id=eq.${encodeURIComponent(mailAccountId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const account = accountRes.data?.[0];
  if (!account) return { ok: false, synced: 0, error: "mail_account не знайдено" };

  let accessToken: string;
  try {
    const refreshToken = await decryptToken(account.encrypted_refresh_token, env.GOOGLE_TOKEN_ENCRYPTION_KEY);
    accessToken = await refreshAccessToken(refreshToken, env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
  } catch (err) {
    return { ok: false, synced: 0, error: err instanceof Error ? err.message : "token refresh failed" };
  }

  let messageIds: string[] = [];
  let newHistoryId: string | null = null;

  if (account.history_id) {
    // Інкрементальний sync
    const historyRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${account.history_id}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (historyRes.status === 404) {
      // startHistoryId застарів — падаємо на повний ре-фетч нижче
      account.history_id = null;
    } else if (historyRes.ok) {
      const historyData = (await historyRes.json()) as { history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>; historyId?: string };
      messageIds = (historyData.history ?? []).flatMap(h => (h.messagesAdded ?? []).map(m => m.message.id));
      newHistoryId = historyData.historyId ?? account.history_id;
    } else {
      return { ok: false, synced: 0, error: `history.list failed: ${historyRes.status}` };
    }
  }

  if (!account.history_id) {
    // Повний sync (перший раз чи fallback після 404) — останні 50 листів
    const listRes = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=50",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!listRes.ok) return { ok: false, synced: 0, error: `messages.list failed: ${listRes.status}` };
    const listData = (await listRes.json()) as { messages?: Array<{ id: string }> };
    messageIds = (listData.messages ?? []).map(m => m.id);

    // historyId для майбутніх інкрементальних sync — беремо з профілю
    const profileRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (profileRes.ok) {
      const profileData = (await profileRes.json()) as { historyId?: string };
      newHistoryId = profileData.historyId ?? null;
    }
  }

  let synced = 0;
  for (const messageId of messageIds) {
    try {
      const ok = await syncOneMessage(mailAccountId, messageId, accessToken, env);
      if (ok) synced++;
    } catch (err) {
      console.error("[mail-sync] failed to sync message", messageId, err);
    }
  }

  await updateRows(
    "mail_accounts",
    `id=eq.${encodeURIComponent(mailAccountId)}`,
    { history_id: newHistoryId, last_synced_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return { ok: true, synced };
}

function getHeader(headers: Array<{ name: string; value: string }>, name: string): string | null {
  return headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return decodeURIComponent(escape(atob(base64)));
}

async function syncOneMessage(mailAccountId: string, gmailMessageId: string, accessToken: string, env: Env): Promise<boolean> {
  const msgRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${gmailMessageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!msgRes.ok) return false;

  const msg = (await msgRes.json()) as {
    id: string;
    threadId: string;
    payload: { headers: Array<{ name: string; value: string }>; body?: { data?: string }; parts?: Array<{ mimeType: string; body?: { data?: string } }> };
    internalDate: string;
    labelIds?: string[];
  };

  const headers = msg.payload.headers;
  const subject = getHeader(headers, "Subject");
  const from = getHeader(headers, "From") ?? "";
  const to = (getHeader(headers, "To") ?? "").split(",").map(s => s.trim()).filter(Boolean);
  const sentAt = new Date(parseInt(msg.internalDate, 10)).toISOString();
  const direction = (msg.labelIds ?? []).includes("SENT") ? "outbound" : "inbound";

  // Тіло листа: HTML і text частини з MIME parts (перший знайдений
  // кожного типу — MVP-спрощення, не повний рекурсивний MIME-обхід
  // вкладених multipart/alternative).
  let bodyHtml: string | null = null;
  let bodyText: string | null = null;
  const parts = msg.payload.parts ?? [msg.payload as { mimeType?: string; body?: { data?: string } }];
  for (const part of parts) {
    if (part.mimeType === "text/html" && part.body?.data) bodyHtml = decodeBase64Url(part.body.data);
    if (part.mimeType === "text/plain" && part.body?.data) bodyText = decodeBase64Url(part.body.data);
  }
  if (!bodyHtml && !bodyText && msg.payload.body?.data) bodyText = decodeBase64Url(msg.payload.body.data);

  const threadUpsert = await upsertMailThread(mailAccountId, msg.threadId, subject, sentAt, env);
  if (!threadUpsert) return false;

  const insertRes = await insertRow(
    "mail_messages",
    {
      thread_id: threadUpsert,
      provider_message_id: msg.id,
      direction,
      from_address: from,
      to_addresses: to,
      body_html: bodyHtml,
      body_text: bodyText,
      sent_at: sentAt,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  // insertRes.ok === false при unique-конфлікті (лист вже
  // синхронізований раніше) — не помилка, очікувана поведінка
  // дедуплікації, тому не логуємо як error.
  return insertRes.ok;
}

async function upsertMailThread(mailAccountId: string, providerThreadId: string, subject: string | null, lastMessageAt: string, env: Env): Promise<string | null> {
  const existing = await selectRows<{ id: string }>(
    "mail_threads",
    `select=id&mail_account_id=eq.${encodeURIComponent(mailAccountId)}&provider_thread_id=eq.${encodeURIComponent(providerThreadId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (existing.data?.[0]) {
    await updateRows(
      "mail_threads",
      `id=eq.${encodeURIComponent(existing.data[0].id)}`,
      { last_message_at: lastMessageAt, is_read: false },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    return existing.data[0].id;
  }

  const insertRes = await insertRowReturning<{ id: string }>(
    "mail_threads",
    {
      mail_account_id: mailAccountId,
      provider_thread_id: providerThreadId,
      subject,
      last_message_at: lastMessageAt,
      is_read: false,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return insertRes.data?.[0]?.id ?? null;
}

// ── Cron-подібна задача: run-mail-sync — синхронізує всі активні
// mail_accounts. Викликається через /api/admin/run-mail-sync, той
// самий патерн, що run-uptime/run-social-publish. ──

export async function runMailSyncAll(env: Env): Promise<{ accountsSynced: number; totalMessages: number }> {
  const accountsRes = await selectRows<{ id: string }>(
    "mail_accounts",
    `select=id&is_active=eq.true`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!accountsRes.ok || !accountsRes.data) return { accountsSynced: 0, totalMessages: 0 };

  let totalMessages = 0;
  let accountsSynced = 0;
  for (const account of accountsRes.data) {
    const result = await runMailSync(account.id, env);
    if (result.ok) {
      accountsSynced++;
      totalMessages += result.synced;
    }
  }
  return { accountsSynced, totalMessages };
}
