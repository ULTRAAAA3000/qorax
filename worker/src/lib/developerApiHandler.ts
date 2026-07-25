// ============================================================
// developerApiHandler.ts — публічна Qorax SEO Platform (Developer
// API): POST /api/v1/audit (SEO Audit API), POST /api/v1/schema
// (Schema API), POST /api/v1/report (Reporting API).
//
// Узгоджено з Артемом: AI SEO API свідомо НЕ робимо (достатнє
// AI-навантаження вже є на платформі) — Reporting API обрано третім
// замість нього. Monitoring API — не цей прохід.
//
// SEO Audit API переюзує те саме ядро, що вже живить безкоштовний
// lead-magnet аудит на лендінгу (/api/audit,
// index.ts::handleAuditRequest) — runBasicCheck + runPageSpeedChecks,
// БЕЗ AI-аналізу.
//
// Schema API переюзує schemaGenerator.ts — чисті функції генерації
// JSON-LD, без Gemini.
//
// Reporting API переюзує ТЕ САМЕ ядро, що SEO Audit API (не
// pdfReport.ts — той вимагає місячної історії моніторингу власних
// сайтів Qorax, якої немає для довільного зовнішнього URL) —
// developerReportGenerator.ts будує HTML/print-ready PDF-звіт прямо
// з результату одного аудиту.
//
// На відміну від /api/audit (rate-limit по IP, для анонімного
// лендінг-трафіку), тут авторизація через API-ключ
// (developerApiAuth.ts) і місячний ліміт запитів на organization —
// УСІ ТРИ ендпоінти витрачають з того самого developer_api_keys.
// requests_limit пулу (не окремі ліміти на кожен API).
// ============================================================

import { json } from "./httpUtils";
import { normalizeAndValidateUrl } from "./url";
import { runBasicCheck } from "./basicCheck";
import { runPageSpeedChecks } from "./pageSpeed";
import { validateAndConsumeApiKey, logApiRequest } from "./developerApiAuth";
import { generateSchema } from "./schemaGenerator";
import { generateDeveloperReportHtml, type DeveloperReportInput } from "./developerReportGenerator";
import type { Env } from "../types";

// Спільний для обох ендпоінтів — серверний виклик стороннього
// backend'у, не браузерний fetch з довільного сайту, тому
// origin-allowlist (corsHeaders() з cors.ts) тут не застосовний.
const DEVELOPER_API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

interface AuditV1RequestBody {
  url?: unknown;
}

/**
 * Спільне ядро для /api/v1/audit і /api/v1/report — обидва
 * ендпоінти запускають однаковий аудит (runBasicCheck +
 * runPageSpeedChecks), відрізняється лише подання результату
 * (JSON напряму проти вбудовування в HTML-звіт). Винесено в окрему
 * функцію, щоб не дублювати виклик Promise.all + обробку
 * unreachable-кейсу двічі.
 */
async function runAuditCoreForUrl(
  url: string,
  env: Env
): Promise<{ reachable: false; errorMessage: string | null } | { reachable: true; result: DeveloperReportInput }> {
  const [basic, pageSpeed] = await Promise.all([
    runBasicCheck(url),
    runPageSpeedChecks(url, env.GOOGLE_PAGESPEED_API_KEY),
  ]);

  if (!basic.reachable) {
    return { reachable: false, errorMessage: basic.errorMessage ?? "Сайт недоступний" };
  }

  return {
    reachable: true,
    result: {
      url,
      reachable: true,
      httpStatus: basic.httpStatus,
      responseTimeMs: basic.responseTimeMs,
      sslValid: basic.sslValid,
      pageSizeKb: basic.pageSizeKb,
      meta: {
        title: basic.title,
        titleLength: basic.titleLength,
        metaDescription: basic.metaDescription,
        metaDescriptionLength: basic.metaDescriptionLength,
        hasViewportMeta: basic.hasViewportMeta,
        hasH1: basic.hasH1,
        h1Count: basic.h1Count,
      },
      pageSpeed: {
        mobile: { performanceScore: pageSpeed.mobile.performanceScore },
        desktop: { performanceScore: pageSpeed.desktop.performanceScore },
      },
      generatedAt: new Date().toISOString(),
    },
  };
}

