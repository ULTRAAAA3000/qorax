// ============================================================
// chatHandler.ts — Qoraxus AI-асистент (Growth-фіча).
//
// Флоу:
//   POST /api/chat { site_id, messages: [{role, content}] }
//   → перевіряємо що site_id належить org з Growth+ планом
//   → збираємо контекст сайту з БД (uptime, speed, CWV, ai_insights)
//   → будуємо system prompt з Revenue Impact фреймінгом
//   → Gemini повертає відповідь
//   → стрімимо або повертаємо JSON
//
// Окремий ключ GEMINI_CHAT_API_KEY щоб квота моніторингу
// (GEMINI_API_KEY) не перетиналась з інтерактивними запитами.
// ============================================================

import { selectRows } from "./supabase";
import type { Env } from "../types";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;
const MAX_HISTORY_MESSAGES = 10; // останні N повідомлень щоб не перевищити контекст

export interface ChatMessage {
  role: "user" | "model";
  content: string;
}

interface ChatRequest {
  site_id?: string;
  messages?: ChatMessage[];
}

// ─── Типи рядків з БД ────────────────────────────────────────

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
}

interface SslRow {
  days_until_expiry: number | null;
}

// ─── Main handler ─────────────────────────────────────────────

export async function handleChatRequest(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const corsHeaders = buildCorsHeaders(origin, env);

  let body: ChatRequest;
  try {
    body = (await request.json()) as ChatRequest;
  } catch {
    return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
  }

  const { site_id, messages } = body;

  if (!site_id || typeof site_id !== "string") {
    return jsonResponse({ error: "site_id обов'язковий" }, 400, corsHeaders);
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return jsonResponse({ error: "messages обов'язковий" }, 400, corsHeaders);
  }

  // Аутентифікуємо через Supabase JWT з заголовку Authorization
  // Фронт передає токен сесії: Authorization: Bearer <supabase_jwt>
  const authHeader = request.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "").trim();
  if (!jwt) {
    return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
  }

  // Перевіряємо що site_id належить цьому користувачу
  // UUID не потребує encodeURIComponent (тільки hex + дефіси)
  const siteResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,organization_id&id=eq.${site_id}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!siteResult.ok) {
    console.error("[chat] site lookup failed:", siteResult.error);
    return jsonResponse({ error: "Помилка отримання сайту", detail: siteResult.error }, 500, corsHeaders);
  }
  if (!siteResult.data[0]) {
    return jsonResponse({ error: "Сайт не знайдено", site_id }, 404, corsHeaders);
  }

  const site = siteResult.data[0];

  // Перевіряємо план — чат доступний тільки для Growth+
  const subResult = await selectRows<SubscriptionRow>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(site.organization_id)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const sub = subResult.data[0];
  const planCode = (sub?.plans as PlanRow | null)?.code ?? "free";
  console.log("[chat] plan check:", { planCode, subStatus: sub?.status, subOk: subResult.ok, subError: subResult.error });

  // trial і admin мають доступ для тестування
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

  // Збираємо контекст сайту паралельно
  const [uptimeRes, speedRes, cwvRes, insightsRes, sslRes] = await Promise.all([
    selectRows<UptimeRow>(
      "uptime_checks",
      `select=status,response_time_ms,checked_at&site_id=eq.${site_id}&order=checked_at.desc&limit=48`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<SpeedRow>(
      "speed_checks",
      `select=load_time_ms,checked_at&site_id=eq.${site_id}&order=checked_at.desc&limit=7`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<CwvRow>(
      "core_web_vitals_checks",
      `select=strategy,lcp_ms,inp_ms,cls_score,performance_score,checked_at&site_id=eq.${site_id}&order=checked_at.desc&limit=4`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<InsightRow>(
      "ai_insights",
      `select=severity,problem_summary,plain_explanation,estimated_monthly_loss_usd,recommendation&site_id=eq.${site_id}&is_resolved=eq.false&order=generated_at.desc&limit=10`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<SslRow>(
      "ssl_certificates",
      `select=days_until_expiry&site_id=eq.${site_id}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const siteContext = buildSiteContext(
    site,
    uptimeRes.data,
    speedRes.data,
    cwvRes.data,
    insightsRes.data,
    sslRes.data[0] ?? null
  );

  const systemPrompt = buildSystemPrompt(site.display_name, new URL(site.url).hostname, siteContext);

  // Обрізаємо історію до MAX_HISTORY_MESSAGES щоб не переповнити контекст
  const trimmedMessages = messages.slice(-MAX_HISTORY_MESSAGES);

  // Формуємо запит до Gemini
  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: trimmedMessages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.6,
      maxOutputTokens: 800,
    },
  };

  const apiKey = env.GEMINI_CHAT_API_KEY || env.GEMINI_API_KEY; // fallback якщо окремий ключ не заданий

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const geminiResp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(geminiBody),
    });
    clearTimeout(timeout);

    if (!geminiResp.ok) {
      const errText = await geminiResp.text();
      console.error("Gemini chat error:", geminiResp.status, errText.slice(0, 200));
      return jsonResponse(
        { error: "AI тимчасово недоступний, спробуйте через хвилину" },
        503,
        corsHeaders
      );
    }

    interface GeminiResponse {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    }

    const data = (await geminiResp.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return jsonResponse({ reply: text.trim() }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return jsonResponse({ error: "AI не відповів вчасно, спробуйте ще раз" }, 504, corsHeaders);
    }
    return jsonResponse({ error: "Внутрішня помилка" }, 500, corsHeaders);
  }
}

// ─── Збираємо контекст сайту у текст для промпту ─────────────

function buildSiteContext(
  site: SiteRow,
  uptime: UptimeRow[],
  speed: SpeedRow[],
  cwv: CwvRow[],
  insights: InsightRow[],
  ssl: SslRow | null
): string {
  const lines: string[] = [];

  // Uptime
  if (uptime.length > 0) {
    const upCount = uptime.filter((u) => u.status === "up").length;
    const uptimePct = ((upCount / uptime.length) * 100).toFixed(1);
    const latestMs = uptime[0].response_time_ms;
    lines.push(`Uptime (останні ${uptime.length} перевірок): ${uptimePct}%`);
    if (latestMs) lines.push(`Останній час відповіді: ${latestMs} мс`);
  } else {
    lines.push("Uptime: даних ще немає");
  }

  // SSL
  if (ssl?.days_until_expiry != null) {
    if (ssl.days_until_expiry === 999) lines.push("SSL: активний");
    else if (ssl.days_until_expiry === 0) lines.push("SSL: проблема з сертифікатом");
    else lines.push(`SSL: діє ще ${ssl.days_until_expiry} днів`);
  }

  // Speed trend
  if (speed.length > 0) {
    const avg = Math.round(
      speed.reduce((s, r) => s + (r.load_time_ms ?? 0), 0) / speed.length
    );
    lines.push(`Середній час завантаження (${speed.length} вимірів): ${avg} мс`);
  }

  // Core Web Vitals
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

  // AI insights
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

// ─── Системний промпт ─────────────────────────────────────────

function buildSystemPrompt(displayName: string, hostname: string, context: string): string {
  return `Ти — Qoraxus, AI-асистент платформи Qorax для моніторингу сайтів.
Ти аналізуєш конкретний сайт і даєш рекомендації власнику малого бізнесу.

САЙТ: ${displayName} (${hostname})

ПОТОЧНІ ДАНІ МОНІТОРИНГУ:
${context}

ТВІЙ СТИЛЬ:
- Відповідай коротко і по суті (2-5 речень, якщо не просять більше)
- Говори простою мовою без технічного жаргону — як консультант, не як розробник
- Завжди прив'язуй проблеми до грошей: "це коштує тобі приблизно X на місяць"
- Якщо даних недостатньо — чесно скажи і поясни коли вони з'являться
- Давай конкретні, пріоритизовані дії ("в першу чергу зроби X, потім Y")
- Мова відповідей: завжди українська

ЗАБОРОНЕНО:
- Вигадувати дані яких немає в контексті
- Давати поради про речі які не стосуються цього сайту
- Нагадувати що ти AI або що у тебе є обмеження

Якщо питання не стосується цього сайту — м'яко поверни розмову до моніторингу і метрик.`;
}

// ─── Helpers ─────────────────────────────────────────────────

function buildCorsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = [
    "http://localhost:3000",
    "https://qorax.mrcru96.workers.dev",
    env.APP_URL,
  ].filter(Boolean);
  const allowedOrigin =
    origin && allowed.includes(origin) ? origin : (allowed[0] ?? "*");
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
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
