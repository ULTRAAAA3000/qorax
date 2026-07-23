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
import { saveAuditLead, selectRows, serviceRoleHeaders } from "./lib/supabase";
import { runUptimeChecks, runUptimeCheckForSite, resolveIncidentManually, runSpeedChecks, runSpeedCheckForSite, checkSslExpiry, expireTrials, sendTrialEmails, sendWeeklyDigests, checkSpeedDegradation } from "./lib/monitoring";
import { handleReportRequest, generateMonthlyReports } from "./lib/reportHandler";
import { handleFixRequest } from "./lib/fixRequestHandler";
import {
  handleGetReferralStats, handleAdminListCommissions, handleAdminUpdateCommission,
} from "./lib/referralHandler";
import {
  handleGetTeam, handlePostInvite, handleRevokeInvite, handleAcceptInvite,
  handleUpdateMemberRole, handleRemoveMember, handleGetInvitePreview,
} from "./lib/teamHandler";
import { handleTelegramWebhook } from "./lib/telegramWebhook";
import { sendTelegramWeeklyDigests, runBusinessCoachCheck } from "./lib/telegramBotHandler";
import { setTelegramBotCommands } from "./lib/telegram";
import { handleChatRequest, handleGetOrCreateThreadRequest } from "./lib/chatHandler";
import {
  handleWorkspaceUploadRequest,
  handleWorkspaceListRequest,
  handleWorkspaceDeleteRequest,
} from "./lib/workspaceHandler";
import { handleMemoryGetRequest, handleMemoryUpdateRequest } from "./lib/memoryHandler";
import {
  handleAgentsListRequest,
  handleAgentRunsListRequest,
  handleRunContentAgentRequest,
  handleAgentSubscriptionsListRequest,
  handleAgentSubscriptionUpsertRequest,
  handleAgentSubscriptionToggleRequest,
  runDueAgentAutomations,
  handleRunSeoAgentRequest,
  handleRunRankAgentRequest,
} from "./lib/agentHandler";
import {
  handleTasksListRequest,
  handleTaskCreateRequest,
  handleTaskUpdateRequest,
  handleTaskDeleteRequest,
} from "./lib/taskHandler";
import { handleInboxListRequest, handleInboxUpdateRequest } from "./lib/aiInbox";
import {
  handleProjectsList,
  handleProjectTemplatesList,
  handleProjectCreate,
  handleProjectDetail,
  handleProjectPageUpdate,
  handleProjectPageCreate,
  handleProjectPageDelete,
  handleProjectPublish,
  handleProjectUnpublish,
  handleSitesContentPublic,
} from "./lib/sitesBuilderHandler";
import {
  handleProjectLanguagesList,
  handleProjectLanguageCreate,
  handleProjectLanguageDelete,
  handleTranslationsList,
  handleTranslate,
  handleTranslationUpdate,
} from "./lib/translatorHandler";
import { handleProjectPageAiGenerate } from "./lib/sitesAiHandler";
import {
  handleProductsList,
  handleProductCreate,
  handleProductUpdate,
  handleProductDelete,
  handleOrdersList,
  handleCouponsList,
  handleCouponCreate,
  handleCouponDelete,
  handleCouponValidate,
  handleCategoriesList,
  handleCategoryCreate,
  handleCategoryUpdate,
  handleCategoryDelete,
  handleProductCategoriesList,
  handleProductCategoriesSet,
} from "./lib/commerceCatalog";
import { handleCommerceCheckout } from "./lib/commerceCheckout";
import {
  handleTeamTasksList,
  handleTeamTaskCreate,
  handleTeamTaskStatusUpdate,
  handleTeamCommentsList,
  handleTeamCommentCreate,
  handleActivityFeedList,
} from "./lib/teamWorkspaceHandler";
import {
  handleMailAuth,
  handleMailCallback,
  handleMailAccountsList,
  handleMailThreadsList,
  handleMailMessagesList,
  handleMailSyncRequest,
  handleMailSend,
  handleMailContactsList,
  runMailSyncAll,
} from "./lib/mailHandler";
import { handleLSWebhook } from "./lib/lemonSqueezyWebhook";
import {
  handleGa4Authorize,
  handleGa4Callback,
  handleGa4PropertiesList,
  handleGa4Connect,
  handleGa4Disconnect,
  handleAnalyticsSummary,
  runGa4Sync,
} from "./lib/ga4Handler";
import { runPredictiveDetectors, handlePredictionsList, handlePredictionDismiss } from "./lib/predictiveEngine";
import {
  handleBoardsList,
  handleBoardCreate,
  handleBoardDetail,
  handleNodeCreate,
  handleNodeUpdate,
  handleNodeDelete,
  handleBoardHistory,
} from "./lib/creatorHandler";
import {
  handleBrandKitGet,
  handleBrandKitUpsert,
  handleComponentsList,
  handleComponentCreate,
  handleComponentUpdate,
  handleComponentDelete,
  handleComponentRewrite,
} from "./lib/creatorComponentsHandler";
import { handleGraphData } from "./lib/knowledgeGraph";
import {
  handleDocsList,
  handleDocCreate,
  handleDocDetail,
  handleDocUpdate,
  handleDocDelete,
  handleAiWriter,
  handleTemplatesList,
  handleSaveAsTemplate,
} from "./lib/officeHandler";
import {
  handleSheetsList,
  handleSheetCreate,
  handleSheetDetail,
  handleSheetUpdate,
  handleSheetDelete,
  handleSheetAiGenerate,
} from "./lib/officeSheetsHandler";
import {
  handleSlidesDecksList,
  handleSlidesDeckCreate,
  handleSlidesDeckDetail,
  handleSlidesDeckUpdate,
  handleSlidesDeckDelete,
  handleSlidesAiGenerate,
} from "./lib/officeSlidesHandler";
import { handleVersionsList, handleVersionRestore } from "./lib/officeVersions";
import {
  handleGscAuth,
  handleGscCallback,
  handleGscStatus,
  handleGscDisconnect,
  handleGscSyncRequest,
  handleGscMetrics,
  runGscSync,
} from "./lib/gscHandler";
import {
  handleRankQueriesList,
  handleRankQueryCreate,
  handleRankQueryDelete,
  handleRankQueryHistory,
} from "./lib/rankHandler";
import {
  handleCrmContactsList,
  handleCrmContactCreate,
  handleCrmContactDetail,
  handleCrmDealsList,
  handleCrmDealCreate,
  handleCrmDealStageUpdate,
  handleCrmNoteCreate,
  handleCrmNotesList,
  handleCrmReminderCreate,
  runCrmReminders,
} from "./lib/crmHandler";
import {
  handleSocialConnectionsList,
  handleSocialConnectionCreate,
  handleSocialConnectionDelete,
  handleSocialPostsList,
  handleSocialPostCreate,
  handleSocialPostDelete,
  handleSocialGenerate,
  runSocialPublishWithEnv,
} from "./lib/socialHandler";
import {
  handleAcademyCoursesList,
  handleAcademyCourseDetail,
  handleAcademyProgress,
  handleAcademyMentor,
} from "./lib/academyHandler";
import { handleTourSeenList, handleTourMarkSeen } from "./lib/tourHandler";
import {
  handleCroTrack,
  handleCroTrackOptions,
  handleCroSnippetGet,
  handleCroSnippetToggle,
  handleCroStats,
  runCroAggregate,
} from "./lib/croHandler";
import { handleBenchmarkGet } from "./lib/benchmarkHandler";
import { handleBrowserProxy, handleBrowserAnalyze, handleBrowserHistory, handleBrowserInspect, handleCollectionsList, handleCollectionCreate, handleCollectionDelete, handleCollectionSaveItem, handleCaptureToOffice, handleBrowserTranslate, handleBrowserSummarize, handleBrowserCompare, handleBrowserReadingMode, handleVisualSearch, handleProxyTokenIssue, handleWebsiteTimeline, handleCollectionItemsList, handleCollectionItemAdd, handleCollectionItemDelete, handleDeepSearch, handleAiMemoryQuery } from "./lib/browserHandler";
import { runBenchmarkAggregation } from "./lib/benchmarkAggregator";
import {
  handleAiGenerate,
  handleAiHistory,
  handleAiCredits,
} from "./lib/contentGeneration";
import { runSeoChecks, runSeoCheckForSite } from "./lib/seoChecker";
import { runCompetitorChecks } from "./lib/competitorChecker";
import { runUrlSpeedChecks } from "./lib/urlSpeedChecker";
import { runFormChecks } from "./lib/formChecker";
import { runBrokenLinksChecks } from "./lib/brokenLinksChecker";
import { requireAdmin } from "./lib/adminAuth";
import { handleBusinessMetrics } from "./lib/businessMetrics";
import { checkRateLimit, getClientIp } from "./lib/rateLimit";
import { corsHeaders } from "./lib/cors";
import { sendSlackMessage } from "./lib/slack";
import { handleDeveloperAuditV1, handleDeveloperSchemaV1, handleDeveloperReportV1 } from "./lib/developerApiHandler";
import { handleDeveloperApiKeys, handleDeveloperApiKeyRevoke } from "./lib/developerApiKeysHandler";

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

