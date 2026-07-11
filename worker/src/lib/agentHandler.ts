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

    const siteResult = await selectRows<SiteRow>(
      "sites",
      `select=id,url,display_name,organization_id&id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const site = siteResult.data[0];
    if (!site) return jsonResponse({ error: "Сайт не знайдено" }, 404, corsHeaders);

    const memberCheck = await selectRows<{ organization_id: string; role: string }>(
      "organization_members",
      `select=organization_id,role&organization_id=eq.${encodeURIComponent(site.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    // ── Перевіряємо кредити ДО важкої роботи ──────────────────
    const creditsResult = await selectRows<{ credits_remaining: number }>(
      "ai_credits",
      `select=credits_remaining&organization_id=eq.${encodeURIComponent(site.organization_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    let creditsRemaining = creditsResult.data[0]?.credits_remaining ?? 0;
    if (creditsRemaining <= 0) {
      return jsonResponse(
        { error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." },
        402,
        corsHeaders
      );
    }

    const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
    if (!apiKey) return jsonResponse({ error: "AI не налаштований" }, 503, corsHeaders);

    // ── Знаходимо проблемні сторінки (найновіший аудит на кожен
    // page_url — беремо просто найновіші N записів, без групування,
    // той самий спрощений підхід, що вже прийнятний в інших частинах
    // проєкту для MVP-функціоналу) ──────────────────────────────
    const auditsResult = await selectRows<SeoAuditRow>(
      "page_seo_audits",
      `select=page_url,title,meta_description,issues&site_id=eq.${encodeURIComponent(siteId)}&order=checked_at.desc&limit=30`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    const problematicPages = auditsResult.data
      .filter((a) => a.issues.some((issue) => issue.includes("title") || issue.includes("Title") || issue.includes("meta description") || issue.includes("Meta description")))
      .slice(0, Math.min(MAX_PAGES_PER_RUN, creditsRemaining));

    if (problematicPages.length === 0) {
      return jsonResponse(
        { message: "Проблемних сторінок з title/meta description не знайдено — усе гаразд!", generated: [] },
        200,
        corsHeaders
      );
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
    if (creditsSpent > 0) {
      await updateRows(
        "ai_credits",
        `organization_id=eq.${encodeURIComponent(site.organization_id)}`,
        { credits_remaining: creditsRemaining },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
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

    return jsonResponse(
      { run_id: runId, summary, generated, credits_remaining: creditsRemaining },
      200,
      corsHeaders
    );
  } catch (err) {
    console.error("[agents] run content unhandled error:", err instanceof Error ? err.message : err);
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
