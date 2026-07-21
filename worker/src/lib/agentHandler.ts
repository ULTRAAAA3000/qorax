// ============================================================
// agentHandler.ts — Qorax AI Agents (хвиля 3, п'ятий UI-крок).
//
// EXECUTION_PLAN.md: після Chat/Workspace/Memory. Рішення Артема:
// повноцінні дії (не просто аналіз-summary), лише 1-2 агенти за
// сесію. Реалізовано агент 'content' — єдиний реалістичний варіант,
// оскільки Qorax НЕ має доступу до хостингу/CMS клієнта (Docs:
// "Qorax працює зовні, як звичайний відвідувач") — тому агент не
// може сам змінити живий сайт, лише реальні дані ВСЕРЕДИНІ Qorax.
//
// Що робить агент 'content':
// 1. Читає page_seo_audits для сайту — знаходить сторінки, де issues
//    містить проблеми з title/meta description (seoChecker.ts вже
//    формує ці рядки українською: "Відсутній <title>", "Meta
//    description занадто короткий" тощо)
// 2. Для кожної проблемної сторінки (максимум 5 за один запуск,
//    щоб не витратити забагато кредитів одразу) генерує новий
//    заголовок/meta через ІСНУЮЧУ інфраструктуру contentGeneration.ts
//    (buildPrompt/callGemini) — не нову AI-інтеграцію
// 3. Списує ai_credits (та сама логіка, що handleAiGenerate) і
//    зберігає результат в ai_generations — готовий текст, який
//    клієнт вручну вставляє на сайт (Qorax не робить цього сам)
// 4. Записує agent_runs (статус, скільки кредитів витрачено) і
//    agent_action_log для кожної згенерованої сторінки — це і є
//    "повноцінна дія": реальні нові рядки в БД Qorax, видимі в
//    історії запусків
// ============================================================

import { selectRows, insertRow, updateRows } from "./supabase";
import { buildPrompt, callGemini, type GenerationKind } from "./contentGeneration";
import { createAgentTask, finishAgentTask } from "./taskHandler";
import type { Env } from "../types";
import { corsHeaders as sharedCorsHeaders } from "./cors";
import { checkAiCredits, deductAiCredits } from "./aiCredits";

const MAX_PAGES_PER_RUN = 5; // ліміт кредитів за один запуск агента

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  organization_id: string;
}

interface SeoAuditRow {
  page_url: string;
  title: string | null;
  meta_description: string | null;
  issues: string[];
}

interface AgentRow {
  id: string;
  name: string;
  description: string;
  credit_cost_per_run: number;
  is_active: boolean;
}

interface AgentRunRow {
  id: string;
  agent_subscription_id: string;
  organization_id: string;
  status: string;
  credits_spent: number;
  summary: string | null;
  raw_output: unknown;
  started_at: string;
  finished_at: string | null;
}

async function authenticate(request: Request, env: Env): Promise<string | null> {
  const authHeader = request.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "").trim();
  if (!jwt) return null;

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!userResp.ok) return null;
  return ((await userResp.json()) as { id: string }).id;
}

// ─── GET /api/agents ─────────────────────────────────────────
// Список доступних агентів (глобальний довідник + чи є вже
// підписка на нього для конкретного сайту)

