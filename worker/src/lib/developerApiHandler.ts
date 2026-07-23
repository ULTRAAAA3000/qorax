// ============================================================
// developerApiHandler.ts — публічна Qorax SEO Platform (Developer
// API): POST /api/v1/audit (SEO Audit API) і POST /api/v1/schema
// (Schema API).
//
// Узгоджено з Артемом: перший API — SEO Audit (MVP фундаменту).
// Другий — Schema API, СВІДОМО без AI (чиста шаблонізація за
// структурованими полями, не за довільним описом бізнесу мовою) —
// на відміну від майбутнього AI SEO API, де Gemini аналізує HTML і
// сам пропонує зміни. AI SEO/Monitoring/Reporting — не цей прохід.
//
// SEO Audit API переюзує те саме ядро, що вже живить безкоштовний
// lead-magnet аудит на лендінгу (/api/audit,
// index.ts::handleAuditRequest) — runBasicCheck + runPageSpeedChecks,
// БЕЗ AI-аналізу (runAiAnalysis коштує Gemini-виклик).
//
// Schema API переюзує schemaGenerator.ts — чисті функції генерації
// JSON-LD, без залежності від Gemini чи будь-якого зовнішнього
// сервісу (миттєва відповідь, немає ризику rate-limit стороннього
// API чи непередбачуваної вартості на відміну від AI-based
// ендпоінтів).
//
// На відміну від /api/audit (rate-limit по IP, для анонімного
// лендінг-трафіку), тут авторизація через API-ключ
// (developerApiAuth.ts) і місячний ліміт запитів на organization —
// ОБИДВА ендпоінти витрачають з того самого developer_api_keys.
// requests_limit пулу (не окремі ліміти на кожен API).
// ============================================================

import { json } from "./httpUtils";
import { normalizeAndValidateUrl } from "./url";
import { runBasicCheck } from "./basicCheck";
import { runPageSpeedChecks } from "./pageSpeed";
import { validateAndConsumeApiKey, logApiRequest } from "./developerApiAuth";
import { generateSchema } from "./schemaGenerator";
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

  const [basic, pageSpeed] = await Promise.all([
    runBasicCheck(validation.url),
    runPageSpeedChecks(validation.url, env.GOOGLE_PAGESPEED_API_KEY),
  ]);

  if (!basic.reachable) {
    await logApiRequest(auth.apiKeyId!, "/api/v1/audit", validation.url, 200, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json(
      { url: validation.url, reachable: false, error: basic.errorMessage ?? "Сайт недоступний" },
      200,
      corsHeaders
    );
  }

  await logApiRequest(auth.apiKeyId!, "/api/v1/audit", validation.url, 200, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  return json(
    {
      url: validation.url,
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
    },
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
