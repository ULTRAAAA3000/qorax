// ============================================================
// socialHandler.ts — Social-модуль, MVP тільки Telegram
// (MODULE_ROADMAP.md розділ 8, Крок 5; EXECUTION_PLAN.md Фаза 2.4).
//
// Той самий патерн, що crmHandler.ts: requireOrgAccess() (Фаза 0.1) +
// json() з httpUtils.ts (Фаза 0.2). Шифрування bot_token — той самий
// AES-GCM патерн, що gscHandler.ts, скопійовано сюди (не винесено в
// спільний crypto.ts цим проходом — gscHandler.ts має свою приватну
// копію, spільний файл лишається окремою майбутньою задачею, щоб не
// чіпати наявний робочий GSC-код зараз).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";
import { sendTelegramMessage } from "./telegram";
import { checkAiCredits, deductAiCredits } from "./aiCredits";

// ── AES-GCM (копія з gscHandler.ts — див. коментар вище) ────────────

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

interface SocialConnection {
  id: string;
  organization_id: string;
  platform: string;
  account_label: string | null;
  telegram_chat_id: string;
  is_active: boolean;
  created_at: string;
}

interface SocialPost {
  id: string;
  organization_id: string;
  connection_id: string | null;
  content: string;
  hashtags: string[] | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: string;
  fail_reason: string | null;
  ai_generated: boolean;
  created_at: string;
}

// ── GET /api/social/connections?organization_id=... ── (не повертає bot_token — тільки метадані)

