// ============================================================
// translatorHandler.ts — Translator-модуль (MODULE_ROADMAP.md
// розділ 5; EXECUTION_PLAN.md Фаза 3.2). Пряме продовження
// Sites-конструктора — усі функції прив'язані до project_id/
// project_page_id, НЕ site_id (0060_translator_module.sql,
// відхилення від чернетки roadmap задокументоване там явно).
//
// AI-переклад переюзовує callGemini() з contentGeneration.ts
// (retry-on-429/503, timeout) — той самий підхід, що agentHandler.ts
// вже застосовує ("переюзовує buildPrompt/callGemini — не нову
// AI-інтеграцію"). buildPrompt() з contentGeneration.ts тут НЕ
// підходить напряму (жорстко прив'язаний до GenerationKind
// title/meta_description/faq/article_intro — генерація з нуля, не
// переклад) — власний buildTranslationPrompt(), як явно дозволяє
// коментар у roadmap ("різниця тільки в промпті").
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccessForProject } from "./orgAuth";
import { callGemini } from "./contentGeneration";
import { checkAiCredits, deductAiCredits } from "./aiCredits";

interface ProjectLanguageRow {
  id: string;
  project_id: string;
  locale: string;
  is_default: boolean;
  url_prefix: string | null;
  created_at: string;
}

