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
import { runUptimeChecks, runSpeedChecks, runSpeedCheckForSite, checkSslExpiry, expireTrials, sendTrialEmails } from "./lib/monitoring";
import { handleReportRequest, generateMonthlyReports } from "./lib/reportHandler";
import { handleTelegramWebhook } from "./lib/telegramWebhook";
import { handleChatRequest } from "./lib/chatHandler";
import { handleLSWebhook } from "./lib/lemonSqueezyWebhook";
import {
  handleGscAuth,
  handleGscCallback,
  handleGscStatus,
  handleGscDisconnect,
  handleGscSyncRequest,
  handleGscMetrics,
  runGscSync,
} from "./lib/gscHandler";
import { runSeoChecks } from "./lib/seoChecker";
import { runCompetitorChecks } from "./lib/competitorChecker";
import { runBrokenLinksChecks } from "./lib/brokenLinksChecker";
import {
  handleStripeCheckout,
  handleStripePortal,
  handleStripeWebhookRequest,
} from "./lib/stripeHandler";

// CORS — дозволяємо всі наші домени через wildcard matching
function getAllowedOrigin(origin: string | null): string {
  if (!origin) return "https://qorax.mrcru96.workers.dev";
  if (
    origin === "http://localhost:3000" ||
    origin === "http://localhost:3001" ||
    origin.endsWith(".workers.dev") ||
    origin.endsWith(".pages.dev") ||
    origin === "https://qorax.app" ||
    origin === "https://www.qorax.app"
  ) {
    return origin;
  }
  return "https://qorax.mrcru96.workers.dev";
}

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getAllowedOrigin(origin),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-admin-token",
    "Access-Control-Max-Age": "86400",
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
      return json({
        status: "ok",
        environment: env.ENVIRONMENT,
        supabase_url_set: !!env.SUPABASE_URL,
        service_key_set: !!env.SUPABASE_SERVICE_ROLE_KEY,
        supabase_url_prefix: env.SUPABASE_URL?.slice(0, 30) ?? "not set",
      }, 200, origin);
    }

    if (url.pathname === "/api/audit" && request.method === "POST") {
      return handleAuditRequest(request, env, origin, ctx);
    }

    if (url.pathname === "/api/report" && request.method === "GET") {
      return handleReportRequest(request, env, origin);
    }

    // ── Stripe ───────────────────────────────────────────────────
    if (url.pathname === "/api/stripe/checkout" && request.method === "POST") {
      return handleStripeCheckout(request, env, origin);
    }
    if (url.pathname === "/api/stripe/portal" && request.method === "POST") {
      return handleStripePortal(request, env, origin);
    }
    if (url.pathname === "/api/stripe/webhook" && request.method === "POST") {
      return handleStripeWebhookRequest(request, env);
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
    // ── Admin endpoints (захищені ADMIN_TOKEN) ──────────────────
    if (url.pathname.startsWith("/api/admin/") && request.method === "POST") {
      const token = request.headers.get("x-admin-token");
      if (!token || token !== env.ADMIN_TOKEN) {
        return json({ error: "Unauthorized" }, 401, origin);
      }

      if (url.pathname === "/api/admin/run-uptime") {
        ctx.waitUntil(
          runUptimeChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY, env.APP_URL, env.TELEGRAM_BOT_TOKEN)
            .then(s => console.log("Manual uptime:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Uptime checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/env-check") {
        return json({
          SUPABASE_URL: !!env.SUPABASE_URL,
          SUPABASE_SERVICE_ROLE_KEY: !!env.SUPABASE_SERVICE_ROLE_KEY,
          GOOGLE_PAGESPEED_API_KEY: !!env.GOOGLE_PAGESPEED_API_KEY,
          GEMINI_API_KEY: !!env.GEMINI_API_KEY,
          RESEND_API_KEY: !!env.RESEND_API_KEY,
          GOOGLE_CLIENT_ID: !!env.GOOGLE_CLIENT_ID,
          GOOGLE_TOKEN_ENCRYPTION_KEY: !!env.GOOGLE_TOKEN_ENCRYPTION_KEY,
        }, 200, origin);
      }

            if (url.pathname === "/api/admin/run-speed") {
        ctx.waitUntil(
          runSpeedChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.GOOGLE_PAGESPEED_API_KEY, env.GEMINI_API_KEY)
            .then(s => console.log("Manual speed:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Speed checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-seo") {
        ctx.waitUntil(
          runSeoChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
            .then(s => console.log("Manual SEO:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "SEO checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-competitors") {
        ctx.waitUntil(
          runCompetitorChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY, env.APP_URL, env.TELEGRAM_BOT_TOKEN)
            .then(s => console.log("Manual competitors:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Competitor checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-broken-links") {
        ctx.waitUntil(
          runBrokenLinksChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY, env.APP_URL)
            .then(s => console.log("Manual broken links:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Broken links checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-ssl-expiry") {
        ctx.waitUntil(
          checkSslExpiry(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY, env.APP_URL, env.TELEGRAM_BOT_TOKEN)
            .then(() => console.log("Manual SSL expiry check done"))
        );
        return json({ ok: true, message: "SSL expiry check started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/expire-trials") {
        ctx.waitUntil(
          expireTrials(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
            .then(() => console.log("Manual expire trials done"))
        );
        return json({ ok: true, message: "Expire trials started" }, 200, origin);
      }

      // Стара назва для сумісності
      if (url.pathname === "/api/admin/run-speed-checks") {
        ctx.waitUntil(
          runSpeedChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.GOOGLE_PAGESPEED_API_KEY, env.GEMINI_API_KEY)
            .then(s => console.log("Manual speed run:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Speed checks started in background" }, 200, origin);
      }

      return json({ error: "Unknown admin endpoint" }, 404, origin);
    }

    // LemonSqueezy — Customer Portal URL (для кнопки "Управляти підпискою")
    // GET /api/ls/portal?org_id=xxx — повертає свіжий portal URL
    if (url.pathname === "/api/ls/portal" && request.method === "GET") {
      const orgId = url.searchParams.get("org_id");
      if (!orgId) return json({ error: "org_id required" }, 400, origin);

      // Авторизація через JWT
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401, origin);

      // Беремо portal URL з БД (зберігається при webhook)
      const subResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/subscriptions?select=ls_subscription_id,ls_customer_portal_url&organization_id=eq.${encodeURIComponent(orgId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            Accept: "application/json",
          },
        }
      );

      if (!subResp.ok) return json({ error: "DB error" }, 500, origin);
      const subs = (await subResp.json()) as Array<{ ls_subscription_id: string; ls_customer_portal_url: string | null }>;
      const sub = subs[0];
      if (!sub) return json({ error: "No active subscription" }, 404, origin);

      // Якщо є збережений URL — повертаємо його
      if (sub.ls_customer_portal_url) {
        return json({ url: sub.ls_customer_portal_url }, 200, origin);
      }

      // Інакше — запитуємо свіжий URL через LS API
      if (sub.ls_subscription_id && env.LS_API_KEY) {
        const lsResp = await fetch(
          `https://api.lemonsqueezy.com/v1/subscriptions/${sub.ls_subscription_id}`,
          {
            headers: {
              Authorization: `Bearer ${env.LS_API_KEY}`,
              Accept: "application/vnd.api+json",
            },
          }
        );
        if (lsResp.ok) {
          const lsData = (await lsResp.json()) as {
            data?: { attributes?: { urls?: { customer_portal?: string } } };
          };
          const portalUrl = lsData.data?.attributes?.urls?.customer_portal;
          if (portalUrl) return json({ url: portalUrl }, 200, origin);
        }
      }

      return json({ error: "Portal URL not available" }, 404, origin);
    }

    // LemonSqueezy webhook
    if (url.pathname === "/api/ls/webhook" && request.method === "POST") {
      return handleLSWebhook(
        request,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        env.LS_WEBHOOK_SECRET
      );
    }

    // AI-асистент Qoraxus (Growth+)

    // ── GSC routes ─────────────────────────────────────────────────
    if (url.pathname === "/api/gsc/auth" && request.method === "GET") {
      return handleGscAuth(request, env);
    }
    if (url.pathname === "/api/gsc/callback" && request.method === "GET") {
      return handleGscCallback(request, env);
    }
    if (url.pathname === "/api/gsc/status" && request.method === "GET") {
      return handleGscStatus(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/gsc/disconnect" && request.method === "POST") {
      return handleGscDisconnect(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/gsc/sync" && request.method === "POST") {
      return handleGscSyncRequest(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/gsc/metrics" && request.method === "GET") {
      return handleGscMetrics(request, env, corsHeaders(origin));
    }

    if (url.pathname === "/api/chat" && request.method === "POST") {
      return handleChatRequest(request, env, origin, corsHeaders(origin));
    }

    // POST /api/sites/:id/run-speed — запуск перевірки швидкості для одного сайту
    const speedMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/run-speed$/);
    if (speedMatch && request.method === "POST") {
      const siteId = speedMatch[1];
      // Авторизація через JWT
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      ctx.waitUntil(
        runSpeedCheckForSite(
          siteId,
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.GOOGLE_PAGESPEED_API_KEY,
          env.GEMINI_API_KEY
        ).then(r => console.log(`Manual speed for site ${siteId}:`, r))
      );
      return json({ ok: true, message: "Speed check started" }, 200, origin);
    }

        return json({ error: "Маршрут не знайдено" }, 404, origin);
  },

  // ── Cron handler ──────────────────────────────────────────────
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // 0 3 * * * — щодня о 3:00: швидкість + SEO + конкуренти
    if (event.cron === "0 3 * * *") {
      const [speedSummary, seoSummary, competitorSummary] = await Promise.all([
        runSpeedChecks(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.GOOGLE_PAGESPEED_API_KEY,
          env.GEMINI_API_KEY
        ),
        runSeoChecks(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        ),
        runCompetitorChecks(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.RESEND_API_KEY,
          env.TELEGRAM_BOT_TOKEN,
          env.APP_URL
        ),
        runGscSync(env),
      ]);
      console.log("Speed:", JSON.stringify(speedSummary));
      console.log("SEO:", JSON.stringify(seoSummary));
      console.log("Competitors:", JSON.stringify(competitorSummary));
      return;
    }

    // 0 4 1 * * — першого числа кожного місяця о 4:00: PDF звіти
    if (event.cron === "0 4 1 * *") {
      const count = await generateMonthlyReports(env);
      console.log(`Monthly reports generated: ${count}`);
      return;
    }

    // 0 5 * * * — щодня о 5:00: expire trials + email нагадування
    if (event.cron === "0 5 * * *") {
      const [expiredCount, emailResult] = await Promise.all([
        expireTrials(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
        sendTrialEmails(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.RESEND_API_KEY,
          env.APP_URL
        ),
      ]);
      console.log(`Trials expired: ${expiredCount}`);
      console.log(`Trial emails: ${JSON.stringify(emailResult)}`);
      return;
    }

    // 30 4 * * 0 — щонеділі о 4:30: перевірка битих посилань
    if (event.cron === "30 4 * * 0") {
      const s = await runBrokenLinksChecks(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        env.RESEND_API_KEY,
        env.APP_URL
      );
      console.log("Broken links run:", JSON.stringify(s));
      return;
    }

    // */5 * * * * — кожні 5 хвилин: uptime + SSL
    await Promise.all([
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
    ]);
  },
};

export default worker;
export const scheduled = worker.scheduled.bind(worker);

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
