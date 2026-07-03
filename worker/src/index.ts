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
import { runUptimeChecks, runSpeedChecks, runSpeedCheckForSite, checkSslExpiry, expireTrials, sendTrialEmails, sendWeeklyDigests, checkSpeedDegradation } from "./lib/monitoring";
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
import { runUrlSpeedChecks } from "./lib/urlSpeedChecker";
import { runFormChecks } from "./lib/formChecker";
import { runBrokenLinksChecks } from "./lib/brokenLinksChecker";
import {
  handleStripeCheckout,
  handleStripePortal,
  handleStripeWebhookRequest,
} from "./lib/stripeHandler";
import { requireAdmin } from "./lib/adminAuth";

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
    // GET /api/admin/stats — статистика для адмін панелі (захищено JWT + platform_role=admin)
    if (url.pathname === "/api/admin/stats" && request.method === "GET") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Prefer: "count=exact" };
      const [usersRes, sitesRes, trialsRes, paidRes, checksRes] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/sites?select=id`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?status=eq.trialing&select=id`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?status=eq.active&select=id`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/uptime_checks?select=id`, { headers: h }),
      ]);

      const getCount = (res: Response) => parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0");

      return json({
        users: getCount(usersRes),
        sites: getCount(sitesRes),
        trials: getCount(trialsRes),
        paid: getCount(paidRes),
        checks: getCount(checksRes),
      }, 200, origin);
    }

    // GET /api/admin/clients — список клієнтів (захищено JWT + platform_role=admin)
    if (url.pathname === "/api/admin/clients" && request.method === "GET") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const [plansRes, orgsRes] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/plans?select=id,code,name&order=price_usd`,
          { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }),
        fetch(`${env.SUPABASE_URL}/rest/v1/organizations?select=id,name,created_at,organization_members(user_id,role),subscriptions(id,status,trial_ends_at,plan_id,created_at)&order=created_at.desc&limit=100`,
          { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` } }),
      ]);

      const plans = await plansRes.json() as Array<{ id: string; code: string; name: string }>;
      const orgsRaw = await orgsRes.text();
      console.log("[admin/clients] orgsRes status:", orgsRes.status, "body:", orgsRaw.slice(0, 200));
      const orgs = JSON.parse(orgsRaw) as Array<{
        id: string; name: string; created_at: string;
        organization_members: Array<{ user_id: string; role: string }>;
        subscriptions: Array<{ id: string; status: string; trial_ends_at: string | null; plan_id: string | null; created_at: string }>;
      }>;

      // Отримуємо emails через Auth Admin API
      const userIds = [...new Set((Array.isArray(orgs) ? orgs : [])
        .flatMap(o => o.organization_members?.map(m => m.user_id) ?? []))];

      const emailMap: Record<string, string> = {};
      if (userIds.length > 0) {
        try {
          const authRes = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=1000`, {
            headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
          });
          if (authRes.ok) {
            const authData = await authRes.json() as { users: Array<{ id: string; email: string }> };
            for (const u of authData.users ?? []) emailMap[u.id] = u.email;
          }
        } catch { /* ignore */ }
      }

      const plansMap = Object.fromEntries((Array.isArray(plans) ? plans : []).map(p => [p.id, p]));
      const orgsWithPlans = (Array.isArray(orgs) ? orgs : []).map(org => ({
        ...org,
        organization_members: (Array.isArray(org.organization_members) ? org.organization_members : []).map(m => ({
          ...m,
          profiles: { email: emailMap[m.user_id] ?? null },
        })),
        subscriptions: (Array.isArray(org.subscriptions) ? org.subscriptions : []).map(sub => ({
          ...sub,
          plans: sub.plan_id ? (plansMap[sub.plan_id] ?? null) : null,
        })),
      }));

      return json({ orgs: orgsWithPlans, plans }, 200, origin);
    }

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
          runUrlSpeedChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).catch(e =>
          console.error("urlSpeedChecks cron error:", e)
        ),
        runFormChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).catch(e =>
          console.error("formChecks cron error:", e)
        ),
        runSeoChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
            .then(s => console.log("Manual SEO:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "SEO checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-weekly-digest") {
        const r = await sendWeeklyDigests(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY, env.APP_URL);
        return json({ ok: true, sent: r.sent, errors: r.errors }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-url-speeds") {
        const r = await runUrlSpeedChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        return json({ ok: true, ...r }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-forms") {
        const r = await runFormChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        return json({ ok: true, ...r }, 200, origin);
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

    // POST /api/admin/change-plan — зміна плану для організації (захищено session JWT)
    if (url.pathname === "/api/admin/change-plan" && request.method === "POST") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const body = await request.json() as { org_id: string; plan_id: string };
      if (!body.org_id || !body.plan_id) return json({ error: "org_id and plan_id required" }, 400, origin);

      // Оновлюємо або створюємо підписку
      const upsertRes = await fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?org_id=eq.${body.org_id}`, {
        method: "PATCH",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ plan_id: body.plan_id, status: "active", updated_at: new Date().toISOString() }),
      });
      if (!upsertRes.ok) return json({ error: "DB update failed" }, 500, origin);

      return json({ ok: true }, 200, origin);
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
        ).then(async (speedMs) => {
          console.log(`Manual speed for site ${siteId}:`, speedMs);
          // Перевіряємо деградацію після ручного запуску теж
          if (typeof speedMs === "number" && speedMs > 0) {
            await checkSpeedDegradation(
              siteId, speedMs,
              env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
              env.RESEND_API_KEY, env.TELEGRAM_BOT_TOKEN, env.APP_URL
            ).catch(e => console.warn("Speed degradation check error:", e));
          }
        })
      );
      return json({ ok: true, message: "Speed check started" }, 200, origin);
    }

    // GET /api/badge/:siteId — публічний SVG бейдж "Monitored by Qorax"
    const badgeMatch = url.pathname.match(/^\/api\/badge\/([^/]+)$/);
    if (badgeMatch && request.method === "GET") {
      const siteId = badgeMatch[1];
      // Публічний — отримуємо тільки uptime % за 7 днів
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      };
      const checksResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/uptime_checks?select=status&site_id=eq.${siteId}&checked_at=gte.${weekAgo}`,
        { headers: h }
      );
      let uptimePct = 99.9;
      if (checksResp.ok) {
        const checks = await checksResp.json() as Array<{ status: string }>;
        if (checks.length > 0) {
          uptimePct = (checks.filter(c => c.status === "up").length / checks.length) * 100;
        }
      }
      const pctStr = uptimePct.toFixed(2) + "%";
      const color = uptimePct >= 99.5 ? "#4ade80" : uptimePct >= 98 ? "#fb923c" : "#f87171";
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="24" role="img" aria-label="Monitored by Qorax: ${pctStr} uptime">
  <title>Monitored by Qorax: ${pctStr} uptime</title>
  <rect width="200" height="24" rx="4" fill="#111"/>
  <rect x="2" y="2" width="4" height="4" rx="1" fill="${color}"/>
  <text x="12" y="16.5" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11" fill="#a1a1aa">Monitored by</text>
  <text x="92" y="16.5" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11" font-weight="600" fill="#f5f5f7">Qorax</text>
  <text x="136" y="16.5" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11" fill="#a1a1aa">·</text>
  <text x="143" y="16.5" font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif" font-size="11" font-weight="600" fill="${color}">${pctStr}</text>
</svg>`;
      return new Response(svg, {
        headers: {
          "Content-Type": "image/svg+xml",
          "Cache-Control": "public, max-age=300",
          ...corsHeaders(origin),
        },
      });
    }

    // GET /api/status/:slug — публічні дані сторінки статусу (Growth)
    const statusMatch = url.pathname.match(/^\/api\/status\/([^/]+)$/);
    if (statusMatch && request.method === "GET") {
      const slug = statusMatch[1];
      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      };

      // Знаходимо сайт за slug
      const siteResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sites?select=id,url,display_name,status_page_enabled&status_page_slug=eq.${encodeURIComponent(slug)}&limit=1`,
        { headers: h }
      );
      if (!siteResp.ok) return json({ error: "Server error" }, 500, origin);
      const sites = await siteResp.json() as Array<{
        id: string; url: string; display_name: string; status_page_enabled: boolean;
      }>;
      const site = sites[0];
      if (!site || !site.status_page_enabled) {
        return json({ error: "Сторінку статусу не знайдено" }, 404, origin);
      }

      const siteId = site.id;
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [checksResp, incidentsResp, speedResp, sslResp] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/uptime_checks?select=status,checked_at&site_id=eq.${siteId}&checked_at=gte.${weekAgo}&order=checked_at.desc`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/uptime_incidents?select=id,started_at,resolved_at,duration_seconds&site_id=eq.${siteId}&started_at=gte.${monthAgo}&order=started_at.desc&limit=20`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/speed_checks?select=load_time_ms,checked_at&site_id=eq.${siteId}&checked_at=gte.${weekAgo}&order=checked_at.desc&limit=50`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/ssl_certificates?select=days_until_expiry,valid_until&site_id=eq.${siteId}&limit=1`, { headers: h }),
      ]);

      const checks = checksResp.ok ? await checksResp.json() as Array<{ status: string; checked_at: string }> : [];
      const incidents = incidentsResp.ok ? await incidentsResp.json() as Array<{ id: string; started_at: string; resolved_at: string | null; duration_seconds: number | null }> : [];
      const speeds = speedResp.ok ? await speedResp.json() as Array<{ load_time_ms: number; checked_at: string }> : [];
      const sslArr = sslResp.ok ? await sslResp.json() as Array<{ days_until_expiry: number | null; valid_until: string | null }> : [];

      // Uptime % за 7 днів
      const totalChecks = checks.length;
      const upChecks = checks.filter(c => c.status === "up").length;
      const uptimePct7d = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

      // Поточний статус (останні 2 перевірки)
      const recentChecks = checks.slice(0, 2);
      const currentStatus = recentChecks.length === 0
        ? "unknown"
        : recentChecks[0].status === "up" ? "up" : "down";

      // Uptime по днях за 7 днів (для графіка)
      const dailyUptime: Array<{ date: string; pct: number; checks: number }> = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
        const dayChecks = checks.filter(c => {
          const t = new Date(c.checked_at).getTime();
          return t >= dayStart.getTime() && t < dayEnd.getTime();
        });
        const dayUp = dayChecks.filter(c => c.status === "up").length;
        dailyUptime.push({
          date: dayStart.toISOString().slice(0, 10),
          pct: dayChecks.length > 0 ? (dayUp / dayChecks.length) * 100 : 100,
          checks: dayChecks.length,
        });
      }

      // Середня швидкість за 24 год
      const recentSpeeds = speeds.filter(s => new Date(s.checked_at).getTime() > new Date(dayAgo).getTime());
      const avgSpeedMs = recentSpeeds.length
        ? Math.round(recentSpeeds.reduce((a, b) => a + b.load_time_ms, 0) / recentSpeeds.length)
        : null;

      const ssl = sslArr[0] ?? null;

      return json({
        site: {
          displayName: site.display_name,
          url: site.url,
        },
        currentStatus,
        uptimePct7d: Math.round(uptimePct7d * 100) / 100,
        avgSpeedMs,
        dailyUptime,
        incidents: incidents.slice(0, 10),
        ssl: ssl ? { daysLeft: ssl.days_until_expiry, validUntil: ssl.valid_until } : null,
        generatedAt: new Date().toISOString(),
      }, 200, origin);
    }

    // PATCH /api/sites/:id/status-page — увімкнути/вимкнути сторінку статусу
    const statusPageMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/status-page$/);
    if (statusPageMatch && request.method === "PATCH") {
      const siteId = statusPageMatch[1];
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      const body = await request.json() as { enabled?: boolean; slug?: string };
      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };

      // Якщо вмикаємо і slug не вказаний — генеруємо автоматично
      let slug = body.slug;
      if (body.enabled && !slug) {
        const siteResp = await fetch(
          `${env.SUPABASE_URL}/rest/v1/sites?select=display_name,status_page_slug&id=eq.${siteId}&limit=1`,
          { headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Accept: "application/json" } }
        );
        if (siteResp.ok) {
          const sites = await siteResp.json() as Array<{ display_name: string; status_page_slug: string | null }>;
          const existing = sites[0];
          // Якщо slug вже є — використовуємо його, інакше генеруємо
          slug = existing?.status_page_slug ?? existing?.display_name
            ?.toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 50) + "-" + siteId.slice(0, 8);
        }
      }

      const patch: Record<string, unknown> = {};
      if (body.enabled !== undefined) patch.status_page_enabled = body.enabled;
      if (slug !== undefined) patch.status_page_slug = slug;

      const patchResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sites?id=eq.${siteId}`,
        { method: "PATCH", headers: h, body: JSON.stringify(patch) }
      );
      if (!patchResp.ok) {
        const err = await patchResp.text();
        return json({ error: err }, 400, origin);
      }
      const updated = await patchResp.json() as Array<{ status_page_slug: string | null; status_page_enabled: boolean }>;
      return json({ ok: true, slug: updated[0]?.status_page_slug, enabled: updated[0]?.status_page_enabled }, 200, origin);
    }

    // ── Multi-URL speed monitoring ────────────────────────────────────────────
    const monitoredUrlsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/monitored-urls$/);
    if (monitoredUrlsMatch) {
      const siteId = monitoredUrlsMatch[1];
      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

      if (request.method === "GET") {
        // Список URL + останній speed check
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_urls?site_id=eq.${siteId}&active=eq.true&select=id,url,label,created_at&order=created_at.asc`, { headers: h });
        const urls = await res.json() as Array<{ id: string; url: string; label: string | null; created_at: string }>;

        // Для кожного URL — останній check
        const withChecks = await Promise.all(urls.map(async mu => {
          const cr = await fetch(`${env.SUPABASE_URL}/rest/v1/url_speed_checks?monitored_url_id=eq.${mu.id}&order=checked_at.desc&limit=10&select=load_time_ms,status_code,checked_at`, { headers: h });
          const checks = cr.ok ? await cr.json() : [];
          return { ...mu, checks };
        }));

        return json(withChecks, 200, origin);
      }

      if (request.method === "POST") {
        const body = await request.json() as { url: string; label?: string };
        if (!body.url) return json({ error: "url required" }, 400, origin);
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_urls`, {
          method: "POST", headers: h,
          body: JSON.stringify({ site_id: siteId, url: body.url, label: body.label ?? null }),
        });
        if (!res.ok) return json({ error: await res.text() }, 400, origin);
        return json(await res.json(), 201, origin);
      }
    }

    const monitoredUrlDeleteMatch = url.pathname.match(/^\/api\/monitored-urls\/([^/]+)$/);
    if (monitoredUrlDeleteMatch && request.method === "DELETE") {
      const id = monitoredUrlDeleteMatch[1];
      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
      await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_urls?id=eq.${id}`, { method: "DELETE", headers: h });
      return json({ ok: true }, 200, origin);
    }

    // ── Form monitoring ────────────────────────────────────────────────────────
    const monitoredFormsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/monitored-forms$/);
    if (monitoredFormsMatch) {
      const siteId = monitoredFormsMatch[1];
      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" };

      if (request.method === "GET") {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_forms?site_id=eq.${siteId}&active=eq.true&select=id,page_url,label,created_at&order=created_at.asc`, { headers: h });
        const forms = await res.json() as Array<{ id: string; page_url: string; label: string | null; created_at: string }>;
        const withChecks = await Promise.all(forms.map(async mf => {
          const cr = await fetch(`${env.SUPABASE_URL}/rest/v1/form_checks?monitored_form_id=eq.${mf.id}&order=checked_at.desc&limit=1&select=form_found,fields_count,has_submit,checked_at`, { headers: h });
          const checks = cr.ok ? await cr.json() : [];
          return { ...mf, lastCheck: checks[0] ?? null };
        }));
        return json(withChecks, 200, origin);
      }

      if (request.method === "POST") {
        const body = await request.json() as { page_url: string; label?: string; form_selector?: string };
        if (!body.page_url) return json({ error: "page_url required" }, 400, origin);
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_forms`, {
          method: "POST", headers: h,
          body: JSON.stringify({ site_id: siteId, page_url: body.page_url, label: body.label ?? null, form_selector: body.form_selector ?? null }),
        });
        if (!res.ok) return json({ error: await res.text() }, 400, origin);
        return json(await res.json(), 201, origin);
      }
    }

    const monitoredFormDeleteMatch = url.pathname.match(/^\/api\/monitored-forms\/([^/]+)$/);
    if (monitoredFormDeleteMatch && request.method === "DELETE") {
      const id = monitoredFormDeleteMatch[1];
      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
      await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_forms?id=eq.${id}`, { method: "DELETE", headers: h });
      return json({ ok: true }, 200, origin);
    }

    // ── Competitor changes (diff view) ─────────────────────────────────────────
    const competitorChangesMatch = url.pathname.match(/^\/api\/competitors\/([^/]+)\/changes$/);
    if (competitorChangesMatch && request.method === "GET") {
      const competitorId = competitorChangesMatch[1];
      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/competitor_changes?competitor_id=eq.${competitorId}&order=detected_at.desc&limit=10&select=id,detected_at,change_summary,old_snapshot,new_snapshot`,
        { headers: h }
      );
      return json(await res.json(), 200, origin);
    }

    // ── Admin stats ────────────────────────────────────────────────────────────
    if (url.pathname === "/api/admin/stats" && request.method === "GET") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const h = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Prefer": "count=exact", "Accept": "application/json" };
      const tables = ["profiles", "sites", "uptime_checks"];
      const statusFilters = [
        { table: "subscriptions", filter: "status=eq.trialing" },
        { table: "subscriptions", filter: "status=eq.active" },
      ];

      const [usersRes, sitesRes, checksRes, trialsRes, paidRes] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=id`, { headers: { ...h, "Range-Unit": "items", "Range": "0-0" } }),
        fetch(`${env.SUPABASE_URL}/rest/v1/sites?select=id`, { headers: { ...h, "Range-Unit": "items", "Range": "0-0" } }),
        fetch(`${env.SUPABASE_URL}/rest/v1/uptime_checks?select=id`, { headers: { ...h, "Range-Unit": "items", "Range": "0-0" } }),
        fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?status=eq.trialing&select=id`, { headers: { ...h, "Range-Unit": "items", "Range": "0-0" } }),
        fetch(`${env.SUPABASE_URL}/rest/v1/subscriptions?status=eq.active&select=id`, { headers: { ...h, "Range-Unit": "items", "Range": "0-0" } }),
      ]);

      function getCount(res: Response): number {
        const cr = res.headers.get("content-range");
        if (!cr) return 0;
        const m = cr.match(/\/(\d+)/);
        return m ? parseInt(m[1]) : 0;
      }

      return json({
        users: getCount(usersRes),
        sites: getCount(sitesRes),
        checks: getCount(checksRes),
        trials: getCount(trialsRes),
        paid: getCount(paidRes),
      }, 200, origin);
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
          env.GEMINI_API_KEY,
          // Передаємо callback для перевірки деградації після кожного сайту
          async (siteId: string, speedMs: number) => {
            await checkSpeedDegradation(
              siteId, speedMs,
              env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY,
              env.RESEND_API_KEY, env.TELEGRAM_BOT_TOKEN, env.APP_URL
            );
          }
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

    // 0 5 * * * — щодня о 5:00: expire trials + email нагадування + weekly digest (по понеділках)
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

      // Weekly digest — тільки в понеділок (день тижня = 1)
      const dayOfWeek = new Date().getUTCDay(); // 0=Sun, 1=Mon
      if (dayOfWeek === 1) {
        const digestResult = await sendWeeklyDigests(
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY,
          env.RESEND_API_KEY,
          env.APP_URL
        );
        console.log(`Weekly digests: sent=${digestResult.sent}, errors=${digestResult.errors.length}`);
        if (digestResult.errors.length) console.warn("Digest errors:", digestResult.errors);
      }
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
export { scheduled };

function scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  return worker.scheduled(event, env, ctx);
}
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