export async function handleAgentsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const agentsResult = await selectRows<AgentRow>(
      "agents",
      `select=id,name,description,credit_cost_per_run,is_active&is_active=eq.true`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    return jsonResponse({ agents: agentsResult.data }, 200, corsHeaders);
  } catch (err) {
    console.error("[agents] list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── GET /api/agents/runs?site_id=... ───────────────────────────
// Історія запусків для сайту (найновіші зверху)

export async function handleAgentRunsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const url = new URL(request.url);
    const siteId = url.searchParams.get("site_id");
    if (!siteId) return jsonResponse({ error: "site_id обов'язковий" }, 400, corsHeaders);

    const siteResult = await selectRows<SiteRow>(
      "sites",
      `select=id,url,display_name,organization_id&id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const site = siteResult.data[0];
    if (!site) return jsonResponse({ error: "Сайт не знайдено" }, 404, corsHeaders);

    const memberCheck = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&organization_id=eq.${encodeURIComponent(site.organization_id)}&user_id=eq.${encodeURIComponent(userId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    // agent_subscriptions -> agent_runs (два запити замість JOIN —
    // той самий підхід, що вже використано в проєкті для простих
    // фільтрів без потреби у складному select-синтаксисі PostgREST)
    const subsResult = await selectRows<{ id: string }>(
      "agent_subscriptions",
      `select=id&site_id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const subIds = subsResult.data.map((s) => s.id);
    if (subIds.length === 0) return jsonResponse({ runs: [] }, 200, corsHeaders);

    const subFilter = `in.(${subIds.map((id) => encodeURIComponent(id)).join(",")})`;
    const runsResult = await selectRows<AgentRunRow>(
      "agent_runs",
      `select=id,agent_subscription_id,organization_id,status,credits_spent,summary,raw_output,started_at,finished_at&agent_subscription_id=${subFilter}&order=started_at.desc&limit=20`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    return jsonResponse({ runs: runsResult.data }, 200, corsHeaders);
  } catch (err) {
    console.error("[agents] runs list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── POST /api/agents/content/run ────────────────────────────
// Запускає агент 'content' для конкретного сайту — знаходить
// проблемні сторінки і генерує нові title/meta_description.

/**
 * Спільна логіка "почати run агента": знайти/створити agent_subscriptions
 * (потрібен FK для agent_runs), створити сам agent_runs зі статусом
 * 'running'. Винесено окремо, бо тепер її повторюють SEO/Rank агенти
 * так само, як Content — без цього довелось би копіювати той самий
 * 15-рядковий блок втретє.
 */
async function ensureAgentRun(
  agentId: string,
  organizationId: string,
  siteId: string,
  env: Env
): Promise<{ runId: string; subscriptionId: string }> {
  const subResult = await selectRows<{ id: string }>(
    "agent_subscriptions",
    `select=id&organization_id=eq.${encodeURIComponent(organizationId)}&agent_id=eq.${encodeURIComponent(agentId)}&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  let subscriptionId = subResult.data[0]?.id;
  if (!subscriptionId) {
    subscriptionId = crypto.randomUUID();
    await insertRow(
      "agent_subscriptions",
      { id: subscriptionId, organization_id: organizationId, agent_id: agentId, site_id: siteId, is_enabled: true },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  const runId = crypto.randomUUID();
  await insertRow(
    "agent_runs",
    { id: runId, agent_subscription_id: subscriptionId, organization_id: organizationId, status: "running" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return { runId, subscriptionId };
}

async function finishAgentRun(
  runId: string,
  subscriptionId: string,
  status: "done" | "failed",
  summary: string,
  rawOutput: unknown,
  env: Env,
  creditsSpent = 0
): Promise<void> {
  await updateRows(
    "agent_runs",
    `id=eq.${encodeURIComponent(runId)}`,
    { status, credits_spent: creditsSpent, summary, raw_output: rawOutput, finished_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  await updateRows(
    "agent_subscriptions",
    `id=eq.${encodeURIComponent(subscriptionId)}`,
    { last_run_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
}

/** Спільна перевірка доступу: сайт існує + користувач editor+ в його організації. Ідентична для всіх трьох агентів. */
async function resolveSiteAccess(siteId: string, userId: string, env: Env): Promise<SiteRow | null> {
  const siteResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,organization_id&id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const site = siteResult.data[0];
  if (!site) return null;

  const memberCheck = await selectRows<{ organization_id: string; role: string }>(
    "organization_members",
    `select=organization_id,role&organization_id=eq.${encodeURIComponent(site.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!memberCheck.data[0]) return null;

  return site;
}

// ─── POST /api/agents/seo/run ────────────────────────────────
// SEO Agent: НЕ генерує новий AI-контент (на відміну від Content
// Agent) — агрегує вже наявні ai_insights (0007_ai_insights.sql),
// сгенеровані фоновим аудитом. credit_cost_per_run = 0 (agents seed),
// тому що дані вже готові — агент лише збирає й підсумовує їх у
// один run, без нового Gemini-виклику.

interface AiInsightRow {
  severity: string;
  problem_summary: string;
  estimated_monthly_loss_usd: number | null;
}

export async function handleRunSeoAgentRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    let body: { site_id?: string };
    try {
      body = (await request.json()) as { site_id?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }
    const siteId = body.site_id;
    if (!siteId) return jsonResponse({ error: "site_id обов'язковий" }, 400, corsHeaders);

    const site = await resolveSiteAccess(siteId, userId, env);
    if (!site) return jsonResponse({ error: "Сайт не знайдено або немає доступу" }, 404, corsHeaders);

    const { runId, subscriptionId } = await ensureAgentRun("seo", site.organization_id, siteId, env);

    const insightsResult = await selectRows<AiInsightRow>(
      "ai_insights",
      `select=severity,problem_summary,estimated_monthly_loss_usd&site_id=eq.${encodeURIComponent(siteId)}&is_resolved=eq.false&order=estimated_monthly_loss_usd.desc.nullslast&limit=10`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const insights = insightsResult.data;

    if (insights.length === 0) {
      const summary = "Активних проблем не знайдено — сайт у гарному стані.";
      await finishAgentRun(runId, subscriptionId, "done", summary, [], env);
      return jsonResponse({ run_id: runId, summary, insights: [] }, 200, corsHeaders);
    }

    const totalLoss = insights.reduce((sum, i) => sum + (i.estimated_monthly_loss_usd ?? 0), 0);
    const critical = insights.filter(i => i.severity === "critical" || i.severity === "high").length;
    const summary = totalLoss > 0
      ? `Знайдено ${insights.length} активних проблем (${critical} критичних) — орієнтовно $${totalLoss.toFixed(0)}/міс втрачених можливостей.`
      : `Знайдено ${insights.length} активних проблем (${critical} критичних).`;

    await finishAgentRun(runId, subscriptionId, "done", summary, insights, env);

    return jsonResponse({ run_id: runId, summary, insights }, 200, corsHeaders);
  } catch (err) {
    console.error("[agents] run seo unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── POST /api/agents/rank/run ───────────────────────────────
// Rank Agent: агрегує вже наявні gsc_metrics для tracked-запитів
// (0041_rank_tracked_queries.sql) — так само, як SEO Agent, без
// нового зовнішнього виклику. Порівнює найновішу позицію з позицією
// 7 днів тому для кожного відстежуваного запиту.

interface TrackedQueryRow { query: string }
interface GscMetricRow { query: string; date: string; average_position: number | null }

export async function handleRunRankAgentRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    let body: { site_id?: string };
    try {
      body = (await request.json()) as { site_id?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }
    const siteId = body.site_id;
    if (!siteId) return jsonResponse({ error: "site_id обов'язковий" }, 400, corsHeaders);

    const site = await resolveSiteAccess(siteId, userId, env);
    if (!site) return jsonResponse({ error: "Сайт не знайдено або немає доступу" }, 404, corsHeaders);

    const { runId, subscriptionId } = await ensureAgentRun("rank", site.organization_id, siteId, env);

    const trackedResult = await selectRows<TrackedQueryRow>(
      "rank_tracked_queries",
      `select=query&site_id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const trackedQueries = trackedResult.data;

    if (trackedQueries.length === 0) {
      const summary = "Немає відстежуваних запитів — додайте їх у розділі Rank.";
      await finishAgentRun(runId, subscriptionId, "done", summary, [], env);
      return jsonResponse({ run_id: runId, summary, changes: [] }, 200, corsHeaders);
    }

    const metricsResult = await selectRows<GscMetricRow>(
      "gsc_metrics",
      `select=query,date,average_position&site_id=eq.${encodeURIComponent(siteId)}&query=not.is.null&order=date.desc&limit=500`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const trackedSet = new Set(trackedQueries.map(t => t.query));
    const byQuery = new Map<string, GscMetricRow[]>();
    for (const m of metricsResult.data) {
      if (!trackedSet.has(m.query)) continue;
      if (!byQuery.has(m.query)) byQuery.set(m.query, []);
      byQuery.get(m.query)!.push(m);
    }

    const changes: Array<{ query: string; current: number | null; previous: number | null; delta: number | null }> = [];
    for (const [query, points] of byQuery) {
      const sorted = points.sort((a, b) => b.date.localeCompare(a.date));
      const current = sorted[0]?.average_position ?? null;
      const weekAgo = sorted.find(p => p.date <= sorted[0].date.slice(0, 8) + "01") ?? sorted[sorted.length - 1];
      const previous = weekAgo?.average_position ?? null;
      const delta = current !== null && previous !== null ? Number((previous - current).toFixed(1)) : null; // позитивне = покращення (менша позиція)
      changes.push({ query, current, previous, delta });
    }

    const improved = changes.filter(c => (c.delta ?? 0) > 0.5).length;
    const worsened = changes.filter(c => (c.delta ?? 0) < -0.5).length;
    const summary = `Відстежується ${changes.length} запитів: ${improved} покращились, ${worsened} погіршились.`;

    await finishAgentRun(runId, subscriptionId, "done", summary, changes, env);

    return jsonResponse({ run_id: runId, summary, changes }, 200, corsHeaders);
  } catch (err) {
    console.error("[agents] run rank unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

export async function handleRunContentAgentRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    let body: { site_id?: string };
    try {
      body = (await request.json()) as { site_id?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }
    const siteId = body.site_id;
    if (!siteId) return jsonResponse({ error: "site_id обов'язковий" }, 400, corsHeaders);

    const site = await resolveSiteAccess(siteId, userId, env);
    if (!site) return jsonResponse({ error: "Сайт не знайдено або немає доступу" }, 404, corsHeaders);

    const result = await runContentAgentCore(site, env);
    if ("error" in result) return jsonResponse({ error: result.error }, result.status, corsHeaders);
    return jsonResponse(result.body, 200, corsHeaders);
  } catch (err) {
    console.error("[agents] run content unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── Core-логіка content-агента, винесена окремо (Automations,
// EXECUTION_PLAN.md — шостий UI-крок хвилі 3) ───────────────────
// HTTP-хендлер вище викликає це ПІСЛЯ auth/membership-перевірок.
// Cron-обробник (runDueAgentAutomations у index.ts) викликає
// напряму — там немає JWT/HTTP-запиту взагалі (service-role
// контекст, той самий принцип, що вся решта cron-задач проєкту:
// Worker сам собі довіряє, авторизація перевіряється лише на межі
// HTTP API, не всередині фонових задач).

type ContentAgentResult =
  | { error: string; status: number }
  | { body: { message: string; generated: [] } }
  | { body: { run_id: string; summary: string; generated: Array<{ page_url: string; kind: GenerationKind; output: string }>; credits_remaining: number } };

async function runContentAgentCore(site: SiteRow, env: Env): Promise<ContentAgentResult> {
  const siteId = site.id;

  // ── Перевіряємо кредити ДО важкої роботи ──────────────────
  // aiCredits.ts (спільний helper) — безлімітні кредити для
  // адмінської організації. Для unlimited=true поріг MAX_PAGES_PER_RUN
  // лишається (це ліміт "сторінок за один запуск", не кредитний ліміт
  // сам собою) — просто не звужується додатково залишком кредитів.
  const creditsCheck = await checkAiCredits(site.organization_id, "business", env);
  if (!creditsCheck.ok) {
    if (creditsCheck.disabledByAdmin) {
      return { error: "AI тимчасово вимкнено адміністратором платформи.", status: 503 };
    }
    return { error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу.", status: 402 };
  }
  let creditsRemaining = creditsCheck.creditsRemaining;
  const initialCreditsRemaining = creditsRemaining; // незмінне значення для коректного deductAiCredits нижче

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return { error: "AI не налаштований", status: 503 };

  const auditsResult = await selectRows<SeoAuditRow>(
    "page_seo_audits",
    `select=page_url,title,meta_description,issues&site_id=eq.${encodeURIComponent(siteId)}&order=checked_at.desc&limit=30`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const problematicPages = auditsResult.data
    .filter((a) => a.issues.some((issue) => issue.includes("title") || issue.includes("Title") || issue.includes("meta description") || issue.includes("Meta description")))
    .slice(0, creditsCheck.unlimited ? MAX_PAGES_PER_RUN : Math.min(MAX_PAGES_PER_RUN, creditsRemaining));

  if (problematicPages.length === 0) {
    return { body: { message: "Проблемних сторінок з title/meta description не знайдено — усе гаразд!", generated: [] } };
  }

  // ── Забезпечуємо agent_subscriptions (потрібен FK для agent_runs) ──
  const subResult = await selectRows<{ id: string }>(
    "agent_subscriptions",
    `select=id&organization_id=eq.${encodeURIComponent(site.organization_id)}&agent_id=eq.content&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  let subscriptionId = subResult.data[0]?.id;
  if (!subscriptionId) {
    subscriptionId = crypto.randomUUID();
    await insertRow(
      "agent_subscriptions",
      {
        id: subscriptionId,
        organization_id: site.organization_id,
        agent_id: "content",
        site_id: siteId,
        is_enabled: true,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  // ── Створюємо agent_run ─────────────────────────────────────
  const runId = crypto.randomUUID();
  await insertRow(
    "agent_runs",
    {
      id: runId,
      agent_subscription_id: subscriptionId,
      organization_id: site.organization_id,
      status: "running",
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  // ── Створюємо задачу в Tasks (taskHandler.ts) — так вкладка
  // Tasks одразу показує роботу агента, а не лише ручні задачі ──
  const taskId = await createAgentTask(
    site.organization_id,
    "content",
    `Content-агент: генерація SEO для ${site.display_name}`,
    env
  );

  // ── Генеруємо по кожній проблемній сторінці ─────────────────
  const generated: Array<{ page_url: string; kind: GenerationKind; output: string }> = [];
  let creditsSpent = 0;

  for (const page of problematicPages) {
    const needsTitle = page.issues.some((i) => i.toLowerCase().includes("title"));
    const kind: GenerationKind = needsTitle ? "title" : "meta_description";

    const prompt = buildPrompt(kind, `Сторінка ${page.page_url} сайту ${site.display_name} (${site.url})`, undefined, undefined);
    const result = await callGemini(prompt, apiKey);

    if (!result.ok) {
      console.error(`[agent:content] generation failed for ${page.page_url}:`, result.error);
      continue; // пропускаємо цю сторінку, продовжуємо з рештою
    }

    await insertRow(
      "ai_generations",
      {
        organization_id: site.organization_id,
        site_id: siteId,
        kind,
        prompt_input: { topic: page.page_url, source: "agent:content" },
        output: result.text,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    await insertRow(
      "agent_action_log",
      {
        agent_run_id: runId,
        action_type: `generated_${kind}`,
        target_table: "ai_generations",
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    generated.push({ page_url: page.page_url, kind, output: result.text });
    creditsSpent += 1;
    creditsRemaining -= 1;
  }

  // ── Списуємо кредити і закриваємо run ───────────────────────
  // deductAiCredits — no-op для unlimited=true (адмінська організація).
  // creditsRemaining в пам'яті (для відповіді) лишається пораховане
  // циклом вище (initialCreditsRemaining - creditsSpent), запис у
  // ai_credits вважає з того самого initialCreditsRemaining.
  if (creditsSpent > 0) {
    await deductAiCredits(site.organization_id, initialCreditsRemaining, creditsCheck.unlimited, env, creditsSpent);
  }

  const summary = `Згенеровано ${generated.length} з ${problematicPages.length} пропозицій для сторінок з проблемами SEO.`;
  const finalStatus = generated.length > 0 ? "done" : "failed";

  await updateRows(
    "agent_runs",
    `id=eq.${encodeURIComponent(runId)}`,
    {
      status: finalStatus,
      credits_spent: creditsSpent,
      summary,
      raw_output: generated,
      finished_at: new Date().toISOString(),
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (taskId) {
    await finishAgentTask(taskId, finalStatus, runId, env);
  }

  await updateRows(
    "agent_subscriptions",
    `id=eq.${encodeURIComponent(subscriptionId)}`,
    { last_run_at: new Date().toISOString() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return { body: { run_id: runId, summary, generated, credits_remaining: creditsRemaining } };
}

// ─── GET /api/agents/subscriptions?organization_id=... ──────────
// Список автоматизацій (agent_subscriptions) для вкладки Automations —
// приєднує назву сайту, щоб не робити другий запит на фронтенді.

interface SubscriptionListRow {
  id: string;
  agent_id: string;
  site_id: string | null;
  schedule_cron: string | null;
  is_enabled: boolean;
  last_run_at: string | null;
}

export async function handleAgentSubscriptionsListRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const url = new URL(request.url);
    const organizationId = url.searchParams.get("organization_id");
    if (!organizationId) return jsonResponse({ error: "organization_id обов'язковий" }, 400, corsHeaders);

    const memberCheck = await selectRows<{ role: string }>(
      "organization_members",
      `select=role&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(userId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    const subsRes = await selectRows<SubscriptionListRow>(
      "agent_subscriptions",
      `select=id,agent_id,site_id,schedule_cron,is_enabled,last_run_at&organization_id=eq.${encodeURIComponent(organizationId)}&schedule_cron=not.is.null&order=created_at.desc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    return jsonResponse({ subscriptions: subsRes.data ?? [] }, 200, corsHeaders);
  } catch (err) {
    console.error("[automations] list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── POST /api/agents/subscriptions ── body: { site_id, schedule_cron: 'daily'|'weekly' }
// Створює/оновлює розклад для content-агента на конкретному сайті.
// upsert-подібна поведінка (унікальний індекс organization_id+agent_id+
// site_id в схемі 0049) — якщо підписка вже є (напр. після ручного
// запуску агента), оновлюємо schedule_cron замість insert-конфлікту.

export async function handleAgentSubscriptionUpsertRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    let body: { site_id?: string; schedule_cron?: string };
    try {
      body = (await request.json()) as { site_id?: string; schedule_cron?: string };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }

    const siteId = body.site_id;
    if (!siteId) return jsonResponse({ error: "site_id обов'язковий" }, 400, corsHeaders);
    if (!body.schedule_cron || !SCHEDULE_INTERVALS_MS[body.schedule_cron]) {
      return jsonResponse({ error: `schedule_cron має бути одним з: ${Object.keys(SCHEDULE_INTERVALS_MS).join(", ")}` }, 400, corsHeaders);
    }

    const siteResult = await selectRows<SiteRow>(
      "sites",
      `select=id,organization_id&id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const site = siteResult.data[0];
    if (!site) return jsonResponse({ error: "Сайт не знайдено" }, 404, corsHeaders);

    const memberCheck = await selectRows<{ role: string }>(
      "organization_members",
      `select=role&organization_id=eq.${encodeURIComponent(site.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    const existingRes = await selectRows<{ id: string }>(
      "agent_subscriptions",
      `select=id&organization_id=eq.${encodeURIComponent(site.organization_id)}&agent_id=eq.content&site_id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (existingRes.data[0]) {
      const updateRes = await updateRows(
        "agent_subscriptions",
        `id=eq.${encodeURIComponent(existingRes.data[0].id)}`,
        { schedule_cron: body.schedule_cron, is_enabled: true },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (!updateRes.ok) return jsonResponse({ error: updateRes.error }, 500, corsHeaders);
    } else {
      const insertRes = await insertRow(
        "agent_subscriptions",
        {
          id: crypto.randomUUID(),
          organization_id: site.organization_id,
          agent_id: "content",
          site_id: siteId,
          schedule_cron: body.schedule_cron,
          is_enabled: true,
        },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (!insertRes.ok) return jsonResponse({ error: insertRes.error }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[automations] upsert unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── PATCH /api/agents/subscriptions/:id ── body: { organization_id, is_enabled }
// Увімкнути/вимкнути автоматизацію без видалення розкладу.

export async function handleAgentSubscriptionToggleRequest(
  request: Request,
  env: Env,
  origin: string | null,
  subscriptionId: string,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const userId = await authenticate(request, env);
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    let body: { organization_id?: string; is_enabled?: boolean };
    try {
      body = (await request.json()) as { organization_id?: string; is_enabled?: boolean };
    } catch {
      return jsonResponse({ error: "Невірний формат запиту" }, 400, corsHeaders);
    }
    if (!body.organization_id) return jsonResponse({ error: "organization_id обов'язковий" }, 400, corsHeaders);
    if (typeof body.is_enabled !== "boolean") return jsonResponse({ error: "is_enabled обов'язковий" }, 400, corsHeaders);

    const memberCheck = await selectRows<{ role: string }>(
      "organization_members",
      `select=role&organization_id=eq.${encodeURIComponent(body.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    // Ownership verification (SECURITY.md розділ 5) — subscriptionId
    // дійсно належить organization_id з тіла запиту, не тільки те,
    // що юзер має доступ до цієї організації взагалі.
    const subRes = await selectRows<{ id: string }>(
      "agent_subscriptions",
      `select=id&id=eq.${encodeURIComponent(subscriptionId)}&organization_id=eq.${encodeURIComponent(body.organization_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!subRes.data[0]) return jsonResponse({ error: "Автоматизацію не знайдено" }, 404, corsHeaders);

    const updateRes = await updateRows(
      "agent_subscriptions",
      `id=eq.${encodeURIComponent(subscriptionId)}`,
      { is_enabled: body.is_enabled },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!updateRes.ok) return jsonResponse({ error: updateRes.error }, 500, corsHeaders);

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[automations] toggle unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── Helpers ─────────────────────────────────────────────────

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ─── Automations: автозапуск за розкладом (Qorax AI хаб, шостий
// UI-крок хвилі 3) ───────────────────────────────────────────
//
// agent_subscriptions.schedule_cron — НЕ повноцінний cron-вираз
// (парсер cron у Worker — зайва складність для MVP, коли єдиний
// реалізований агент 'content' і єдина реалістична частота запуску
// раз на день/тиждень). Замість цього — прості текстові пресети:
// 'daily' | 'weekly' — перевіряються через порівняння з last_run_at,
// не через парсинг cron-синтаксису. Якщо в майбутньому знадобиться
// довільний розклад — це переписування SCHEDULE_INTERVALS_MS на
// справжній cron-parser, без зміни решти логіки нижче.

const SCHEDULE_INTERVALS_MS: Record<string, number> = {
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
};

interface DueSubscriptionRow {
  id: string;
  organization_id: string;
  agent_id: string;
  site_id: string | null;
  schedule_cron: string | null;
  last_run_at: string | null;
}

export interface AutomationsRunSummary {
  checked: number;
  triggered: number;
  skipped_no_credits: number;
  failed: number;
}

/**
 * Викликається з scheduled()-диспетчера (index.ts) за окремим
 * cron-тригером (Cloudflare Dashboard, той самий ручний процес, що
 * для решти задач). Читає agent_subscriptions з is_enabled=true і
 * schedule_cron не null, порівнює last_run_at з відповідним
 * інтервалом — якщо час настав (чи ще не запускались), запускає
 * runContentAgentCore(). Лише agent_id='content' підтримується —
 * єдиний реалізований агент (як і скрізь у agentHandler.ts).
 */
export async function runDueAgentAutomations(env: Env): Promise<AutomationsRunSummary> {
  const summary: AutomationsRunSummary = { checked: 0, triggered: 0, skipped_no_credits: 0, failed: 0 };

  const dueRes = await selectRows<DueSubscriptionRow>(
    "agent_subscriptions",
    `select=id,organization_id,agent_id,site_id,schedule_cron,last_run_at&is_enabled=eq.true&schedule_cron=not.is.null&agent_id=eq.content&site_id=not.is.null`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!dueRes.ok || !dueRes.data?.length) return summary;

  summary.checked = dueRes.data.length;
  const now = Date.now();

  for (const sub of dueRes.data) {
    const intervalMs = SCHEDULE_INTERVALS_MS[sub.schedule_cron ?? ""];
    if (!intervalMs) continue; // невідомий пресет — пропускаємо, не падаємо

    const lastRunMs = sub.last_run_at ? new Date(sub.last_run_at).getTime() : 0;
    if (now - lastRunMs < intervalMs) continue; // ще не час

    if (!sub.site_id) continue; // TypeScript guard (запит вище вже фільтрує not null)

    try {
      const siteRes = await selectRows<SiteRow>(
        "sites",
        `select=id,url,display_name,organization_id&id=eq.${encodeURIComponent(sub.site_id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const site = siteRes.data[0];
      if (!site) continue;

      const result = await runContentAgentCore(site, env);
      if ("error" in result) {
        if (result.status === 402) summary.skipped_no_credits++;
        else summary.failed++;
        continue;
      }
      summary.triggered++;
    } catch (err) {
      console.error("[automations] failed for subscription", sub.id, err);
      summary.failed++;
    }
  }

  return summary;
}