export async function handleSocialConnectionsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<SocialConnection>(
    "social_connections",
    `select=id,organization_id,platform,account_label,telegram_chat_id,is_active,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ connections: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/social/connections ── body: { organization_id, bot_token, telegram_chat_id, account_label? }
// admin+ (SECURITY.md розділ 5-подібне обмеження — bot_token чужий секрет, вища ціна помилки, ніж CRM insert)

export async function handleSocialConnectionCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; bot_token?: string; telegram_chat_id?: string; account_label?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "admin", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const botToken = body.bot_token?.trim();
  const chatId = body.telegram_chat_id?.trim();
  if (!botToken || !chatId) return json({ error: "bot_token і telegram_chat_id обов'язкові" }, 400, corsHeaders);
  if (!env.SOCIAL_TOKEN_ENCRYPTION_KEY) return json({ error: "Social-модуль не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  // Перевіряємо токен ще ДО збереження — надсилаємо тестове повідомлення,
  // щоб не зберігати непрацюючий bot_token без жодного зворотного зв'язку
  // користувачу (той самий принцип, що credit-check в contentGeneration.ts
  // ДО виклику Gemini — не витрачати дію на завідомо провальний шлях)
  const testResult = await sendTelegramMessage(
    chatId,
    "✅ <b>Qorax підключено</b>\n\nЦей канал тепер підключено до Social-модуля Qorax. Публікації з'являтимуться тут за розкладом.",
    botToken
  );
  if (!testResult.ok) {
    return json({ error: `Не вдалось надіслати тестове повідомлення: ${testResult.error ?? "перевірте bot_token і chat_id"}` }, 400, corsHeaders);
  }

  const encryptedToken = await encrypt(botToken, env.SOCIAL_TOKEN_ENCRYPTION_KEY);

  const insertRes = await insertRow(
    "social_connections",
    {
      organization_id: organizationId,
      platform: "telegram",
      encrypted_bot_token: encryptedToken,
      telegram_chat_id: chatId,
      account_label: body.account_label?.trim() || null,
      is_active: true,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── DELETE /api/social/connections/:id ── body: { organization_id }

export async function handleSocialConnectionDelete(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  connectionId: string
): Promise<Response> {
  let body: { organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "admin", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  // Ownership verification (SECURITY.md розділ 5) — з'єднання дійсно
  // належить цій organization_id, не тільки JWT валідний
  const connRes = await selectRows<{ id: string }>(
    "social_connections",
    `select=id&id=eq.${encodeURIComponent(connectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!connRes.data?.[0]) return json({ error: "Not found" }, 404, corsHeaders);

  const updateRes = await updateRows(
    "social_connections",
    `id=eq.${encodeURIComponent(connectionId)}`,
    { is_active: false },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/social/posts?organization_id=... — контент-календар ──

export async function handleSocialPostsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<SocialPost>(
    "social_posts",
    `select=id,organization_id,connection_id,content,hashtags,scheduled_at,published_at,status,fail_reason,ai_generated,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=100`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ posts: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/social/posts ── body: { organization_id, connection_id, content, hashtags?, scheduled_at? }
// scheduled_at відсутній → status='draft'; присутній → status='scheduled'

export async function handleSocialPostCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; connection_id?: string; content?: string; hashtags?: string[]; scheduled_at?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const content = body.content?.trim();
  if (!content || content.length > 4096) return json({ error: "Текст посту обов'язковий (до 4096 символів — ліміт Telegram)" }, 400, corsHeaders);

  let scheduledAt: string | null = null;
  let status = "draft";
  if (body.scheduled_at) {
    const parsed = new Date(body.scheduled_at);
    if (isNaN(parsed.getTime())) return json({ error: "Некоректна дата scheduled_at" }, 400, corsHeaders);
    if (parsed.getTime() < Date.now()) return json({ error: "scheduled_at не може бути в минулому" }, 400, corsHeaders);
    scheduledAt = parsed.toISOString();
    status = "scheduled";
  }

  // Перевірка ліміту публікацій на місяць (PRICING.md розділ 4: "публікацій/міс")
  const limitCheck = await checkMonthlyPostLimit(organizationId, env);
  if (!limitCheck.ok) return json({ error: limitCheck.error }, 402, corsHeaders);

  const insertRes = await insertRow(
    "social_posts",
    {
      organization_id: organizationId,
      connection_id: body.connection_id || null,
      content,
      hashtags: body.hashtags?.length ? body.hashtags : null,
      scheduled_at: scheduledAt,
      status,
      ai_generated: false,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── DELETE /api/social/posts/:id ── body: { organization_id } — тільки draft/scheduled, не published

export async function handleSocialPostDelete(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  postId: string
): Promise<Response> {
  let body: { organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const postRes = await selectRows<{ id: string; status: string }>(
    "social_posts",
    `select=id,status&id=eq.${encodeURIComponent(postId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const post = postRes.data?.[0];
  if (!post) return json({ error: "Not found" }, 404, corsHeaders);
  if (post.status === "published") return json({ error: "Опубліковані пости не видаляються" }, 400, corsHeaders);

  const deleteRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/social_posts?id=eq.${encodeURIComponent(postId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!deleteRes.ok) return json({ error: `Delete failed: ${deleteRes.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /api/social/generate ── body: { organization_id, topic, tone? } — AI-текст посту + хештеги
// Переюзовує той самий Gemini-виклик і ai_credits пул, що contentGeneration.ts
// (PRICING.md розділ 5: "єдиний пул кредитів... AI/Content, Translator, Social...")

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;

function buildSocialPrompt(topic: string, tone: string | undefined): string {
  const toneCtx = tone?.trim() ? `Тон: ${tone.trim()}.` : "Тон: дружній, живий, підходить для соцмереж.";
  return `Ти — SMM-копірайтер, який пише пост для Telegram-каналу бізнесу.

Тема: ${topic}
${toneCtx}

Вимоги: 2-4 короткі абзаци, читабельно на мобільному, без markdown-заголовків, у кінці — 3-5 релевантних хештегів окремим рядком (формат: #слово, без пробілів усередині хештегу).

Пиши українською мовою. Поверни ЛИШЕ готовий текст посту разом з хештегами, без пояснень і без preamble.`;
}

async function callGemini(prompt: string, apiKey: string): Promise<{ ok: true; text: string } | { ok: false; error: string; status: number }> {
  const doFetch = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      return await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 800 } }),
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let resp = await doFetch();
    if (resp.status === 429 || resp.status === 503) {
      await new Promise(r => setTimeout(r, resp.status === 503 ? 6000 : 4000));
      resp = await doFetch();
    }
    if (!resp.ok) {
      console.error("[social-gen] Gemini error:", resp.status, (await resp.text()).slice(0, 300));
      return { ok: false, error: resp.status === 429 ? "AI перевантажений — спробуйте через хвилину" : "AI тимчасово недоступний", status: 503 };
    }
    interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const data = (await resp.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!text) return { ok: false, error: "AI не повернув результат", status: 502 };
    return { ok: true, text };
  } catch (err) {
    console.error("[social-gen] fetch error:", err);
    return { ok: false, error: "AI тимчасово недоступний", status: 503 };
  }
}

export async function handleSocialGenerate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; topic?: string; tone?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const topic = body.topic?.trim();
  if (!topic || topic.length > 500) return json({ error: "Опишіть тему (до 500 символів)" }, 400, corsHeaders);

  // aiCredits.ts (спільний helper) — той самий credit-check, що
  // contentGeneration.ts, з безлімітом для адмінської організації.
  const creditsCheck = await checkAiCredits(organizationId, "business", env);
  if (!creditsCheck.ok) {
    return json(
      { error: creditsCheck.disabledByAdmin ? "AI тимчасово вимкнено адміністратором платформи." : "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." },
      creditsCheck.disabledByAdmin ? 503 : 402,
      corsHeaders
    );
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const result = await callGemini(buildSocialPrompt(topic, body.tone), apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const creditsRemaining = await deductAiCredits(organizationId, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);

  return json({ content: result.text, credits_remaining: creditsRemaining, unlimited: creditsCheck.unlimited }, 200, corsHeaders);
}

// ── Ліміт публікацій на місяць (PRICING.md розділ 4) ─────────────────
// Конкретні числа за тарифом — комерційне рішення Артема (та сама
// логіка, що "конкретні числа — рішення Артема" в EXECUTION_PLAN.md
// пункт 0.3 для ai_credits). Тут — робочі значення-заглушки за
// планом, легко змінити в одному місці, коли Артем визначиться.
const MONTHLY_POST_LIMIT_BY_PLAN: Record<string, number> = {
  // легасі (до 0086)
  starter: 8,
  growth: 30,
  agency: 100,
  admin: 9999,
  trial: 8,
  // нова лінійка Business (0086)
  business_free: 4,
  business_starter: 30,
  business_pro: 100,
  business_agency: 9999,
};

async function checkMonthlyPostLimit(organizationId: string, env: Env): Promise<{ ok: true } | { ok: false; error: string }> {
  const planRes = await selectRows<{ status: string; plans: { code: string } }>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const planCode = (planRes.data?.[0]?.plans as { code: string } | null)?.code ?? "business_free";
  const limit = MONTHLY_POST_LIMIT_BY_PLAN[planCode] ?? MONTHLY_POST_LIMIT_BY_PLAN.business_free;

  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);

  const countRes = await selectRows<{ id: string }>(
    "social_posts",
    `select=id&organization_id=eq.${encodeURIComponent(organizationId)}&created_at=gte.${monthStart.toISOString()}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const usedThisMonth = countRes.data?.length ?? 0;

  if (usedThisMonth >= limit) {
    return { ok: false, error: `Ліміт публікацій на місяць вичерпано (${limit} на тарифі ${planCode}). Оновіть тариф для більшої кількості.` };
  }
  return { ok: true };
}

// ── Cron: run-social-publish (MODULE_ROADMAP.md розділ 8, Крок 2) ────
// Публікує заплановані пости, час яких настав. Викликається з
// worker/src/index.ts scheduled() — новий cron-тригер, який Артему
// потрібно ДОДАТИ ВРУЧНУ в Cloudflare Dashboard (за проектною угодою —
// wrangler.toml тут не працює на цьому акаунті, див. пам'ять проекту).
// Рекомендований розклад: окремий тригер "* * * * *" (щохвилинний) —
// не сумісний із наявним "*/5 * * * *" (uptime/SSL), тому саме новий
// тригер, не розширення наявного.
//
// Потребує env (для SOCIAL_TOKEN_ENCRYPTION_KEY) — env.TELEGRAM_BOT_TOKEN
// НЕ використовується тут навмисно: Social публікує через ВЛАСНИЙ
// bot_token організації, розшифрований з social_connections, а не
// через єдиний Qorax-бот для алертів власнику сайту.

export async function runSocialPublishWithEnv(env: Env): Promise<{ published: number; failed: number }> {
  if (!env.SOCIAL_TOKEN_ENCRYPTION_KEY) {
    console.warn("[social-publish] SOCIAL_TOKEN_ENCRYPTION_KEY не налаштовано — пропускаємо cron");
    return { published: 0, failed: 0 };
  }

  const dueRes = await selectRows<SocialPost>(
    "social_posts",
    `select=id,organization_id,connection_id,content,hashtags,scheduled_at,status&status=eq.scheduled&scheduled_at=lte.${new Date().toISOString()}&limit=50`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!dueRes.ok || !dueRes.data?.length) return { published: 0, failed: 0 };

  let published = 0;
  let failed = 0;

  for (const post of dueRes.data) {
    if (!post.connection_id) {
      await updateRows("social_posts", `id=eq.${post.id}`, { status: "failed", fail_reason: "Немає підключеного каналу" }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      failed++;
      continue;
    }

    const connRes = await selectRows<{ encrypted_bot_token: string; telegram_chat_id: string; is_active: boolean }>(
      "social_connections",
      `select=encrypted_bot_token,telegram_chat_id,is_active&id=eq.${post.connection_id}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const conn = connRes.data?.[0];
    if (!conn || !conn.is_active) {
      await updateRows("social_posts", `id=eq.${post.id}`, { status: "failed", fail_reason: "Канал відключено" }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      failed++;
      continue;
    }

    try {
      const botToken = await decrypt(conn.encrypted_bot_token, env.SOCIAL_TOKEN_ENCRYPTION_KEY);
      const hashtagsLine = post.hashtags?.length ? `\n\n${post.hashtags.map(h => (h.startsWith("#") ? h : `#${h}`)).join(" ")}` : "";
      const result = await sendTelegramMessage(conn.telegram_chat_id, `${escapeHtml(post.content)}${hashtagsLine}`, botToken);

      if (result.ok) {
        await updateRows("social_posts", `id=eq.${post.id}`, { status: "published", published_at: new Date().toISOString() }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        published++;
      } else {
        await updateRows("social_posts", `id=eq.${post.id}`, { status: "failed", fail_reason: result.error ?? "Telegram API помилка" }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        failed++;
      }
    } catch (err) {
      console.error("[social-publish] error for post", post.id, err);
      await updateRows("social_posts", `id=eq.${post.id}`, { status: "failed", fail_reason: "Помилка дешифрування чи мережі" }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      failed++;
    }
  }

  return { published, failed };
}

/** Telegram parse_mode: "HTML" (telegram.ts) — екрануємо спецсимволи з тексту юзера, щоб не зламати розмітку і не дозволити injection у власне повідомлення. */
function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