// Базові заголовки для прямих fetch-запитів до Supabase REST API з
// service role key. Раніше `{ apikey: env.SUPABASE_SERVICE_ROLE_KEY,
// Authorization: \`Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}\` }` було
// продубльовано 11 разів у цьому файлі — виклики просто спредять
// додаткові поля (Prefer, Accept, Content-Type) поверх базових.
// Делегує до lib/supabase.ts, щоб інші файли (teamHandler, etc.)
// використовували ту саму реалізацію без залежності від index.ts.
function supabaseHeaders(env: Env): Record<string, string> {
  return serviceRoleHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      // /api/cro/track — публічний ендпоінт, приймає запити з ДОВІЛЬНОГО
      // домену (клієнтський сніпет на сайті клієнта, не на qorax.app).
      // Стандартний corsHeaders(origin) нижче — allowlist лише
      // qorax-доменів, відхилить legit preflight із сайту клієнта.
      if (url.pathname === "/api/cro/track") {
        return handleCroTrackOptions();
      }
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

    // ─── Qorax SEO Platform (Developer API), MVP — фундамент ───
    // Публічний ендпоінт для зовнішніх розробників/агентств, окрема
    // авторизація через API-ключ (Authorization: Bearer qrx_xxx),
    // не через Supabase-сесію. /api/developer/keys — управління
    // ключами з Dashboard (звичайна Supabase-сесія користувача).
    if (url.pathname === "/api/v1/audit" && request.method === "POST") {
      return handleDeveloperAuditV1(request, env);
    }
    if (url.pathname === "/api/v1/audit" && request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }
    // Schema API — друга частина Developer API (перша: /api/v1/audit
    // вище). Той самий API-ключ і requests_limit пул, чиста
    // шаблонізація без Gemini-виклику (schemaGenerator.ts).
    if (url.pathname === "/api/v1/schema" && request.method === "POST") {
      return handleDeveloperSchemaV1(request, env);
    }
    if (url.pathname === "/api/v1/schema" && request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }
    // Reporting API — третя частина Developer API (AI SEO API
    // свідомо не робимо — достатнє AI-навантаження вже є на
    // платформі). Той самий API-ключ і requests_limit пул, той
    // самий аудит-рушій, що /api/v1/audit (без AI, без Gemini).
    if (url.pathname === "/api/v1/report" && request.method === "POST") {
      return handleDeveloperReportV1(request, env);
    }
    if (url.pathname === "/api/v1/report" && request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      });
    }
    if (url.pathname === "/api/developer/keys" && (request.method === "GET" || request.method === "POST")) {
      return handleDeveloperApiKeys(request, env, origin);
    }
    if (url.pathname.startsWith("/api/developer/keys/") && request.method === "DELETE") {
      const keyId = url.pathname.split("/api/developer/keys/")[1];
      return handleDeveloperApiKeyRevoke(keyId, request, env, origin);
    }

    // /api/cro/track — публічний, без авторизації, довільний Origin
    // (клієнтський сніпет на сайті клієнта). CORS обробляється всередині
    // croHandler.ts (Access-Control-Allow-Origin: *), не через
    // стандартний corsHeaders(origin) allowlist.
    if (url.pathname === "/api/cro/track" && request.method === "POST") {
      return handleCroTrack(request, env);
    }

    if (url.pathname === "/api/report" && request.method === "GET") {
      return handleReportRequest(request, env, origin);
    }

    if (url.pathname === "/api/fix-request" && request.method === "POST") {
      return handleFixRequest(request, env, origin);
    }

    // ── Referrals ────────────────────────────────────────────────
    if (url.pathname === "/api/referrals" && request.method === "GET") {
      return handleGetReferralStats(request, env, origin);
    }
    if (url.pathname === "/api/admin/referral-commissions" && request.method === "GET") {
      return handleAdminListCommissions(request, env, origin);
    }
    if (url.pathname.startsWith("/api/admin/referral-commissions/") && request.method === "PATCH") {
      const commissionId = url.pathname.split("/api/admin/referral-commissions/")[1];
      return handleAdminUpdateCommission(request, env, origin, commissionId);
    }

    // ── Team / invites ──────────────────────────────────────────
    if (url.pathname === "/api/team" && request.method === "GET") {
      return handleGetTeam(request, env, origin);
    }
    if (url.pathname === "/api/team/invite" && request.method === "POST") {
      return handlePostInvite(request, env, origin);
    }
    if (url.pathname.startsWith("/api/team/invite/") && request.method === "DELETE") {
      const inviteId = url.pathname.split("/api/team/invite/")[1];
      return handleRevokeInvite(request, env, origin, inviteId);
    }
    if (url.pathname === "/api/team/accept" && request.method === "POST") {
      return handleAcceptInvite(request, env, origin);
    }
    if (url.pathname.startsWith("/api/team/member/") && request.method === "PATCH") {
      const memberId = url.pathname.split("/api/team/member/")[1];
      return handleUpdateMemberRole(request, env, origin, memberId);
    }
    if (url.pathname.startsWith("/api/team/member/") && request.method === "DELETE") {
      const memberId = url.pathname.split("/api/team/member/")[1];
      return handleRemoveMember(request, env, origin, memberId);
    }
    if (url.pathname.startsWith("/api/invite/") && request.method === "GET") {
      const token = url.pathname.split("/api/invite/")[1];
      // Публічний ендпоінт без авторизації (юзер відкриває посилання з
      // листа до логіну) — той самий клас ризику що й /api/status/:slug,
      // тому такий самий щедрий, але ненульовий ліміт.
      const clientIp = getClientIp(request);
      const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `invite:${clientIp}`, 20, 60);
      if (!rateLimit.allowed) {
        return json({ error: "Забагато запитів. Спробуйте пізніше." }, 429, origin);
      }
      return handleGetInvitePreview(env, origin, token);
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

    // POST /api/notifications/test-slack — тестове повідомлення для перевірки Slack webhook
    if (url.pathname === "/api/notifications/test-slack" && request.method === "POST") {
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      const body = await request.json().catch(() => null) as { webhook_url?: string } | null;
      const webhookUrl = body?.webhook_url?.trim();
      if (!webhookUrl || !webhookUrl.startsWith("https://hooks.slack.com/")) {
        return json({ error: "Невалідний Slack webhook URL" }, 400, origin);
      }

      const result = await sendSlackMessage(
        webhookUrl,
        ":wave: Тестове повідомлення від *Qorax*. Якщо ви бачите це в Slack — webhook налаштовано правильно!"
      );

      if (!result.ok) return json({ error: result.error ?? "Не вдалося надіслати повідомлення" }, 502, origin);
      return json({ ok: true }, 200, origin);
    }

    // Внутренний эндпоинт для ручного запуска speed-check (защищён токеном)
    // ── Admin endpoints (захищені ADMIN_TOKEN) ──────────────────
    // Примітка: /api/admin/stats визначено нижче (з ефективними Range-запитами),
    // тут раніше був дубльований менш ефективний обробник — видалено.

    // GET /api/admin/clients — список клієнтів (захищено JWT + platform_role=admin)
    if (url.pathname === "/api/admin/clients" && request.method === "GET") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const [plansRes, orgsRes] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/plans?select=id,code,name&order=price_usd`,
          { headers: supabaseHeaders(env) }),
        fetch(`${env.SUPABASE_URL}/rest/v1/organizations?select=id,name,created_at,organization_members(user_id,role),subscriptions(id,status,trial_ends_at,plan_id,created_at)&order=created_at.desc&limit=100`,
          { headers: supabaseHeaders(env) }),
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
            headers: supabaseHeaders(env),
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

    // GET /api/admin/fix-requests — список заявок на виправлення (захищено JWT + platform_role=admin)
    if (url.pathname === "/api/admin/fix-requests" && request.method === "GET") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/fix_requests?select=*,sites(display_name,url),organizations(name)&order=created_at.desc&limit=200`,
        { headers: supabaseHeaders(env) }
      );
      if (!res.ok) return json({ error: "Не вдалося завантажити заявки" }, 500, origin);
      const requests = await res.json();
      return json({ requests }, 200, origin);
    }

    // PATCH /api/admin/fix-requests/:id — оновлення статусу заявки (захищено JWT + platform_role=admin)
    if (url.pathname.startsWith("/api/admin/fix-requests/") && request.method === "PATCH") {
      const auth = await requireAdmin(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!auth.ok) return json({ error: auth.status === 401 ? "Unauthorized" : "Forbidden" }, auth.status!, origin);

      const requestId = url.pathname.split("/api/admin/fix-requests/")[1];
      if (!requestId) return json({ error: "ID заявки обов'язковий" }, 400, origin);

      let patchBody: { status?: string; admin_notes?: string };
      try {
        patchBody = await request.json();
      } catch {
        return json({ error: "Невірний формат запиту" }, 400, origin);
      }

      const allowedStatuses = ["new", "in_progress", "done", "declined"];
      const update: Record<string, unknown> = {};
      if (patchBody.status !== undefined) {
        if (!allowedStatuses.includes(patchBody.status)) {
          return json({ error: "Невірний статус" }, 400, origin);
        }
        update.status = patchBody.status;
      }
      if (patchBody.admin_notes !== undefined) {
        update.admin_notes = patchBody.admin_notes;
      }
      if (Object.keys(update).length === 0) {
        return json({ error: "Немає що оновлювати" }, 400, origin);
      }

      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/fix_requests?id=eq.${encodeURIComponent(requestId)}`,
        {
          method: "PATCH",
          headers: { ...supabaseHeaders(env), Prefer: "return=minimal" },
          body: JSON.stringify(update),
        }
      );
      if (!res.ok) return json({ error: "Не вдалося оновити заявку" }, 500, origin);
      return json({ ok: true }, 200, origin);
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

      // Було написано (runSocialPublishWithEnv, socialHandler.ts), але
      // не підключено в роутинг — EXECUTION_PLAN.md Фаза 2.4 "НЕ
      // зроблено", закрито цим проходом.
      if (url.pathname === "/api/admin/run-social-publish") {
        ctx.waitUntil(
          runSocialPublishWithEnv(env)
            .then(s => console.log("Manual social publish:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Social publish started" }, 200, origin);
      }

      // EXECUTION_PLAN.md Фаза 2.1 "НЕ зроблено": нагадування CRM
      // створювались, ніхто їх не надсилав — закрито цим проходом.
      if (url.pathname === "/api/admin/run-crm-reminders") {
        ctx.waitUntil(
          runCrmReminders(env)
            .then(s => console.log("Manual CRM reminders:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "CRM reminders started" }, 200, origin);
      }

      // Qorax Mail — синхронізація всіх активних mail_accounts.
      if (url.pathname === "/api/admin/run-mail-sync") {
        ctx.waitUntil(
          runMailSyncAll(env)
            .then(s => console.log("Manual mail sync:", JSON.stringify(s)))
        );
        return json({ ok: true, message: "Mail sync started" }, 200, origin);
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
          Promise.all([
            runUrlSpeedChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).catch(e =>
              console.error("urlSpeedChecks cron error:", e)
            ),
            runFormChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).catch(e =>
              console.error("formChecks cron error:", e)
            ),
            runSeoChecks(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
              .then(s => console.log("Manual SEO:", JSON.stringify(s)))
          ])
        );
        return json({ ok: true, message: "SEO checks started" }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-weekly-digest") {
        const r = await sendWeeklyDigests(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, env.RESEND_API_KEY, env.APP_URL);
        return json({ ok: true, sent: r.sent, skipped: r.skipped, errors: r.errors }, 200, origin);
      }

      if (url.pathname === "/api/admin/run-telegram-digest") {
        const r = await sendTelegramWeeklyDigests(env);
        return json({ ok: true, sent: r.sent, skipped: r.skipped }, 200, origin);
      }

      if (url.pathname === "/api/admin/setup-telegram-bot") {
        // Одноразовий (не на кожен деплой) виклик setMyCommands —
        // реєструє офіційне меню "☰" в Telegram. Telegram кешує це
        // per-bot на своїй стороні, тому не потрібно викликати
        // автоматично з cron чи при кожному деплої.
        const r = await setTelegramBotCommands(env.TELEGRAM_BOT_TOKEN);
        return json(r, r.ok ? 200 : 500, origin);
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

    // ── Mail routes (Qorax Mail — окремий продукт екосистеми,
    // MODULE_ROADMAP.md). OAuth-flow — той самий патерн, що GSC. ──
    if (url.pathname === "/api/mail/auth" && request.method === "GET") {
      return handleMailAuth(request, env);
    }
    if (url.pathname === "/api/mail/callback" && request.method === "GET") {
      return handleMailCallback(request, env);
    }
    if (url.pathname === "/api/mail/accounts" && request.method === "GET") {
      return handleMailAccountsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/mail/contacts" && request.method === "GET") {
      return handleMailContactsList(request, env, corsHeaders(origin));
    }
    const mailSyncMatch = url.pathname.match(/^\/api\/mail\/accounts\/([^/]+)\/sync$/);
    if (mailSyncMatch && request.method === "POST") {
      return handleMailSyncRequest(request, env, corsHeaders(origin), mailSyncMatch[1]);
    }
    if (url.pathname === "/api/mail/threads" && request.method === "GET") {
      return handleMailThreadsList(request, env, corsHeaders(origin));
    }
    const mailMessagesMatch = url.pathname.match(/^\/api\/mail\/threads\/([^/]+)\/messages$/);
    if (mailMessagesMatch && request.method === "GET") {
      return handleMailMessagesList(request, env, corsHeaders(origin), mailMessagesMatch[1]);
    }
    if (url.pathname === "/api/mail/send" && request.method === "POST") {
      return handleMailSend(request, env, corsHeaders(origin));
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

    // ── Rank routes (MODULE_ROADMAP.md, розділ 1) ─────────────────────
    const rankQueriesMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/rank\/queries$/);
    if (rankQueriesMatch && request.method === "GET") {
      return handleRankQueriesList(request, env, corsHeaders(origin), rankQueriesMatch[1]);
    }
    if (rankQueriesMatch && request.method === "POST") {
      return handleRankQueryCreate(request, env, corsHeaders(origin), rankQueriesMatch[1]);
    }
    const rankQueryDeleteMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/rank\/queries\/([^/]+)$/);
    if (rankQueryDeleteMatch && request.method === "DELETE") {
      return handleRankQueryDelete(request, env, corsHeaders(origin), rankQueryDeleteMatch[1], rankQueryDeleteMatch[2]);
    }
    const rankHistoryMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/rank\/history$/);
    if (rankHistoryMatch && request.method === "GET") {
      return handleRankQueryHistory(request, env, corsHeaders(origin), rankHistoryMatch[1]);
    }

    // ── Analytics routes (MODULE_ROADMAP.md, розділ 3; GA4-only MVP) ──
    const ga4AuthorizeMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/ga4\/authorize$/);
    if (ga4AuthorizeMatch && request.method === "GET") {
      return handleGa4Authorize(request, env, ga4AuthorizeMatch[1]);
    }
    if (url.pathname === "/api/ga4/callback" && request.method === "GET") {
      return handleGa4Callback(request, env);
    }
    if (url.pathname === "/api/ga4/properties" && request.method === "GET") {
      return handleGa4PropertiesList(request);
    }
    const ga4ConnectMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/ga4\/connect$/);
    if (ga4ConnectMatch && request.method === "POST") {
      return handleGa4Connect(request, env, corsHeaders(origin), ga4ConnectMatch[1]);
    }
    const ga4DisconnectMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/ga4\/disconnect$/);
    if (ga4DisconnectMatch && request.method === "POST") {
      return handleGa4Disconnect(request, env, corsHeaders(origin), ga4DisconnectMatch[1]);
    }
    const analyticsSummaryMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/analytics$/);
    if (analyticsSummaryMatch && request.method === "GET") {
      return handleAnalyticsSummary(request, env, corsHeaders(origin), analyticsSummaryMatch[1]);
    }

    // ── Predictive AI: Risk/Opportunity (MODULE_ROADMAP.md розділ 16) ──
    const predictionsListMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/predictions$/);
    if (predictionsListMatch && request.method === "GET") {
      return handlePredictionsList(request, env, corsHeaders(origin), predictionsListMatch[1]);
    }
    const predictionDismissMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/predictions\/([^/]+)\/dismiss$/);
    if (predictionDismissMatch && request.method === "POST") {
      return handlePredictionDismiss(request, env, corsHeaders(origin), predictionDismissMatch[1], predictionDismissMatch[2]);
    }

    // ── Qorax Creator: Website Mode MVP (MODULE_ROADMAP.md "Qorax Creator") ──
    const boardsListMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/canvas-boards$/);
    if (boardsListMatch && request.method === "GET") {
      return handleBoardsList(request, env, corsHeaders(origin), boardsListMatch[1]);
    }
    if (boardsListMatch && request.method === "POST") {
      return handleBoardCreate(request, env, corsHeaders(origin), boardsListMatch[1]);
    }
    const boardDetailMatch = url.pathname.match(/^\/api\/canvas-boards\/([^/]+)$/);
    if (boardDetailMatch && request.method === "GET") {
      return handleBoardDetail(request, env, corsHeaders(origin), boardDetailMatch[1]);
    }
    const nodesListMatch = url.pathname.match(/^\/api\/canvas-boards\/([^/]+)\/nodes$/);
    if (nodesListMatch && request.method === "POST") {
      return handleNodeCreate(request, env, corsHeaders(origin), nodesListMatch[1]);
    }
    const nodeItemMatch = url.pathname.match(/^\/api\/canvas-boards\/([^/]+)\/nodes\/([^/]+)$/);
    if (nodeItemMatch && request.method === "PATCH") {
      return handleNodeUpdate(request, env, corsHeaders(origin), nodeItemMatch[1], nodeItemMatch[2]);
    }
    if (nodeItemMatch && request.method === "DELETE") {
      return handleNodeDelete(request, env, corsHeaders(origin), nodeItemMatch[1], nodeItemMatch[2]);
    }
    const boardHistoryMatch = url.pathname.match(/^\/api\/canvas-boards\/([^/]+)\/history$/);
    if (boardHistoryMatch && request.method === "GET") {
      return handleBoardHistory(request, env, corsHeaders(origin), boardHistoryMatch[1]);
    }

    // ── Qorax Office: Docs MVP (MODULE_ROADMAP.md "Qorax Office") ──
    const docsListMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/office-documents$/);
    if (docsListMatch && request.method === "GET") {
      return handleDocsList(request, env, corsHeaders(origin), docsListMatch[1]);
    }
    if (docsListMatch && request.method === "POST") {
      return handleDocCreate(request, env, corsHeaders(origin), docsListMatch[1]);
    }
    const templatesListMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/office-templates$/);
    if (templatesListMatch && request.method === "GET") {
      return handleTemplatesList(request, env, corsHeaders(origin), templatesListMatch[1]);
    }
    const docDetailMatch = url.pathname.match(/^\/api\/office-documents\/([^/]+)$/);
    if (docDetailMatch && request.method === "GET") {
      return handleDocDetail(request, env, corsHeaders(origin), docDetailMatch[1]);
    }
    if (docDetailMatch && request.method === "PATCH") {
      return handleDocUpdate(request, env, corsHeaders(origin), docDetailMatch[1]);
    }
    if (docDetailMatch && request.method === "DELETE") {
      return handleDocDelete(request, env, corsHeaders(origin), docDetailMatch[1]);
    }
    const docAiWriterMatch = url.pathname.match(/^\/api\/office-documents\/([^/]+)\/ai-writer$/);
    if (docAiWriterMatch && request.method === "POST") {
      return handleAiWriter(request, env, corsHeaders(origin), docAiWriterMatch[1]);
    }
    const saveAsTemplateMatch = url.pathname.match(/^\/api\/office-documents\/([^/]+)\/save-as-template$/);
    if (saveAsTemplateMatch && request.method === "POST") {
      return handleSaveAsTemplate(request, env, corsHeaders(origin), saveAsTemplateMatch[1]);
    }

    // ── Qorax Office: Sheets MVP (MODULE_ROADMAP.md "Qorax Office") ──
    const sheetsListMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/office-sheets$/);
    if (sheetsListMatch && request.method === "GET") {
      return handleSheetsList(request, env, corsHeaders(origin), sheetsListMatch[1]);
    }
    if (sheetsListMatch && request.method === "POST") {
      return handleSheetCreate(request, env, corsHeaders(origin), sheetsListMatch[1]);
    }
    const sheetDetailMatch = url.pathname.match(/^\/api\/office-sheets\/([^/]+)$/);
    if (sheetDetailMatch && request.method === "GET") {
      return handleSheetDetail(request, env, corsHeaders(origin), sheetDetailMatch[1]);
    }
    if (sheetDetailMatch && request.method === "PATCH") {
      return handleSheetUpdate(request, env, corsHeaders(origin), sheetDetailMatch[1]);
    }
    if (sheetDetailMatch && request.method === "DELETE") {
      return handleSheetDelete(request, env, corsHeaders(origin), sheetDetailMatch[1]);
    }
    const sheetAiMatch = url.pathname.match(/^\/api\/office-sheets\/([^/]+)\/ai-generate$/);
    if (sheetAiMatch && request.method === "POST") {
      return handleSheetAiGenerate(request, env, corsHeaders(origin), sheetAiMatch[1]);
    }

    // ── Qorax Office: Slides MVP (MODULE_ROADMAP.md "Qorax Office") ──
    const slidesDecksListMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/office-slides$/);
    if (slidesDecksListMatch && request.method === "GET") {
      return handleSlidesDecksList(request, env, corsHeaders(origin), slidesDecksListMatch[1]);
    }
    if (slidesDecksListMatch && request.method === "POST") {
      return handleSlidesDeckCreate(request, env, corsHeaders(origin), slidesDecksListMatch[1]);
    }
    const slidesDeckDetailMatch = url.pathname.match(/^\/api\/office-slides\/([^/]+)$/);
    if (slidesDeckDetailMatch && request.method === "GET") {
      return handleSlidesDeckDetail(request, env, corsHeaders(origin), slidesDeckDetailMatch[1]);
    }
    if (slidesDeckDetailMatch && request.method === "PATCH") {
      return handleSlidesDeckUpdate(request, env, corsHeaders(origin), slidesDeckDetailMatch[1]);
    }
    if (slidesDeckDetailMatch && request.method === "DELETE") {
      return handleSlidesDeckDelete(request, env, corsHeaders(origin), slidesDeckDetailMatch[1]);
    }
    const slidesAiMatch = url.pathname.match(/^\/api\/office-slides\/([^/]+)\/ai-generate$/);
    if (slidesAiMatch && request.method === "POST") {
      return handleSlidesAiGenerate(request, env, corsHeaders(origin), slidesAiMatch[1]);
    }

    // ── Qorax Office: Version History (MODULE_ROADMAP.md "Qorax Office") ──
    if (url.pathname === "/api/office-versions" && request.method === "GET") {
      return handleVersionsList(request, env, corsHeaders(origin));
    }
    const versionRestoreMatch = url.pathname.match(/^\/api\/office-versions\/([^/]+)\/restore$/);
    if (versionRestoreMatch && request.method === "POST") {
      return handleVersionRestore(request, env, corsHeaders(origin), versionRestoreMatch[1]);
    }

    // ── Qorax Creator: KG Visualization / Diagram Mode (MODULE_ROADMAP.md "Qorax Creator") ──
    const knowledgeGraphMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/knowledge-graph$/);
    if (knowledgeGraphMatch && request.method === "GET") {
      return handleGraphData(request, env, corsHeaders(origin), knowledgeGraphMatch[1]);
    }

    // ── Qorax Creator: Components / Brand Kit (MODULE_ROADMAP.md "Qorax Creator") ──
    const brandKitMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/brand-kit$/);
    if (brandKitMatch && request.method === "GET") {
      return handleBrandKitGet(request, env, corsHeaders(origin), brandKitMatch[1]);
    }
    if (brandKitMatch && request.method === "PUT") {
      return handleBrandKitUpsert(request, env, corsHeaders(origin), brandKitMatch[1]);
    }
    const componentsListMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/components$/);
    if (componentsListMatch && request.method === "GET") {
      return handleComponentsList(request, env, corsHeaders(origin), componentsListMatch[1]);
    }
    if (componentsListMatch && request.method === "POST") {
      return handleComponentCreate(request, env, corsHeaders(origin), componentsListMatch[1]);
    }
    const componentItemMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/components\/([^/]+)$/);
    if (componentItemMatch && request.method === "PATCH") {
      return handleComponentUpdate(request, env, corsHeaders(origin), componentItemMatch[1], componentItemMatch[2]);
    }
    if (componentItemMatch && request.method === "DELETE") {
      return handleComponentDelete(request, env, corsHeaders(origin), componentItemMatch[1], componentItemMatch[2]);
    }
    const componentRewriteMatch = url.pathname.match(/^\/api\/organizations\/([^/]+)\/components\/([^/]+)\/rewrite$/);
    if (componentRewriteMatch && request.method === "POST") {
      return handleComponentRewrite(request, env, corsHeaders(origin), componentRewriteMatch[1], componentRewriteMatch[2]);
    }

    // ── CRO routes (MODULE_ROADMAP.md, розділ 9; EXECUTION_PLAN.md Фаза 2.6) ──
    const croSnippetMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/cro\/snippet$/);
    if (croSnippetMatch && request.method === "GET") {
      return handleCroSnippetGet(request, env, corsHeaders(origin), croSnippetMatch[1]);
    }
    if (croSnippetMatch && request.method === "PATCH") {
      return handleCroSnippetToggle(request, env, corsHeaders(origin), croSnippetMatch[1]);
    }
    const croStatsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/cro\/stats$/);
    if (croStatsMatch && request.method === "GET") {
      return handleCroStats(request, env, corsHeaders(origin), croStatsMatch[1]);
    }

    // ── Benchmarking routes (MODULE_ROADMAP.md, розділ 15) ──
    const benchmarkMatch = url.pathname.match(/^\/api\/benchmarks\/([^/]+)$/);
    if (benchmarkMatch && request.method === "GET") {
      return handleBenchmarkGet(request, env, corsHeaders(origin), benchmarkMatch[1]);
    }

    // ── Qorax Browser routes (MODULE_ROADMAP.md, "Qorax Browser") ──
    if (url.pathname === "/api/browser/proxy-token" && request.method === "POST") {
      return handleProxyTokenIssue(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/proxy" && request.method === "GET") {
      return handleBrowserProxy(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/analyze" && request.method === "POST") {
      return handleBrowserAnalyze(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/history" && request.method === "GET") {
      return handleBrowserHistory(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/inspect" && request.method === "GET") {
      return handleBrowserInspect(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/collections" && request.method === "GET") {
      return handleCollectionsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/collections" && request.method === "POST") {
      return handleCollectionCreate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/collections/save" && request.method === "POST") {
      return handleCollectionSaveItem(request, env, corsHeaders(origin));
    }
    const collectionDeleteMatch = url.pathname.match(/^\/api\/browser\/collections\/([^/]+)$/);
    if (collectionDeleteMatch && request.method === "DELETE") {
      return handleCollectionDelete(request, env, corsHeaders(origin), collectionDeleteMatch[1]);
    }
    const collectionItemsMatch = url.pathname.match(/^\/api\/browser\/collections\/([^/]+)\/items$/);
    if (collectionItemsMatch && request.method === "GET") {
      return handleCollectionItemsList(request, env, corsHeaders(origin), collectionItemsMatch[1]);
    }
    if (collectionItemsMatch && request.method === "POST") {
      return handleCollectionItemAdd(request, env, corsHeaders(origin), collectionItemsMatch[1]);
    }
    const collectionItemDeleteMatch = url.pathname.match(/^\/api\/browser\/collection-items\/([^/]+)$/);
    if (collectionItemDeleteMatch && request.method === "DELETE") {
      return handleCollectionItemDelete(request, env, corsHeaders(origin), collectionItemDeleteMatch[1]);
    }
    if (url.pathname === "/api/browser/capture/office" && request.method === "POST") {
      return handleCaptureToOffice(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/translate" && request.method === "POST") {
      return handleBrowserTranslate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/summarize" && request.method === "POST") {
      return handleBrowserSummarize(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/compare" && request.method === "POST") {
      return handleBrowserCompare(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/reading-mode" && request.method === "POST") {
      return handleBrowserReadingMode(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/visual-search" && request.method === "POST") {
      return handleVisualSearch(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/timeline" && request.method === "POST") {
      return handleWebsiteTimeline(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/deep-search" && request.method === "POST") {
      return handleDeepSearch(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/browser/ai-memory" && request.method === "POST") {
      return handleAiMemoryQuery(request, env, corsHeaders(origin));
    }

    // ── CRM routes (MODULE_ROADMAP.md, розділ 7; EXECUTION_PLAN.md Фаза 2.3) ──
    if (url.pathname === "/api/crm/contacts" && request.method === "GET") {
      return handleCrmContactsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/crm/contacts" && request.method === "POST") {
      return handleCrmContactCreate(request, env, corsHeaders(origin));
    }
    const crmContactDetailMatch = url.pathname.match(/^\/api\/crm\/contacts\/([^/]+)$/);
    if (crmContactDetailMatch && request.method === "GET") {
      return handleCrmContactDetail(request, env, corsHeaders(origin), crmContactDetailMatch[1]);
    }
    if (url.pathname === "/api/crm/deals" && request.method === "GET") {
      return handleCrmDealsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/crm/deals" && request.method === "POST") {
      return handleCrmDealCreate(request, env, corsHeaders(origin));
    }
    const crmDealStageMatch = url.pathname.match(/^\/api\/crm\/deals\/([^/]+)\/stage$/);
    if (crmDealStageMatch && request.method === "PATCH") {
      return handleCrmDealStageUpdate(request, env, corsHeaders(origin), crmDealStageMatch[1]);
    }
    if (url.pathname === "/api/crm/notes" && request.method === "GET") {
      return handleCrmNotesList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/crm/notes" && request.method === "POST") {
      return handleCrmNoteCreate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/crm/reminders" && request.method === "POST") {
      return handleCrmReminderCreate(request, env, corsHeaders(origin));
    }

    // ── Social routes (MODULE_ROADMAP.md, розділ 8; EXECUTION_PLAN.md Фаза 2.4) ──
    if (url.pathname === "/api/social/connections" && request.method === "GET") {
      return handleSocialConnectionsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/social/connections" && request.method === "POST") {
      return handleSocialConnectionCreate(request, env, corsHeaders(origin));
    }
    const socialConnDeleteMatch = url.pathname.match(/^\/api\/social\/connections\/([^/]+)$/);
    if (socialConnDeleteMatch && request.method === "DELETE") {
      return handleSocialConnectionDelete(request, env, corsHeaders(origin), socialConnDeleteMatch[1]);
    }
    if (url.pathname === "/api/social/posts" && request.method === "GET") {
      return handleSocialPostsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/social/posts" && request.method === "POST") {
      return handleSocialPostCreate(request, env, corsHeaders(origin));
    }
    const socialPostDeleteMatch = url.pathname.match(/^\/api\/social\/posts\/([^/]+)$/);
    if (socialPostDeleteMatch && request.method === "DELETE") {
      return handleSocialPostDelete(request, env, corsHeaders(origin), socialPostDeleteMatch[1]);
    }
    if (url.pathname === "/api/social/generate" && request.method === "POST") {
      return handleSocialGenerate(request, env, corsHeaders(origin));
    }

    // ── Academy routes (MODULE_ROADMAP.md, розділ 10; EXECUTION_PLAN.md Фаза 2.5) ──
    if (url.pathname === "/api/academy/courses" && request.method === "GET") {
      return handleAcademyCoursesList(request, env, corsHeaders(origin));
    }
    const academyCourseDetailMatch = url.pathname.match(/^\/api\/academy\/courses\/([^/]+)$/);
    if (academyCourseDetailMatch && request.method === "GET") {
      return handleAcademyCourseDetail(request, env, corsHeaders(origin), academyCourseDetailMatch[1]);
    }
    if (url.pathname === "/api/academy/progress" && request.method === "POST") {
      return handleAcademyProgress(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/academy/mentor" && request.method === "POST") {
      return handleAcademyMentor(request, env, corsHeaders(origin));
    }

    // ── Product Tours routes (інтерактивний тур по продуктах) ────────
    if (url.pathname === "/api/tours/seen" && request.method === "GET") {
      return handleTourSeenList(request, env, origin);
    }
    if (url.pathname === "/api/tours/seen" && request.method === "POST") {
      return handleTourMarkSeen(request, env, origin);
    }

    // ── AI/Content routes (MODULE_ROADMAP.md, розділ 2) ───────────────
    if (url.pathname === "/api/ai/generate" && request.method === "POST") {
      return handleAiGenerate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/ai/history" && request.method === "GET") {
      return handleAiHistory(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/ai/credits" && request.method === "GET") {
      return handleAiCredits(request, env, corsHeaders(origin));
    }

    if (url.pathname === "/api/ai-chat/thread" && request.method === "GET") {
      return handleGetOrCreateThreadRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/ai-chat" && request.method === "POST") {
      return handleChatRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/workspace/upload" && request.method === "POST") {
      return handleWorkspaceUploadRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/workspace/files" && request.method === "GET") {
      return handleWorkspaceListRequest(request, env, origin, corsHeaders(origin));
    }

    const workspaceFileMatch = url.pathname.match(/^\/api\/workspace\/files\/([^/]+)$/);
    if (workspaceFileMatch && request.method === "DELETE") {
      return handleWorkspaceDeleteRequest(request, workspaceFileMatch[1], env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/memory" && request.method === "GET") {
      return handleMemoryGetRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/memory" && request.method === "PUT") {
      return handleMemoryUpdateRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/agents" && request.method === "GET") {
      return handleAgentsListRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/agents/runs" && request.method === "GET") {
      return handleAgentRunsListRequest(request, env, origin, corsHeaders(origin));
    }

    const agentRunMatch = url.pathname.match(/^\/api\/agents\/([^/]+)\/run$/);
    if (agentRunMatch && request.method === "POST") {
      const agentId = agentRunMatch[1];
      if (agentId === "content") return handleRunContentAgentRequest(request, env, origin, corsHeaders(origin));
      if (agentId === "seo") return handleRunSeoAgentRequest(request, env, origin, corsHeaders(origin));
      if (agentId === "rank") return handleRunRankAgentRequest(request, env, origin, corsHeaders(origin));
      return new Response(JSON.stringify({ error: "Невідомий агент" }), { status: 404, headers: { "Content-Type": "application/json", ...corsHeaders(origin) } });
    }

    // ── Automations routes (Qorax AI хаб, шостий UI-крок хвилі 3 —
    // agent_subscriptions = Automations, за задумом MODULE_ROADMAP.md,
    // коментар у 0049_qorax_ai_hub.sql) ─────────────────────────────
    if (url.pathname === "/api/agents/subscriptions" && request.method === "GET") {
      return handleAgentSubscriptionsListRequest(request, env, origin, corsHeaders(origin));
    }
    if (url.pathname === "/api/agents/subscriptions" && request.method === "POST") {
      return handleAgentSubscriptionUpsertRequest(request, env, origin, corsHeaders(origin));
    }
    const agentSubToggleMatch = url.pathname.match(/^\/api\/agents\/subscriptions\/([^/]+)$/);
    if (agentSubToggleMatch && request.method === "PATCH") {
      return handleAgentSubscriptionToggleRequest(request, env, origin, agentSubToggleMatch[1], corsHeaders(origin));
    }

    // ── Tasks routes (Qorax AI хаб, вкладка Tasks — хвиля 3) ──────────
    if (url.pathname === "/api/tasks" && request.method === "GET") {
      return handleTasksListRequest(request, env, origin, corsHeaders(origin));
    }

    if (url.pathname === "/api/tasks" && request.method === "POST") {
      return handleTaskCreateRequest(request, env, origin, corsHeaders(origin));
    }

    const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && request.method === "PATCH") {
      return handleTaskUpdateRequest(request, taskMatch[1], env, origin, corsHeaders(origin));
    }
    if (taskMatch && request.method === "DELETE") {
      return handleTaskDeleteRequest(request, taskMatch[1], env, origin, corsHeaders(origin));
    }

    // ── AI Inbox routes (MODULE_ROADMAP.md, хвиля 4, розділ 12 "AI Operating System") ──
    if (url.pathname === "/api/ai/inbox" && request.method === "GET") {
      return handleInboxListRequest(request, env, origin, corsHeaders(origin));
    }
    const inboxMatch = url.pathname.match(/^\/api\/ai\/inbox\/([^/]+)$/);
    if (inboxMatch && request.method === "PATCH") {
      return handleInboxUpdateRequest(request, inboxMatch[1], env, origin, corsHeaders(origin));
    }

    // ── Sites-конструктор routes (MODULE_ROADMAP.md розділ 4; EXECUTION_PLAN.md Фаза 3.1) ──
    if (url.pathname === "/api/projects" && request.method === "GET") {
      return handleProjectsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/projects" && request.method === "POST") {
      return handleProjectCreate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/project-templates" && request.method === "GET") {
      return handleProjectTemplatesList(request, env, corsHeaders(origin));
    }
    const projectDetailMatch = url.pathname.match(/^\/api\/projects\/([^/]+)$/);
    if (projectDetailMatch && request.method === "GET") {
      return handleProjectDetail(request, env, corsHeaders(origin), projectDetailMatch[1]);
    }
    const projectPublishMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/publish$/);
    if (projectPublishMatch && request.method === "POST") {
      return handleProjectPublish(request, env, corsHeaders(origin), projectPublishMatch[1]);
    }
    const projectUnpublishMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/unpublish$/);
    if (projectUnpublishMatch && request.method === "POST") {
      return handleProjectUnpublish(request, env, corsHeaders(origin), projectUnpublishMatch[1]);
    }
    const projectPagesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pages$/);
    if (projectPagesMatch && request.method === "POST") {
      return handleProjectPageCreate(request, env, corsHeaders(origin), projectPagesMatch[1]);
    }
    const projectPageItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pages\/([^/]+)$/);
    if (projectPageItemMatch && request.method === "PATCH") {
      return handleProjectPageUpdate(request, env, corsHeaders(origin), projectPageItemMatch[1], projectPageItemMatch[2]);
    }
    if (projectPageItemMatch && request.method === "DELETE") {
      return handleProjectPageDelete(request, env, corsHeaders(origin), projectPageItemMatch[1], projectPageItemMatch[2]);
    }
    const projectPageAiGenerateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/pages\/([^/]+)\/ai-generate$/);
    if (projectPageAiGenerateMatch && request.method === "POST") {
      return handleProjectPageAiGenerate(request, env, corsHeaders(origin), projectPageAiGenerateMatch[1], projectPageAiGenerateMatch[2]);
    }
    // Публічний, без авторизації — SSR-рендеринг опублікованого проекту
    const sitesContentMatch = url.pathname.match(/^\/api\/sites-content\/([^/]+)$/);
    if (sitesContentMatch && request.method === "GET") {
      return handleSitesContentPublic(request, env, corsHeaders(origin), sitesContentMatch[1]);
    }

    // ── Translator routes (MODULE_ROADMAP.md розділ 5; EXECUTION_PLAN.md Фаза 3.2) ──
    const projectLanguagesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/languages$/);
    if (projectLanguagesMatch && request.method === "GET") {
      return handleProjectLanguagesList(request, env, corsHeaders(origin), projectLanguagesMatch[1]);
    }
    if (projectLanguagesMatch && request.method === "POST") {
      return handleProjectLanguageCreate(request, env, corsHeaders(origin), projectLanguagesMatch[1]);
    }
    const projectLanguageItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/languages\/([^/]+)$/);
    if (projectLanguageItemMatch && request.method === "DELETE") {
      return handleProjectLanguageDelete(request, env, corsHeaders(origin), projectLanguageItemMatch[1], projectLanguageItemMatch[2]);
    }
    const projectTranslationsMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/translations$/);
    if (projectTranslationsMatch && request.method === "GET") {
      return handleTranslationsList(request, env, corsHeaders(origin), projectTranslationsMatch[1]);
    }
    const projectTranslateMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/translate$/);
    if (projectTranslateMatch && request.method === "POST") {
      return handleTranslate(request, env, corsHeaders(origin), projectTranslateMatch[1]);
    }
    const translationItemMatch = url.pathname.match(/^\/api\/translations\/([^/]+)$/);
    if (translationItemMatch && request.method === "PATCH") {
      return handleTranslationUpdate(request, env, corsHeaders(origin), translationItemMatch[1]);
    }

    // ── Commerce routes (MODULE_ROADMAP.md розділ 6) ──────────────────
    const productsListMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/products$/);
    if (productsListMatch && request.method === "GET") {
      return handleProductsList(request, env, corsHeaders(origin), productsListMatch[1]);
    }
    if (productsListMatch && request.method === "POST") {
      return handleProductCreate(request, env, corsHeaders(origin), productsListMatch[1]);
    }
    const productItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/products\/([^/]+)$/);
    if (productItemMatch && request.method === "PATCH") {
      return handleProductUpdate(request, env, corsHeaders(origin), productItemMatch[1], productItemMatch[2]);
    }
    if (productItemMatch && request.method === "DELETE") {
      return handleProductDelete(request, env, corsHeaders(origin), productItemMatch[1], productItemMatch[2]);
    }
    const ordersListMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/orders$/);
    if (ordersListMatch && request.method === "GET") {
      return handleOrdersList(request, env, corsHeaders(origin), ordersListMatch[1]);
    }
    // Категорії товарів (product_categories) — перевіряються ПЕРЕД
    // /products/:productId нижче, бо шлях /products/:id/categories
    // інакше збігся б з productItemMatch, якби порядок був зворотним.
    const productCategoriesMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/products\/([^/]+)\/categories$/);
    if (productCategoriesMatch && request.method === "GET") {
      return handleProductCategoriesList(request, env, corsHeaders(origin), productCategoriesMatch[1], productCategoriesMatch[2]);
    }
    if (productCategoriesMatch && request.method === "PUT") {
      return handleProductCategoriesSet(request, env, corsHeaders(origin), productCategoriesMatch[1], productCategoriesMatch[2]);
    }
    const categoriesListMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/categories$/);
    if (categoriesListMatch && request.method === "GET") {
      return handleCategoriesList(request, env, corsHeaders(origin), categoriesListMatch[1]);
    }
    if (categoriesListMatch && request.method === "POST") {
      return handleCategoryCreate(request, env, corsHeaders(origin), categoriesListMatch[1]);
    }
    const categoryItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/categories\/([^/]+)$/);
    if (categoryItemMatch && request.method === "PATCH") {
      return handleCategoryUpdate(request, env, corsHeaders(origin), categoryItemMatch[1], categoryItemMatch[2]);
    }
    if (categoryItemMatch && request.method === "DELETE") {
      return handleCategoryDelete(request, env, corsHeaders(origin), categoryItemMatch[1], categoryItemMatch[2]);
    }
    const couponsListMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/coupons$/);
    if (couponsListMatch && request.method === "GET") {
      return handleCouponsList(request, env, corsHeaders(origin), couponsListMatch[1]);
    }
    if (couponsListMatch && request.method === "POST") {
      return handleCouponCreate(request, env, corsHeaders(origin), couponsListMatch[1]);
    }
    const couponItemMatch = url.pathname.match(/^\/api\/projects\/([^/]+)\/coupons\/([^/]+)$/);
    if (couponItemMatch && request.method === "DELETE") {
      return handleCouponDelete(request, env, corsHeaders(origin), couponItemMatch[1], couponItemMatch[2]);
    }
    // Публічні, без авторизації — доступні з вітрини магазину для анонімного покупця
    if (url.pathname === "/api/coupons/validate" && request.method === "POST") {
      return handleCouponValidate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/checkout/commerce" && request.method === "POST") {
      return handleCommerceCheckout(request, env, corsHeaders(origin));
    }

    // ── Team Workspace routes (концептуальний документ "AI Business
    // Operating System" — п'ять напрямків, MVP-фундамент) ──────────
    if (url.pathname === "/api/team/tasks" && request.method === "GET") {
      return handleTeamTasksList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/team/tasks" && request.method === "POST") {
      return handleTeamTaskCreate(request, env, corsHeaders(origin));
    }
    const teamTaskStatusMatch = url.pathname.match(/^\/api\/team\/tasks\/([^/]+)$/);
    if (teamTaskStatusMatch && request.method === "PATCH") {
      return handleTeamTaskStatusUpdate(request, env, corsHeaders(origin), teamTaskStatusMatch[1]);
    }
    if (url.pathname === "/api/team/comments" && request.method === "GET") {
      return handleTeamCommentsList(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/team/comments" && request.method === "POST") {
      return handleTeamCommentCreate(request, env, corsHeaders(origin));
    }
    if (url.pathname === "/api/team/activity" && request.method === "GET") {
      return handleActivityFeedList(request, env, corsHeaders(origin));
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

    // POST /api/sites/:id/run-uptime-check — ручний запуск uptime-перевірки для одного сайту
    const uptimeMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/run-uptime-check$/);
    if (uptimeMatch && request.method === "POST") {
      const siteId = uptimeMatch[1];
      // Авторизація через JWT
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      const result = await runUptimeCheckForSite(
        siteId,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY,
        env.RESEND_API_KEY,
        env.APP_URL,
        env.TELEGRAM_BOT_TOKEN
      );

      if (!result.ok) return json({ error: result.error ?? "Перевірка не вдалась" }, 500, origin);
      return json({ ok: true, status: result.status }, 200, origin);
    }

    // POST /api/sites/:id/run-seo-check — ручний запуск SEO/sitemap-перевірки для одного сайту
    const seoCheckMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/run-seo-check$/);
    if (seoCheckMatch && request.method === "POST") {
      const siteId = seoCheckMatch[1];
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      const result = await runSeoCheckForSite(siteId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!result.ok) return json({ error: result.error ?? "Перевірка не вдалась" }, 500, origin);
      return json({ ok: true }, 200, origin);
    }

    // POST /api/sites/:id/incidents/:incidentId/resolve — ручне закриття "застряглого" інциденту
    const resolveIncidentMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/incidents\/([^/]+)\/resolve$/);
    if (resolveIncidentMatch && request.method === "POST") {
      const [, siteId, incidentId] = resolveIncidentMatch;
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);
      const userData = await userRes.json() as { id?: string };
      if (!userData.id) return json({ error: "Unauthorized" }, 401, origin);

      // Перевіряємо що юзер належить до організації, якій належить сайт —
      // це мутація даних (закриття інциденту), тому перевірка власності
      // тут суворіша, ніж просто валідний JWT.
      const siteResult = await selectRows<{ id: string; organization_id: string }>(
        "sites",
        `select=id,organization_id&id=eq.${encodeURIComponent(siteId)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const site = siteResult.data[0];
      if (!site) return json({ error: "Сайт не знайдено" }, 404, origin);

      const membershipResult = await selectRows<{ organization_id: string }>(
        "organization_members",
        `select=organization_id&user_id=eq.${encodeURIComponent(userData.id)}&organization_id=eq.${encodeURIComponent(site.organization_id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (membershipResult.data.length === 0) return json({ error: "Forbidden" }, 403, origin);

      const result = await resolveIncidentManually(incidentId, siteId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (!result.ok) return json({ error: result.error ?? "Не вдалося закрити інцидент" }, 500, origin);
      return json({ ok: true }, 200, origin);
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

      // Rate limiting: публічний ендпоінт без авторизації, 5 паралельних
      // запитів до БД на виклик. Ліміт щедрий (сторінку можуть дивитись
      // реальні відвідувачі часто, напр. вбудовану в iframe), але захищає
      // від навмисного засипання запитами конкретного IP.
      const clientIp = getClientIp(request);
      const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `status:${clientIp}`, 60, 60);
      if (!rateLimit.allowed) {
        return json({ error: "Забагато запитів. Спробуйте пізніше." }, 429, origin);
      }

      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      };

      // Знаходимо сайт за slug
      const siteResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sites?select=id,url,display_name,status_page_enabled,organization_id,maintenance_until&status_page_slug=eq.${encodeURIComponent(slug)}&limit=1`,
        { headers: h }
      );
      if (!siteResp.ok) return json({ error: "Server error" }, 500, origin);
      const sites = await siteResp.json() as Array<{
        id: string; url: string; display_name: string; status_page_enabled: boolean; organization_id: string; maintenance_until: string | null;
      }>;
      const site = sites[0];
      if (!site || !site.status_page_enabled) {
        return json({ error: "Сторінку статусу не знайдено" }, 404, origin);
      }

      const isInMaintenance = site.maintenance_until != null &&
        new Date(site.maintenance_until).getTime() > Date.now();

      const siteId = site.id;

      // Growth/Agency/trial/admin отримують 90-денну історію uptime,
      // Starter — базові 7 днів (як і раніше).
      const planResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/subscriptions?select=plans(code)&organization_id=eq.${encodeURIComponent(site.organization_id)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
        { headers: h }
      );
      const planArr = planResp.ok
        ? await planResp.json() as Array<{ plans: { code: string } | null }>
        : [];
      const planCode = planArr[0]?.plans?.code ?? "free";
      const hasExtendedHistory = ["growth", "agency", "admin", "trial"].includes(planCode);
      const historyDays = hasExtendedHistory ? 90 : 7;

      const historyAgo = new Date(Date.now() - historyDays * 24 * 60 * 60 * 1000).toISOString();
      const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const [checksResp, incidentsResp, speedResp, sslResp, orgResp] = await Promise.all([
        fetch(`${env.SUPABASE_URL}/rest/v1/uptime_checks?select=status,checked_at&site_id=eq.${siteId}&checked_at=gte.${historyAgo}&order=checked_at.desc`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/uptime_incidents?select=id,started_at,resolved_at,duration_seconds&site_id=eq.${siteId}&started_at=gte.${hasExtendedHistory ? historyAgo : monthAgo}&order=started_at.desc&limit=${hasExtendedHistory ? 90 : 20}`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/speed_checks?select=load_time_ms,checked_at&site_id=eq.${siteId}&checked_at=gte.${historyAgo}&order=checked_at.desc&limit=50`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/ssl_certificates?select=days_until_expiry,valid_until&site_id=eq.${siteId}&limit=1`, { headers: h }),
        fetch(`${env.SUPABASE_URL}/rest/v1/organizations?select=org_type,white_label_enabled,white_label_logo_url,white_label_company_name&id=eq.${site.organization_id}&limit=1`, { headers: h }),
      ]);

      const checks = checksResp.ok ? await checksResp.json() as Array<{ status: string; checked_at: string }> : [];
      const incidents = incidentsResp.ok ? await incidentsResp.json() as Array<{ id: string; started_at: string; resolved_at: string | null; duration_seconds: number | null }> : [];
      const speeds = speedResp.ok ? await speedResp.json() as Array<{ load_time_ms: number; checked_at: string }> : [];
      const sslArr = sslResp.ok ? await sslResp.json() as Array<{ days_until_expiry: number | null; valid_until: string | null }> : [];
      const orgArr = orgResp.ok ? await orgResp.json() as Array<{
        org_type: string; white_label_enabled: boolean; white_label_logo_url: string | null; white_label_company_name: string | null;
      }> : [];
      const org = orgArr[0];
      const whiteLabel = org?.org_type === "agency" && org.white_label_enabled
        ? { companyName: org.white_label_company_name, logoUrl: org.white_label_logo_url }
        : null;

      // Uptime % за весь доступний період (7 або 90 днів залежно від плану)
      const totalChecks = checks.length;
      const upChecks = checks.filter(c => c.status === "up").length;
      const uptimePctPeriod = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

      // Поточний статус (останні 2 перевірки). Якщо активне обслуговування —
      // показуємо його незалежно від фактичного стану сайту.
      const recentChecks = checks.slice(0, 2);
      const currentStatus: "up" | "down" | "unknown" | "maintenance" = isInMaintenance
        ? "maintenance"
        : recentChecks.length === 0
        ? "unknown"
        : recentChecks[0].status === "up" ? "up" : "down";

      // Uptime по днях за весь доступний період (для графіка)
      const dailyUptime: Array<{ date: string; pct: number; checks: number }> = [];
      for (let i = historyDays - 1; i >= 0; i--) {
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
        historyDays,
        uptimePct7d: Math.round(uptimePctPeriod * 100) / 100,
        avgSpeedMs,
        dailyUptime,
        incidents: incidents.slice(0, hasExtendedHistory ? 30 : 10),
        ssl: ssl ? { daysLeft: ssl.days_until_expiry, validUntil: ssl.valid_until } : null,
        whiteLabel,
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
          { headers: { ...supabaseHeaders(env), Accept: "application/json" } }
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

    // PATCH /api/sites/:id/alert-threshold — власний поріг часу відповіді
    const thresholdMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/alert-threshold$/);
    if (thresholdMatch && request.method === "PATCH") {
      const siteId = thresholdMatch[1];
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);
      const userData = await userRes.json() as { id?: string };
      if (!userData.id) return json({ error: "Unauthorized" }, 401, origin);

      // Перевіряємо що юзер належить до організації цього сайту — ця
      // мутація тепер також викликається для "чужих" (у сенсі — не
      // поточної сторінки) сайтів через "Скопіювати поріг", тому
      // валідного JWT вже не досить.
      const siteResult = await selectRows<{ id: string; organization_id: string }>(
        "sites",
        `select=id,organization_id&id=eq.${encodeURIComponent(siteId)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const site = siteResult.data[0];
      if (!site) return json({ error: "Сайт не знайдено" }, 404, origin);

      const membershipResult = await selectRows<{ organization_id: string }>(
        "organization_members",
        `select=organization_id&user_id=eq.${encodeURIComponent(userData.id)}&organization_id=eq.${encodeURIComponent(site.organization_id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (membershipResult.data.length === 0) return json({ error: "Forbidden" }, 403, origin);

      const body = await request.json() as { thresholdMs?: number | null };

      // Валідація: null (вимкнено) або число від 500мс до 60000мс (60с)
      if (body.thresholdMs !== null && body.thresholdMs !== undefined) {
        if (typeof body.thresholdMs !== "number" || body.thresholdMs < 500 || body.thresholdMs > 60000) {
          return json({ error: "Поріг має бути від 500 до 60000 мс" }, 400, origin);
        }
      }

      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };

      const patchResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sites?id=eq.${siteId}`,
        {
          method: "PATCH",
          headers: h,
          body: JSON.stringify({ response_time_alert_threshold_ms: body.thresholdMs ?? null }),
        }
      );
      if (!patchResp.ok) {
        const err = await patchResp.text();
        return json({ error: err }, 400, origin);
      }
      const updated = await patchResp.json() as Array<{ response_time_alert_threshold_ms: number | null }>;
      return json({ ok: true, thresholdMs: updated[0]?.response_time_alert_threshold_ms ?? null }, 200, origin);
    }

    // PATCH /api/sites/:id/maintenance — увімкнути/вимкнути режим обслуговування
    const maintenanceMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/maintenance$/);
    if (maintenanceMatch && request.method === "PATCH") {
      const siteId = maintenanceMatch[1];
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      // body.durationMinutes: увімкнути на N хвилин від зараз (null/0 = вимкнути одразу)
      const body = await request.json() as { durationMinutes?: number | null };

      let maintenanceUntil: string | null = null;
      if (body.durationMinutes != null && body.durationMinutes > 0) {
        if (body.durationMinutes > 24 * 60) {
          return json({ error: "Максимум 24 години обслуговування за раз" }, 400, origin);
        }
        maintenanceUntil = new Date(Date.now() + body.durationMinutes * 60 * 1000).toISOString();
      }

      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };

      const patchResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sites?id=eq.${siteId}`,
        { method: "PATCH", headers: h, body: JSON.stringify({ maintenance_until: maintenanceUntil }) }
      );
      if (!patchResp.ok) {
        const err = await patchResp.text();
        return json({ error: err }, 400, origin);
      }
      const updated = await patchResp.json() as Array<{ maintenance_until: string | null }>;
      return json({ ok: true, maintenanceUntil: updated[0]?.maintenance_until ?? null }, 200, origin);
    }

    // PATCH /api/sites/:id/monitoring — призупинити/відновити моніторинг сайту
    const monitoringMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/monitoring$/);
    if (monitoringMatch && request.method === "PATCH") {
      const siteId = monitoringMatch[1];
      const authHeader = request.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "") ?? "";
      const userRes = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return json({ error: "Unauthorized" }, 401, origin);

      const body = await request.json() as { enabled?: boolean };
      if (typeof body.enabled !== "boolean") {
        return json({ error: "Поле enabled має бути true/false" }, 400, origin);
      }

      const h = {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };

      const patchResp = await fetch(
        `${env.SUPABASE_URL}/rest/v1/sites?id=eq.${siteId}`,
        { method: "PATCH", headers: h, body: JSON.stringify({ monitoring_enabled: body.enabled }) }
      );
      if (!patchResp.ok) {
        const err = await patchResp.text();
        return json({ error: err }, 400, origin);
      }
      const updated = await patchResp.json() as Array<{ monitoring_enabled: boolean }>;
      return json({ ok: true, enabled: updated[0]?.monitoring_enabled ?? body.enabled }, 200, origin);
    }

    // ── Multi-URL speed monitoring ────────────────────────────────────────────
    const monitoredUrlsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/monitored-urls$/);
    if (monitoredUrlsMatch) {
      const siteId = monitoredUrlsMatch[1];
      const h = { ...supabaseHeaders(env), "Content-Type": "application/json", Prefer: "return=representation" };

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
      const h = supabaseHeaders(env);
      await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_urls?id=eq.${id}`, { method: "DELETE", headers: h });
      return json({ ok: true }, 200, origin);
    }

    // ── Form monitoring ────────────────────────────────────────────────────────
    const monitoredFormsMatch = url.pathname.match(/^\/api\/sites\/([^/]+)\/monitored-forms$/);
    if (monitoredFormsMatch) {
      const siteId = monitoredFormsMatch[1];
      const h = { ...supabaseHeaders(env), "Content-Type": "application/json", Prefer: "return=representation" };

      if (request.method === "GET") {
        const res = await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_forms?site_id=eq.${siteId}&active=eq.true&select=id,page_url,label,created_at&order=created_at.asc`, { headers: h });
        const forms = await res.json() as Array<{ id: string; page_url: string; label: string | null; created_at: string }>;
        const withChecks = await Promise.all(forms.map(async mf => {
          const cr = await fetch(`${env.SUPABASE_URL}/rest/v1/form_checks?monitored_form_id=eq.${mf.id}&order=checked_at.desc&limit=1&select=form_found,fields_count,has_submit,checked_at`, { headers: h });
          const checks = cr.ok ? await cr.json() as Array<{ form_found: boolean; fields_count: number; has_submit: boolean; checked_at: string }> : [];
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
      const h = supabaseHeaders(env);
      await fetch(`${env.SUPABASE_URL}/rest/v1/monitored_forms?id=eq.${id}`, { method: "DELETE", headers: h });
      return json({ ok: true }, 200, origin);
    }

    // ── Competitor changes (diff view) ─────────────────────────────────────────
    const competitorChangesMatch = url.pathname.match(/^\/api\/competitors\/([^/]+)\/changes$/);
    if (competitorChangesMatch && request.method === "GET") {
      const competitorId = competitorChangesMatch[1];
      const h = supabaseHeaders(env);
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

      const h = { ...supabaseHeaders(env), "Prefer": "count=exact", "Accept": "application/json" };

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

    if (url.pathname === "/api/admin/business-metrics" && request.method === "GET") {
      return handleBusinessMetrics(request, env, origin);
    }

    return json({ error: "Маршрут не знайдено" }, 404, origin);
  },

  // ── Cron handler ──────────────────────────────────────────────
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext): Promise<void> {
    // 0 3 * * * — щодня о 3:00: швидкість + SEO + конкуренти
    if (event.cron === "0 3 * * *") {
      const [speedSummary, seoSummary, competitorSummary, gscSyncResult, ga4SyncResult, automationsSummary, predictiveSummary, benchmarkSummary] = await Promise.all([
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
        // GA4-синк (MODULE_ROADMAP.md розділ 3) — той самий нічний
        // тригер, що GSC, щоб не заводити окремий Cloudflare Cron Trigger.
        runGa4Sync(env),
        // Qorax AI хаб, вкладка Automations (agent_subscriptions) —
        // додано до вже наявного нічного тригера, щоб не вимагати від
        // Артема створювати ще один Cloudflare Cron Trigger вручну.
        // Найчастіший пресет розкладу зараз — 'daily', раз на добу
        // достатньо для перевірки.
        runDueAgentAutomations(env),
        // Predictive AI Risk/Opportunity Detection (MODULE_ROADMAP.md
        // розділ 16) — той самий нічний тригер, що решта, щоб не
        // заводити окремий Cloudflare Cron Trigger.
        runPredictiveDetectors(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
        // Benchmarking (MODULE_ROADMAP.md розділ 15) — читає вчорашні
        // speed_checks/cro_daily_stats/ai_generations, тому запускається
        // тут-таки о 3:00, а не окремим тригером: ці таблиці вже
        // наповнюються попередніми кроками цього ж Promise.all за
        // попередню добу (не за сьогоднішній прогін).
        runBenchmarkAggregation(env),
      ]);
      console.log("Speed:", JSON.stringify(speedSummary));
      console.log("SEO:", JSON.stringify(seoSummary));
      console.log("Competitors:", JSON.stringify(competitorSummary));
      console.log("GSC sync:", JSON.stringify(gscSyncResult));
      console.log("GA4 sync:", JSON.stringify(ga4SyncResult));
      console.log("Automations:", JSON.stringify(automationsSummary));
      console.log("Predictive:", JSON.stringify(predictiveSummary));
      console.log("Benchmark aggregation:", JSON.stringify(benchmarkSummary));

      // Business Coach (документ Артема, пункт 16) — навмисно ПІСЛЯ
      // Promise.all вище, не всередині нього: читає speed_checks/
      // social_posts, і має сенс лише коли runSpeedChecks уже дописав
      // сьогоднішні заміри, інакше сигнал "покращення швидкості"
      // будувався б на застарілих даних попереднього дня.
      const coachResult = await runBusinessCoachCheck(env).catch(err => {
        console.error("Business Coach error:", err instanceof Error ? err.message : err);
        return { checked: 0 };
      });
      console.log("Business Coach:", JSON.stringify(coachResult));

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
        console.log(`Weekly digests: sent=${digestResult.sent}, skipped=${digestResult.skipped}, errors=${digestResult.errors.length}`);
        if (digestResult.errors.length) console.warn("Digest errors:", digestResult.errors);

        const telegramDigestResult = await sendTelegramWeeklyDigests(env).catch(e => {
          console.error("Telegram weekly digest cron error:", e);
          return { sent: 0, skipped: 0 };
        });
        console.log(`Telegram weekly digests: sent=${telegramDigestResult.sent}, skipped=${telegramDigestResult.skipped}`);
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

    // * * * * * — щохвилини: публікація запланованих Social-постів
    // (MODULE_ROADMAP.md розділ 8, Крок 2; EXECUTION_PLAN.md Фаза 2.4).
    // НОВИЙ тригер — Артему потрібно додати вручну в Cloudflare Dashboard
    // (той самий механізм, що інші cron-и цього проекту — wrangler.toml
    // не працює на цьому акаунті). Окремий від "*/5 * * * *" (uptime/SSL),
    // бо там уже своє навантаження щохвилини.
    if (event.cron === "* * * * *") {
      const s = await runSocialPublishWithEnv(env);
      console.log("Social publish run:", JSON.stringify(s));
      return;
    }

    // */10 * * * * — щодесять хвилин: агрегація CRO-подій + TTL-видалення
    // сирих подій (MODULE_ROADMAP.md розділ 9 Крок 2; EXECUTION_PLAN.md
    // Фаза 2.6). НОВИЙ тригер — Артему потрібно додати вручну в Cloudflare
    // Dashboard. Окремий від "* * * * *" (Social) — CRO-агрегація важча
    // операція (читає до 5000 подій, групує в пам'яті), 10-хвилинний
    // інтервал достатній для UI, що показує денну статистику, не
    // потребує щохвилинної свіжості.
    if (event.cron === "*/10 * * * *") {
      const s = await runCroAggregate(env);
      console.log("CRO aggregate run:", JSON.stringify(s));
      // Qorax Mail — синхронізація всіх активних mail_accounts. Той
      // самий тригер, що CRO-агрегація (не новий Cloudflare Cron
      // Trigger) — лист не потребує щохвилинної свіжості, 10 хв
      // достатньо для MVP Inbox.
      const mailSync = await runMailSyncAll(env);
      console.log("Mail sync run:", JSON.stringify(mailSync));
      return;
    }

    // 0 * * * * — щогодини: CRM-нагадування (EXECUTION_PLAN.md Фаза
    // 2.1 "НЕ зроблено", закрито окремим проходом). НОВИЙ тригер —
    // Артему потрібно додати вручну в Cloudflare Dashboard. Погодинний
    // інтервал достатній для нагадувань (remind_at зазвичай задається
    // з точністю до години самим користувачем, не до хвилини) — не
    // навантажувати диспетчер ще одним щохвилинним тригером без потреби.
    if (event.cron === "0 * * * *") {
      const s = await runCrmReminders(env);
      console.log("CRM reminders run:", JSON.stringify(s));
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
  // Rate limiting: захищаємо безкоштовний lead-magnet від зловживань —
  // ендпоінт без авторизації, кожен виклик коштує грошей (PageSpeed + Gemini).
  // Ліміт: 3 аудити на IP за 10 хвилин.
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `audit:${clientIp}`, 3, 600);
  if (!rateLimit.allowed) {
    return json(
      { error: "Забагато запитів. Спробуйте ще раз через кілька хвилин." },
      429,
      origin
    );
  }

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
