// ============================================================
// index.ts — главная точка входа Qorax API Worker.
// Маршруты:
//   POST /api/audit — бесплатный аудит сайта (lead magnet, ступень 1)
//   GET  /api/health — проверка живости воркера
// ============================================================

import type { Env } from "./types";
import { normalizeAndValidateUrl } from "./lib/url";
import { runBasicCheck } from "./lib/basicCheck";
import { runPageSpeedChecks } from "./lib/pageSpeed";
import { runAiAnalysis } from "./lib/aiAnalysis";
import { saveAuditLead, selectRows } from "./lib/supabase";
import { runUptimeChecks, runSpeedChecks, checkSslExpiry, expireTrials } from "./lib/monitoring";
import { handleReportRequest, generateMonthlyReports } from "./lib/reportHandler";
import { handleTelegramWebhook } from "./lib/telegramWebhook";
import { handleChatRequest } from "./lib/chatHandler";

// Список доменов, с которых разрешены запросы к API.
// Фронтенд живёт на Cloudflare Workers Builds (не Pages — см. миграцию
// с *.pages.dev), поэтому именно *.workers.dev должен быть в whitelist.
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://qorax.mrcru96.workers.dev",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === "/api/health" && request.method === "GET") {
      return json({ status: "ok", environment: env.ENVIRONMENT }, 200, origin);
    }

    if (url.pathname === "/api/audit" && request.method === "POST") {
      return handleAuditRequest(request, env, origin, ctx);
    }

    if (url.pathname === "/api/report" && request.method === "GET") {
      return handleReportRequest(request, env, origin);
    }

    // Webhook від Telegram — приймає update коли користувач пише /start <org_id> боту.
    // Не потребує CORS (Telegram шле напряму серверу, не через браузер).
    if (url.pathname === "/api/telegram/webhook" && request.method === "POST") {
      return handleTelegramWebhook(request, env);
    }

    // Polling-endpoint для фронту: перевіряє чи вже збережено chat_id для org.
    // Фронт викликає кожні 3с поки показується "Очікуємо підключення..."
    if (url.pathname === "/api/telegram/status" && request.method === "GET") {
      return handleTelegramStatus(request, env, origin);
    }

    // Внутренний эндпоинт для ручного запуска speed-check (защищён токеном)
    if (url.pathname === "/api/admin/run-speed-checks" && request.method === "POST") {
      const token = request.headers.get("x-admin-token");
      if (token !== env.ADMIN_TOKEN) return json({ error: "Unauthorized" }, 401, origin);
      ctx.waitUntil(
        runSpeedChecks(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.GOOGLE_PAGESPEED_API_KEY,
          env.GEMINI_API_KEY
        ).then((summary) => console.log("Manual speed run:", JSON.stringify(summary)))
      );
      return json({ ok: true, message: "Speed checks started in background" }, 200, origin);
    }

    // AI-асистент Qoraxus (Growth+)
    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRequest(request, env, origin);
    }

        return json({ error: "Маршрут не знайдено" }, 404, origin);
  },

  // Cron-розклад заданий мониторингу (див. [triggers] у wrangler.toml):
  //   */5 * * * *  — uptime + базовий SSL (часто, легка перевірка)
  //   0 3 * * *    — швидкість + Core Web Vitals (раз на день, важка)
  // Розрізняємо за event.cron, бо обидва тригери ведуть на один scheduled().
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // 0 3 * * * — ежедневно в 3:00: скорость + CWV + AI инсайты
    if (event.cron === "0 3 * * *") {
      ctx.waitUntil(
        Promise.all([
          runSpeedChecks(
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY,
            env.GOOGLE_PAGESPEED_API_KEY,
            env.GEMINI_API_KEY
          ).then((summary) => console.log("Speed monitoring run:", JSON.stringify(summary))),
          runSeoChecks(
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY
          ).then((summary) => console.log("SEO checks run:", JSON.stringify(summary))),
          runCompetitorChecks(
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY,
            env.RESEND_API_KEY,
            env.TELEGRAM_BOT_TOKEN,
            env.APP_URL
          ).then((summary) => console.log("Competitor checks run:", JSON.stringify(summary))),
        ])
      );
      return;
    }

    // 0 4 1 * * — в первый день каждого месяца в 4:00: генерация PDF отчётов
    if (event.cron === "0 4 1 * *") {
      ctx.waitUntil(
        generateMonthlyReports(env).then((count) =>
          console.log(`Monthly reports generated: ${count}`)
        )
      );
      return;
    }

    // 0 5 * * * — ежедневно в 5:00: перевод истёкших trial → free
    if (event.cron === "0 5 * * *") {
      ctx.waitUntil(
        expireTrials(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
          .then((count) => console.log(`Trials expired: ${count}`))
      );
      return;
    }

    // */5 * * * * — каждые 5 минут: uptime + SSL алерты
    ctx.waitUntil(
      Promise.all([
        runUptimeChecks(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.RESEND_API_KEY,
          env.APP_URL,
          env.TELEGRAM_BOT_TOKEN
        ).then((summary) => console.log("Uptime monitoring run:", JSON.stringify(summary))),
        checkSslExpiry(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.RESEND_API_KEY,
          env.APP_URL,
          env.TELEGRAM_BOT_TOKEN
        ),
      ])
    );
  },
};

