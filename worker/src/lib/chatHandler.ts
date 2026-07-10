// ============================================================
// chatHandler.ts — Qorax AI Chat (перше перенесення хвилі 3).
//
// EXECUTION_PLAN.md "Хвиля 3 почата": наступний крок після схеми БД
// (0049_qorax_ai_hub.sql) — переносимо Qoraxus на персистентні
// ai_chat_threads/ai_chat_messages замість stateless-флоу (клієнт
// раніше сам зберігав і передавав ВСЮ історію повідомлень щоразу —
// нічого не писалось в БД, оновлення сторінки стирало історію).
//
// Флоу тепер:
//   POST /api/ai-chat { thread_id?, site_id?, message }
//   → якщо thread_id відсутній — створюємо новий тред (site_id,
//     якщо переданий, інакше organization-рівня, site_id = null)
//   → перевіряємо що organization_id треда належить користувачу і
//     має Growth+/trial/admin план
//   → читаємо історію повідомлень треда з ai_chat_messages
//   → збираємо контекст: якщо thread.site_id задано — контекст
//     ОДНОГО сайту (як раніше); якщо null — АГРЕГАЦІЯ по ВСІХ сайтах
//     організації (uptime/insights) — рішення Артема: повна
//     агрегація, а не просто список сайтів
//   → зберігаємо повідомлення юзера в ai_chat_messages
//   → Gemini повертає відповідь
//   → зберігаємо відповідь моделі в ai_chat_messages
//   → повертаємо { thread_id, reply }
//
// СВІДОМО НЕ ЗРОБЛЕНО в цьому кроці (наступні кроки хвилі 3):
// - GET /api/ai-chat/threads (список тредів для історії чатів) —
//   поточний UI працює з ОДНИМ активним тредом на сайт/організацію
// - Streaming відповіді (як і раніше — повний JSON, не SSE)
// - agents/agent_runs (Automations) — це вкладка Chat, не Agents
//
// Окремий ключ GEMINI_CHAT_API_KEY щоб квота моніторингу
// (GEMINI_API_KEY) не перетиналась з інтерактивними запитами.
// ============================================================

import { selectRows, insertRow } from "./supabase";
import { buildMemoryContext } from "./memoryHandler";
import type { Env } from "../types";
import { corsHeaders as sharedCorsHeaders } from "./cors";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;
const MAX_HISTORY_MESSAGES = 10; // останні N повідомлень щоб не перевищити контекст

interface ChatRequest {
  thread_id?: string;
  site_id?: string;
  message?: string;
}

// ─── Типи рядків з БД ────────────────────────────────────────

interface ThreadRow {
  id: string;
  organization_id: string;
  site_id: string | null;
}

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  organization_id: string;
}

interface PlanRow {
  code: string;
}

interface SubscriptionRow {
  status: string;
  plans: PlanRow | null;
}

interface UptimeRow {
  status: string;
  response_time_ms: number | null;
  checked_at: string;
}

interface SpeedRow {
  load_time_ms: number | null;
  checked_at: string;
}

interface CwvRow {
  strategy: string;
  lcp_ms: number | null;
  inp_ms: number | null;
  cls_score: number | null;
  performance_score: number | null;
  checked_at: string;
}

interface InsightRow {
  severity: string;
  problem_summary: string;
  plain_explanation: string;
  estimated_monthly_loss_usd: number | null;
  recommendation: string;
  site_id?: string;
}

interface SslRow {
  days_until_expiry: number | null;
}

interface ChatMessageRow {
  role: string;
  content: string;
}

// ─── Main handler ─────────────────────────────────────────────