export async function handleDeveloperAuditV1(
  request: Request,
  env: Env
): Promise<Response> {
  const corsHeaders = DEVELOPER_API_CORS_HEADERS;

  const auth = await validateAndConsumeApiKey(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status ?? 401, corsHeaders);
  }

  let body: AuditV1RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту, очікується JSON" }, 400, corsHeaders);
  }

  if (typeof body.url !== "string" || !body.url) {
    return json({ error: "Поле url обов'язкове" }, 400, corsHeaders);
  }

  const validation = normalizeAndValidateUrl(body.url);
  if (!validation.ok) {
    await logApiRequest(auth.apiKeyId!, "/api/v1/audit", body.url, 400, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json({ error: validation.error }, 400, corsHeaders);
  }

  const audit = await runAuditCoreForUrl(validation.url, env);

  if (!audit.reachable) {
    await logApiRequest(auth.apiKeyId!, "/api/v1/audit", validation.url, 200, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json({ url: validation.url, reachable: false, error: audit.errorMessage }, 200, corsHeaders);
  }

  await logApiRequest(auth.apiKeyId!, "/api/v1/audit", validation.url, 200, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  return json(
    audit.result,
    200,
    corsHeaders
  );
}

interface SchemaV1RequestBody {
  type?: unknown;
  fields?: unknown;
}

/**
 * POST /api/v1/schema — Qorax Schema API. Приймає { type, fields },
 * повертає готовий JSON-LD (як об'єкт `jsonLd` і як рядок
 * `scriptTag`, готовий для вставки прямо в <head> сторінки).
 * Чиста шаблонізація (schemaGenerator.ts) — жодного Gemini-виклику,
 * тому відповідь миттєва й не залежить від зовнішнього AI-провайдера.
 */
export async function handleDeveloperSchemaV1(
  request: Request,
  env: Env
): Promise<Response> {
  const corsHeaders = DEVELOPER_API_CORS_HEADERS;

  const auth = await validateAndConsumeApiKey(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status ?? 401, corsHeaders);
  }

  let body: SchemaV1RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту, очікується JSON" }, 400, corsHeaders);
  }

  if (typeof body.type !== "string" || !body.type) {
    return json({ error: "Поле type обов'язкове (Organization/Product/FAQPage/LocalBusiness/BreadcrumbList/Article/Event/Person)" }, 400, corsHeaders);
  }
  if (typeof body.fields !== "object" || body.fields === null || Array.isArray(body.fields)) {
    return json({ error: "Поле fields обов'язкове й має бути об'єктом" }, 400, corsHeaders);
  }

  const result = generateSchema(body.type, body.fields as Record<string, unknown>);

  await logApiRequest(auth.apiKeyId!, "/api/v1/schema", null, result.ok ? 200 : 400, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (!result.ok) {
    return json({ error: result.error }, 400, corsHeaders);
  }

  return json({ type: body.type, jsonLd: result.jsonLd, scriptTag: result.scriptTag }, 200, corsHeaders);
}

interface ReportV1RequestBody {
  url?: unknown;
  format?: unknown; // "json" | "html" (default "json")
}

/**
 * POST /api/v1/report — Qorax Reporting API. Запускає той самий
 * аудит, що /api/v1/audit (runAuditCoreForUrl), і повертає або сирі
 * JSON-дані (той самий формат, що /api/v1/audit — за замовчуванням,
 * `format: "json"`), або готовий HTML-звіт (`format: "html"`) —
 * фірмовий Cyber Minimal стиль з кнопкою "Зберегти як PDF"
 * (window.print(), той самий підхід, що внутрішній pdfReport.ts,
 * оскільки Cloudflare Workers не має headless-браузера для
 * справжнього server-side PDF рендерингу).
 */
export async function handleDeveloperReportV1(
  request: Request,
  env: Env
): Promise<Response> {
  const corsHeaders = DEVELOPER_API_CORS_HEADERS;

  const auth = await validateAndConsumeApiKey(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) {
    return json({ error: auth.error }, auth.status ?? 401, corsHeaders);
  }

  let body: ReportV1RequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту, очікується JSON" }, 400, corsHeaders);
  }

  if (typeof body.url !== "string" || !body.url) {
    return json({ error: "Поле url обов'язкове" }, 400, corsHeaders);
  }
  const format = body.format === "html" ? "html" : "json";

  const validation = normalizeAndValidateUrl(body.url);
  if (!validation.ok) {
    await logApiRequest(auth.apiKeyId!, "/api/v1/report", body.url, 400, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json({ error: validation.error }, 400, corsHeaders);
  }

  const audit = await runAuditCoreForUrl(validation.url, env);

  if (!audit.reachable) {
    await logApiRequest(auth.apiKeyId!, "/api/v1/report", validation.url, 200, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json({ url: validation.url, reachable: false, error: audit.errorMessage }, 200, corsHeaders);
  }

  await logApiRequest(auth.apiKeyId!, "/api/v1/report", validation.url, 200, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (format === "html") {
    const html = generateDeveloperReportHtml(audit.result);
    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders },
    });
  }

  return json(audit.result, 200, corsHeaders);
}