export default worker;

interface AuditRequestBody {
  url?: string;
  email?: string;
}

async function handleAuditRequest(
  request: Request,
  env: Env,
  origin: string | null,
  ctx: ExecutionContext
): Promise<Response> {
  let body: AuditRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту" }, 400, origin);
  }

  if (!body.url || typeof body.url !== "string") {
    return json({ error: "Вкажіть адресу сайту" }, 400, origin);
  }

  const validation = normalizeAndValidateUrl(body.url);
  if (!validation.ok) {
    return json({ error: validation.error }, 400, origin);
  }

  const email =
    typeof body.email === "string" && body.email.includes("@") ? body.email.trim() : null;

  // Шаг 1: базовая проверка (быстрая, fetch + парсинг HTML) и
  // PageSpeed (медленнее, Lighthouse, mobile + desktop параллельно) —
  // всё вместе, чтобы не ждать их по очереди.
  const [basic, pageSpeed] = await Promise.all([
    runBasicCheck(validation.url),
    runPageSpeedChecks(validation.url, env.GOOGLE_PAGESPEED_API_KEY),
  ]);

  // Если сайт вообще недоступен — нет смысла гнать его через AI,
  // сразу отдаём понятную ошибку.
  if (!basic.reachable) {
    return json(
      {
        error:
          basic.errorMessage ?? "Сайт недоступний. Перевірте адресу та спробуйте ще раз.",
      },
      200,
      origin
    );
  }

  // Шаг 2: AI-анализ собранных данных. AI получает оба score (mobile —
  // приоритетный, як основний сигнал для prompt'у, бо Google теж
  // mobile-first при індексації) — десктопний показуємо окремо на UI,
  // але в текст висновку AI не дублюємо, щоб не плутати власника сайту.
  const aiAnalysis = await runAiAnalysis(
    validation.hostname,
    basic,
    pageSpeed.mobile,
    env.GEMINI_API_KEY
  );

  // Шаг 3: для бесплатного лид-магнита показываем максимум 2 находки
  // полностью, остальные — только заголовок ("ще N проблем знайдено").
  // Полный список — за платним аудитом $19 або підпискою.
  const visibleFindings = aiAnalysis.findings.slice(0, 2);
  const hiddenCount = Math.max(aiAnalysis.findings.length - visibleFindings.length, 0);

  const previewResults = {
    overallSummary: aiAnalysis.overallSummary,
    performanceScoreMobile: pageSpeed.mobile.performanceScore,
    performanceScoreDesktop: pageSpeed.desktop.performanceScore,
    responseTimeMs: basic.responseTimeMs,
    sslValid: basic.sslValid,
    pageSizeKb: basic.pageSizeKb,
    findings: aiAnalysis.findings,
  };

  // Сохраняем лид в фоне через waitUntil — Cloudflare Workers гарантирует
  // выполнение этого промиса даже после того как ответ уже отправлен
  // пользователю, в отличие от просто "не дожидаться" промиса.
  ctx.waitUntil(
    saveAuditLead(
      { email, siteUrl: validation.url, previewResults },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ).catch(() => {
      // Намеренно глушим ошибку сохранения лида — это не должно ломать
      // ответ пользователю с результатами аудита.
    })
  );

  return json(
    {
      url: validation.url,
      overallSummary: aiAnalysis.overallSummary,
      performanceScoreMobile: pageSpeed.mobile.performanceScore,
      performanceScoreDesktop: pageSpeed.desktop.performanceScore,
      responseTimeMs: basic.responseTimeMs,
      sslValid: basic.sslValid,
      pageSizeKb: basic.pageSizeKb,
      visibleFindings,
      hiddenFindingsCount: hiddenCount,
    },
    200,
    origin
  );
}

// Перевіряє чи підключений Telegram для org — фронт polling'ує кожні 3с
// поки показується "Очікуємо підключення..." після відкриття бота
async function handleTelegramStatus(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const reqUrl = new URL(request.url);
  const orgId = reqUrl.searchParams.get("org");
  if (!orgId) return json({ connected: false }, 400, origin);

  const result = await selectRows<{ telegram_chat_id: string | null; telegram_enabled: boolean }>(
    "notification_settings",
    `select=telegram_chat_id,telegram_enabled&organization_id=eq.${encodeURIComponent(orgId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const row = result.ok ? result.data[0] : null;
  const connected = !!(row?.telegram_chat_id && row?.telegram_enabled);
  return json({ connected, chatId: connected ? row!.telegram_chat_id : null }, 200, origin);
}