export async function handleChatRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? buildCorsHeaders(origin, env);

  // Глобальний try/catch — гарантує що CORS хедери завжди присутні навіть при 500
  try {
    return await handleChatInternal(request, env, corsHeaders);
  } catch (err) {
    console.error("[chat] unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── GET /api/ai-chat/thread?site_id=... ──────────────────────
// Повертає ІСНУЮЧИЙ тред (найновіший для site_id/organization) з
// повною історією повідомлень, або створює новий якщо жодного ще
// немає. Потрібен для персистентності на клієнті — раніше
// (stateless-версія) UI сам тримав історію в React-стані і губив
// її при кожному оновленні сторінки.
export async function handleGetOrCreateThreadRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? buildCorsHeaders(origin, env);

  try {
    const url = new URL(request.url);
    const siteId = url.searchParams.get("site_id") ?? undefined;

    const authHeader = request.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "").trim();
    if (!jwt) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    const userId = ((await userResp.json()) as { id: string }).id;

    // Шукаємо найновіший існуючий тред для цього site_id (або
    // organization-рівня, якщо site_id відсутній)
    const filterField = siteId ? `site_id=eq.${encodeURIComponent(siteId)}` : `site_id=is.null`;
    const existingResult = await selectRows<ThreadRow>(
      "ai_chat_threads",
      `select=id,organization_id,site_id&${filterField}&order=updated_at.desc&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const existingThread = existingResult.data[0];

    let thread: ThreadRow;
    if (existingThread) {
      const memberCheck = await selectRows<{ organization_id: string }>(
        "organization_members",
        `select=organization_id&organization_id=eq.${encodeURIComponent(existingThread.organization_id)}&user_id=eq.${encodeURIComponent(userId)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (!memberCheck.data[0]) {
        return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);
      }
      thread = existingThread;
    } else {
      const resolution = await resolveThread({ site_id: siteId }, userId, env);
      if (!resolution.ok) {
        return jsonResponse({ error: resolution.error }, resolution.status, corsHeaders);
      }
      thread = resolution.thread;
    }

    const historyResult = await selectRows<ChatMessageRow>(
      "ai_chat_messages",
      `select=role,content&thread_id=eq.${encodeURIComponent(thread.id)}&order=created_at.asc&limit=${MAX_HISTORY_MESSAGES}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    return jsonResponse(
      { thread_id: thread.id, messages: historyResult.data },
      200,
      corsHeaders
    );
  } catch (err) {
    console.error("[chat] get-thread unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

async function handleChatInternal(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
  }

  const { message } = body;
  if (!message || typeof message !== "string" || !message.trim()) {
    return jsonResponse({ error: "message обов'язковий" }, 400, corsHeaders);
  }

  // Аутентифікуємо через Supabase JWT з заголовку Authorization
  const authHeader = request.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "").trim();
  if (!jwt) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userResp.ok) {
    console.error("[chat] JWT verification failed:", userResp.status);
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }
  const userId = ((await userResp.json()) as { id: string }).id;

  // ── Визначаємо/створюємо тред ──────────────────────────────
  const thread = await resolveThread(body, userId, env);
  if (!thread.ok) {
    return jsonResponse({ error: thread.error }, thread.status, corsHeaders);
  }
  const { id: threadId, organization_id: organizationId, site_id: siteId } = thread.thread;

  // ── Перевіряємо план — чат доступний тільки для Growth+ ───
  const subResult = await selectRows<SubscriptionRow>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sub = subResult.data[0];
  const planCode = (sub?.plans as PlanRow | null)?.code ?? "free";
  const hasAccess = ["growth", "agency", "admin", "trial"].includes(planCode);
  if (!hasAccess) {
    return jsonResponse(
      {
        error: "upgrade_required",
        message: "AI-асистент Qoraxus доступний з плану Growth ($99/міс)",
      },
      403,
      corsHeaders
    );
  }

  // ── Читаємо історію повідомлень треда ──────────────────────
  const historyResult = await selectRows<ChatMessageRow>(
    "ai_chat_messages",
    `select=role,content&thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.asc&limit=${MAX_HISTORY_MESSAGES}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const history = historyResult.data;

  // ── Збираємо контекст: сайт АБО вся організація ────────────
  const systemPrompt = siteId
    ? await buildSiteScopedPrompt(siteId, env)
    : await buildOrgScopedPrompt(organizationId, env);

  if (!systemPrompt.ok) {
    return jsonResponse({ error: systemPrompt.error }, systemPrompt.status, corsHeaders);
  }

  // ── Зберігаємо повідомлення юзера ──────────────────────────
  const userMessageInsert = await insertRow(
    "ai_chat_messages",
    { thread_id: threadId, role: "user", content: message.trim() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!userMessageInsert.ok) {
    console.error("[chat] failed to save user message:", userMessageInsert.error);
  }

  // ── Формуємо запит до Gemini ───────────────────────────────
  const trimmedHistory = [...history, { role: "user", content: message.trim() }].slice(-MAX_HISTORY_MESSAGES);
  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt.prompt }] },
    contents: trimmedHistory.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 1500,
    },
  };

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) {
    return jsonResponse({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    let geminiResp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(geminiBody),
    });
    clearTimeout(timeout);

    if (geminiResp.status === 429 || geminiResp.status === 503) {
      const delay = geminiResp.status === 503 ? 6000 : 4000;
      console.warn(`[chat] Gemini ${geminiResp.status} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), GEMINI_TIMEOUT_MS);
      geminiResp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller2.signal,
        body: JSON.stringify(geminiBody),
      });
      clearTimeout(timeout2);
    }

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("[chat] Gemini error:", geminiResp.status, errText.slice(0, 300));
      const msg = geminiResp.status === 429
        ? "AI перевантажений — зачекайте хвилину і спробуйте ще раз"
        : "AI тимчасово недоступний, спробуйте через хвилину";
      return jsonResponse({ error: msg, thread_id: threadId }, 503, corsHeaders);
    }

    interface GeminiResponse {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    }

    const data = (await geminiResp.json()) as GeminiResponse;
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();

    // ── Зберігаємо відповідь моделі ──────────────────────────
    const modelMessageInsert = await insertRow(
      "ai_chat_messages",
      { thread_id: threadId, role: "model", content: text },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!modelMessageInsert.ok) {
      console.error("[chat] failed to save model message:", modelMessageInsert.error);
    }

    return jsonResponse({ thread_id: threadId, reply: text }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return jsonResponse({ error: "AI не відповів вчасно, спробуйте ще раз", thread_id: threadId }, 504, corsHeaders);
    }
    return jsonResponse({ error: "Внутрішня помилка", thread_id: threadId }, 500, corsHeaders);
  }
}

// ─── Визначення/створення треду ───────────────────────────────

type ThreadResolution =
  | { ok: true; thread: ThreadRow }
  | { ok: false; status: number; error: string };

async function resolveThread(body: ChatRequest, userId: string, env: Env): Promise<ThreadResolution> {
  if (body.thread_id) {
    const threadResult = await selectRows<ThreadRow>(
      "ai_chat_threads",
      `select=id,organization_id,site_id&id=eq.${encodeURIComponent(body.thread_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const existingThread = threadResult.data[0];
    if (!existingThread) {
      return { ok: false, status: 404, error: "Тред не знайдено" };
    }

    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&organization_id=eq.${encodeURIComponent(existingThread.organization_id)}&user_id=eq.${encodeURIComponent(userId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberResult.data[0]) {
      return { ok: false, status: 403, error: "Немає доступу до цього треду" };
    }

    return { ok: true, thread: existingThread };
  }

  // Новий тред — потрібно визначити organization_id
  let organizationId: string | null = null;

  if (body.site_id) {
    const siteResult = await selectRows<SiteRow>(
      "sites",
      `select=id,organization_id&id=eq.${encodeURIComponent(body.site_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const site = siteResult.data[0];
    if (!site) {
      return { ok: false, status: 404, error: "Сайт не знайдено" };
    }
    organizationId = site.organization_id;
  } else {
    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    organizationId = memberResult.data[0]?.organization_id ?? null;
  }

  if (!organizationId) {
    return { ok: false, status: 404, error: "Організацію не знайдено" };
  }

  // Перевіряємо що юзер дійсно належить цій організації (важливо для
  // гілки з site_id — сайт міг належати іншій організації)
  const memberCheck = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(userId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!memberCheck.data[0]) {
    return { ok: false, status: 403, error: "Немає доступу до цієї організації" };
  }

  const newThreadId = crypto.randomUUID();
  const insertResult = await insertRow(
    "ai_chat_threads",
    { id: newThreadId, organization_id: organizationId, site_id: body.site_id ?? null },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertResult.ok) {
    console.error("[chat] failed to create thread:", insertResult.error);
    return { ok: false, status: 500, error: "Не вдалося створити тред" };
  }

  return {
    ok: true,
    thread: { id: newThreadId, organization_id: organizationId, site_id: body.site_id ?? null },
  };
}

// ─── Контекст одного сайту (як в оригінальному Qoraxus) ───────

type PromptResolution =
  | { ok: true; prompt: string }
  | { ok: false; status: number; error: string };

async function buildSiteScopedPrompt(siteId: string, env: Env): Promise<PromptResolution> {
  const siteResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,organization_id&id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const site = siteResult.data[0];
  if (!site) {
    return { ok: false, status: 404, error: "Сайт не знайдено" };
  }

  const [uptimeRes, speedRes, cwvRes, insightsRes, sslRes] = await Promise.all([
    selectRows<UptimeRow>(
      "uptime_checks",
      `select=status,response_time_ms,checked_at&site_id=eq.${encodeURIComponent(siteId)}&order=checked_at.desc&limit=48`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<SpeedRow>(
      "speed_checks",
      `select=load_time_ms,checked_at&site_id=eq.${encodeURIComponent(siteId)}&order=checked_at.desc&limit=7`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<CwvRow>(
      "core_web_vitals_checks",
      `select=strategy,lcp_ms,inp_ms,cls_score,performance_score,checked_at&site_id=eq.${encodeURIComponent(siteId)}&order=checked_at.desc&limit=4`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<InsightRow>(
      "ai_insights",
      `select=severity,problem_summary,plain_explanation,estimated_monthly_loss_usd,recommendation&site_id=eq.${encodeURIComponent(siteId)}&is_resolved=eq.false&order=generated_at.desc&limit=10`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<SslRow>(
      "ssl_certificates",
      `select=days_until_expiry&site_id=eq.${encodeURIComponent(siteId)}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const context = buildSiteContext(
    uptimeRes.data,
    speedRes.data,
    cwvRes.data,
    insightsRes.data,
    sslRes.data[0] ?? null
  );

  // Memory (0049_qorax_ai_hub.sql, memoryHandler.ts) — контекст про
  // бізнес користувача, якщо він заповнив вкладку Memory. Опційний
  // блок: якщо нічого не заповнено, buildMemoryContext повертає null
  // і промпт лишається таким самим, як до інтеграції Memory.
  const memoryContext = await buildMemoryContext(site.organization_id, env);

  const hostname = safeHostname(site.url);
  const prompt = `Ти — Qoraxus, AI-асистент платформи Qorax для моніторингу сайтів.
Ти аналізуєш конкретний сайт і даєш рекомендації власнику малого бізнесу.

САЙТ: ${site.display_name} (${hostname})
${memoryContext ? `\nКОНТЕКСТ ПРО БІЗНЕС КОРИСТУВАЧА:\n${memoryContext}\n` : ""}
ПОТОЧНІ ДАНІ МОНІТОРИНГУ:
${context}

${STYLE_INSTRUCTIONS}

Якщо питання не стосується цього сайту — м'яко поверни розмову до моніторингу і метрик.`;

  return { ok: true, prompt };
}

// ─── Контекст усієї організації (агрегація по всіх сайтах) ────
// Рішення Артема: ПОВНА агрегація (не просто список сайтів) —
// ближче до підсумкового бачення Qorax AI як хабу над усією
// організацією, не одним сайтом.

async function buildOrgScopedPrompt(organizationId: string, env: Env): Promise<PromptResolution> {
  const sitesResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,organization_id&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sites = sitesResult.data;

  // Memory (0049_qorax_ai_hub.sql, memoryHandler.ts) — та сама
  // інтеграція, що в buildSiteScopedPrompt, тут же для рівня всієї
  // організації (доречніше — Memory прив'язана саме до organization_id).
  const memoryContext = await buildMemoryContext(organizationId, env);
  const memoryBlock = memoryContext ? `\nКОНТЕКСТ ПРО БІЗНЕС КОРИСТУВАЧА:\n${memoryContext}\n` : "";

  if (sites.length === 0) {
    return {
      ok: true,
      prompt: `Ти — Qorax AI, асистент платформи Qorax для моніторингу сайтів.
У цієї організації ще немає жодного сайту на моніторингу.
${memoryBlock}
${STYLE_INSTRUCTIONS}

Запропонуй користувачу додати перший сайт, щоб почати отримувати дані.`,
    };
  }

  const siteIds = sites.map(s => s.id);
  const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;

  const [uptimeRes, insightsRes] = await Promise.all([
    selectRows<UptimeRow & { site_id: string }>(
      "uptime_checks",
      `select=status,response_time_ms,checked_at,site_id&site_id=${siteIdFilter}&order=checked_at.desc&limit=${sites.length * 20}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<InsightRow & { site_id: string }>(
      "ai_insights",
      `select=severity,problem_summary,plain_explanation,estimated_monthly_loss_usd,recommendation,site_id&site_id=${siteIdFilter}&is_resolved=eq.false&order=generated_at.desc&limit=30`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const lines: string[] = [];
  lines.push(`Портфоліо: ${sites.length} сайт(ів) на моніторингу.\n`);

  for (const site of sites) {
    const hostname = safeHostname(site.url);
    const siteUptime = uptimeRes.data.filter(u => u.site_id === site.id);
    const siteInsights = insightsRes.data.filter(i => i.site_id === site.id);

    lines.push(`— ${site.display_name} (${hostname})`);
    if (siteUptime.length > 0) {
      const upCount = siteUptime.filter(u => u.status === "up").length;
      const uptimePct = ((upCount / siteUptime.length) * 100).toFixed(1);
      lines.push(`  Uptime: ${uptimePct}% (останні ${siteUptime.length} перевірок)`);
    } else {
      lines.push(`  Uptime: даних ще немає`);
    }
    if (siteInsights.length > 0) {
      lines.push(`  Активні проблеми (${siteInsights.length}):`);
      for (const ins of siteInsights.slice(0, 5)) {
        const loss = ins.estimated_monthly_loss_usd ? ` [~$${ins.estimated_monthly_loss_usd}/міс]` : "";
        lines.push(`    • [${ins.severity.toUpperCase()}]${loss} ${ins.problem_summary}`);
      }
    } else {
      lines.push(`  Активних проблем немає`);
    }
  }

  const prompt = `Ти — Qorax AI, асистент платформи Qorax для моніторингу сайтів.
Ти бачиш дані ВСІХ сайтів організації користувача і допомагаєш з питаннями
на рівні всього портфоліо (не тільки одного сайту).
${memoryBlock}
ПОРТФОЛІО САЙТІВ:
${lines.join("\n")}

${STYLE_INSTRUCTIONS}

Якщо користувач питає про конкретний сайт — відповідай саме про нього
на основі даних вище. Якщо питає загально про портфоліо — узагальнюй.`;

  return { ok: true, prompt };
}

const STYLE_INSTRUCTIONS = `ТВІЙ СТИЛЬ:
- Відповідай коротко і по суті (2-5 речень, якщо не просять більше)
- Говори простою мовою без технічного жаргону — як консультант, не як розробник
- Завжди прив'язуй проблеми до грошей: "це коштує тобі приблизно X на місяць"
- Якщо даних недостатньо — чесно скажи і поясни коли вони з'являться
- Давай конкретні, пріоритизовані дії ("в першу чергу зроби X, потім Y")
- Мова відповідей: завжди українська

ЗАБОРОНЕНО:
- Вигадувати дані яких немає в контексті
- Нагадувати що ти AI або що у тебе є обмеження`;

// ─── Збираємо контекст сайту у текст для промпту (один сайт) ──

function buildSiteContext(
  uptime: UptimeRow[],
  speed: SpeedRow[],
  cwv: CwvRow[],
  insights: InsightRow[],
  ssl: SslRow | null
): string {
  const lines: string[] = [];

  if (uptime.length > 0) {
    const upCount = uptime.filter((u) => u.status === "up").length;
    const uptimePct = ((upCount / uptime.length) * 100).toFixed(1);
    const latestMs = uptime[0].response_time_ms;
    lines.push(`Uptime (останні ${uptime.length} перевірок): ${uptimePct}%`);
    if (latestMs) lines.push(`Останній час відповіді: ${latestMs} мс`);
  } else {
    lines.push("Uptime: даних ще немає");
  }

  if (ssl?.days_until_expiry != null) {
    if (ssl.days_until_expiry === 999) lines.push("SSL: активний");
    else if (ssl.days_until_expiry === 0) lines.push("SSL: проблема з сертифікатом");
    else lines.push(`SSL: діє ще ${ssl.days_until_expiry} днів`);
  }

  if (speed.length > 0) {
    const avg = Math.round(
      speed.reduce((s, r) => s + (r.load_time_ms ?? 0), 0) / speed.length
    );
    lines.push(`Середній час завантаження (${speed.length} вимірів): ${avg} мс`);
  }

  const mobileCwv = cwv.find((c) => c.strategy === "mobile");
  const desktopCwv = cwv.find((c) => c.strategy === "desktop");
  if (mobileCwv) {
    lines.push(
      `PageSpeed mobile: ${mobileCwv.performance_score ?? "—"}/100, LCP ${mobileCwv.lcp_ms ? Math.round(mobileCwv.lcp_ms) + " мс" : "—"}, CLS ${mobileCwv.cls_score ?? "—"}`
    );
  }
  if (desktopCwv) {
    lines.push(`PageSpeed desktop: ${desktopCwv.performance_score ?? "—"}/100`);
  }
  if (!mobileCwv && !desktopCwv) {
    lines.push("Core Web Vitals: даних ще немає (скан вночі о 3:00)");
  }

  if (insights.length > 0) {
    lines.push(`\nЗнайдені проблеми (${insights.length}):`);
    for (const ins of insights) {
      const loss = ins.estimated_monthly_loss_usd
        ? ` [втрати ~$${ins.estimated_monthly_loss_usd}/міс]`
        : "";
      lines.push(
        `• [${ins.severity.toUpperCase()}]${loss} ${ins.problem_summary}: ${ins.plain_explanation} → ${ins.recommendation}`
      );
    }
  } else {
    lines.push("AI-інсайти: ще не згенеровані (з'являться після нічного скану)");
  }

  return lines.join("\n");
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function buildCorsHeaders(origin: string | null, _env: Env): Record<string, string> {
  return sharedCorsHeaders(origin);
}

function jsonResponse(
  data: unknown,
  status: number,
  corsHeaders: Record<string, string>
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