interface PageTranslationRow {
  id: string;
  project_page_id: string;
  project_id: string;
  locale: string;
  title: string | null;
  description: string | null;
  og_title: string | null;
  og_description: string | null;
  content: { blocks?: unknown[] } | null;
  image_alt_overrides: Record<string, string> | null;
  status: string;
  translated_by: string;
  updated_at: string;
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

// PRICING.md Частина A/B: "кількість мов на сайт" — числа-заглушки,
// той самий принцип, що MONTHLY_POST_LIMIT_BY_PLAN у socialHandler.ts.
// Легасі-ключі лишені без змін (старі організації), нові {product}_
// {tier} ключі (0086) додано поруч — Translator концептуально
// частина Business (Sites-конструктор), тому мапиться на business_*
// коди, не на власну product-лінійку.
const MAX_LANGUAGES_BY_PLAN: Record<string, number> = {
  // легасі (до 0086)
  starter: 1, // тільки дефолтна мова, без реального перекладу
  growth: 2,
  agency: 5,
  admin: 99,
  trial: 1,
  // нова лінійка Business (0086)
  business_free: 1,
  business_starter: 2,
  business_pro: 5,
  business_agency: 10,
};

async function getPlanCode(organizationId: string, env: Env): Promise<string> {
  const res = await selectRows<{ status: string; plans: { code: string } }>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  // Фолбек business_free (не легасі "starter") — 0086: кожна
  // організація тепер завжди має якийсь business_* рядок в
  // subscriptions (навіть щойно зареєстрована, одразу Free), тому
  // "немає підписки взагалі" реалістичніше мапити на найнижчий
  // рівень, не на платний Starter за замовчуванням.
  return (res.data?.[0]?.plans as { code: string } | null)?.code ?? "business_free";
}

// ── GET /api/projects/:id/languages ── список підключених мов

export async function handleProjectLanguagesList(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<ProjectLanguageRow>(
    "project_languages",
    `select=id,project_id,locale,is_default,url_prefix,created_at&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ languages: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/projects/:id/languages ── body: { locale, url_prefix? }

export async function handleProjectLanguageCreate(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { locale?: string; url_prefix?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const locale = body.locale?.trim().toLowerCase();
  if (!locale || !/^[a-z]{2}(-[a-z]{2})?$/.test(locale)) {
    return json({ error: "Некоректний код мови (напр. 'en', 'de', 'pt-br')" }, 400, corsHeaders);
  }

  // Ліміт мов по тарифу (PRICING.md розділ 4) — перевіряється ДО insert
  const existingRes = await selectRows<{ id: string }>(
    "project_languages",
    `select=id&project_id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const currentCount = existingRes.data?.length ?? 0;
  const planCode = await getPlanCode(access.organizationId!, env);
  const limit = MAX_LANGUAGES_BY_PLAN[planCode] ?? MAX_LANGUAGES_BY_PLAN.business_free;
  if (currentCount >= limit) {
    return json({ error: `Ліміт мов вичерпано (${limit} на тарифі ${planCode}). Оновіть тариф для більшої кількості.` }, 402, corsHeaders);
  }

  const insertRes = await insertRow(
    "project_languages",
    { project_id: projectId, locale, url_prefix: body.url_prefix?.trim() || `/${locale}`, is_default: currentCount === 0 },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error?.includes("duplicate") ? "Ця мова вже додана" : insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── DELETE /api/projects/:id/languages/:languageId ── admin+ (той самий рівень, що project_languages_delete_own_org policy)

export async function handleProjectLanguageDelete(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string, languageId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "admin", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const deleteResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/project_languages?id=eq.${encodeURIComponent(languageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!deleteResp.ok) return json({ error: `Delete failed: ${deleteResp.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/projects/:id/translations?locale=... ── переклади проекту (опційний фільтр)

export async function handleTranslationsList(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const url = new URL(request.url);
  const localeFilter = url.searchParams.get("locale");
  let query = `select=id,project_page_id,project_id,locale,title,description,og_title,og_description,status,translated_by,updated_at&project_id=eq.${encodeURIComponent(projectId)}&order=updated_at.desc`;
  if (localeFilter) query += `&locale=eq.${encodeURIComponent(localeFilter)}`;

  const res = await selectRows<PageTranslationRow>("page_translations", query, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ translations: res.data ?? [] }, 200, corsHeaders);
}

// ── Промпт для перекладу — не буквальний переклад, а SEO-адаптація
// (roadmap Крок 2: "не дослівний переклад, а SEO-адаптація title/
// description під мовний ринок")

const LOCALE_NAMES: Record<string, string> = {
  en: "англійську", de: "німецьку", fr: "французьку", es: "іспанську",
  pl: "польську", it: "італійську", pt: "португальську", nl: "нідерландську",
  ru: "російську", tr: "турецьку", ar: "арабську", zh: "китайську", ja: "японську",
};

function buildTranslationPrompt(locale: string, title: string, description: string): string {
  const localeName = LOCALE_NAMES[locale] ?? locale;
  return `Ти — SEO-перекладач, який адаптує title і meta description сторінки під ${localeName} мовний ринок.

ВАЖЛИВО: це НЕ дослівний переклад. Адаптуй текст так, щоб він звучав природно для носія мови і був оптимізований під пошукові звички саме цього ринку — зберігай зміст, але формулюй як писав би носій мови, а не перекладач.

Оригінальний title: ${title || "(немає)"}
Оригінальний description: ${description || "(немає)"}

Поверни РІВНО у форматі (без пояснень, без preamble):
TITLE: <адаптований title, 50-60 символів>
DESCRIPTION: <адаптований description, 120-160 символів>`;
}

function parseTranslationResponse(text: string): { title: string; description: string } {
  const titleMatch = text.match(/TITLE:\s*(.+)/i);
  const descMatch = text.match(/DESCRIPTION:\s*(.+)/i);
  return {
    title: titleMatch?.[1]?.trim() ?? "",
    description: descMatch?.[1]?.trim() ?? "",
  };
}

// ── POST /api/projects/:id/translate ── body: { project_page_id, locale }
// Генерує переклад title/description через AI, пише в page_translations
// зі статусом 'draft'. Списує ai_credits — той самий пул, що AI/Content
// і Social (PRICING.md розділ 5: "єдиний пул кредитів").

export async function handleTranslate(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { project_page_id?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const pageId = body.project_page_id;
  const locale = body.locale?.trim().toLowerCase();
  if (!pageId || !locale) return json({ error: "project_page_id і locale обов'язкові" }, 400, corsHeaders);

  // Мова має бути підключена до проекту ДО перекладу
  const langRes = await selectRows<{ id: string }>(
    "project_languages",
    `select=id&project_id=eq.${encodeURIComponent(projectId)}&locale=eq.${encodeURIComponent(locale)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!langRes.data?.[0]) return json({ error: "Спочатку додайте цю мову до проекту" }, 400, corsHeaders);

  const pageRes = await selectRows<{ id: string; seo_title: string | null; seo_description: string | null; content: unknown }>(
    "project_pages",
    `select=id,seo_title,seo_description,content&id=eq.${encodeURIComponent(pageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const page = pageRes.data?.[0];
  if (!page) return json({ error: "Сторінку не знайдено" }, 404, corsHeaders);

  // aiCredits.ts (спільний helper) — той самий credit-check, що
  // AI/Content і Social, з безлімітом для адмінської організації.
  const organizationId = access.organizationId!;
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

  const prompt = buildTranslationPrompt(locale, page.seo_title ?? "", page.seo_description ?? "");
  const result = await callGemini(prompt, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const { title, description } = parseTranslationResponse(result.text);
  if (!title && !description) return json({ error: "AI не повернув очікуваний формат — спробуйте ще раз" }, 502, corsHeaders);

  const creditsRemaining = await deductAiCredits(organizationId, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);

  // upsert через select-then-insert/update (не PostgREST on_conflict —
  // потрібно повернути id для UI, upsertRow() в supabase.ts повертає
  // тільки ok/error, того самого патерну, що croHandler.ts runCroAggregate)
  const existingRes = await selectRows<{ id: string }>(
    "page_translations",
    `select=id&project_page_id=eq.${encodeURIComponent(pageId)}&locale=eq.${encodeURIComponent(locale)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const existing = existingRes.data?.[0];

  const patch = { title, description, status: "draft", translated_by: "ai" };
  if (existing) {
    await updateRows("page_translations", `id=eq.${existing.id}`, patch, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  } else {
    await insertRow(
      "page_translations",
      { project_page_id: pageId, project_id: projectId, locale, ...patch },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return json({ ok: true, title, description, credits_remaining: creditsRemaining, unlimited: creditsCheck.unlimited }, 200, corsHeaders);
}

// ── PATCH /api/translations/:id ── ручне редагування, переставляє
// статус на 'reviewed' (roadmap Крок 2). requireOrgAccessForProject
// тут не підходить напряму (маємо тільки translation id, не project_id
// з URL) — дістаємо project_id з рядка перед перевіркою доступу.

export async function handleTranslationUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, translationId: string): Promise<Response> {
  const translationRes = await selectRows<{ project_id: string }>(
    "page_translations",
    `select=project_id&id=eq.${encodeURIComponent(translationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const projectId = translationRes.data?.[0]?.project_id;
  if (!projectId) return json({ error: "Переклад не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string; description?: string; og_title?: string; og_description?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = { status: "reviewed", translated_by: "manual" };
  if (typeof body.title === "string") patch.title = body.title.slice(0, 200);
  if (typeof body.description === "string") patch.description = body.description.slice(0, 500);
  if (typeof body.og_title === "string") patch.og_title = body.og_title.slice(0, 200);
  if (typeof body.og_description === "string") patch.og_description = body.og_description.slice(0, 500);

  const updateRes = await updateRows("page_translations", `id=eq.${encodeURIComponent(translationId)}`, patch, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}
