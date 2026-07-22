// ============================================================
// developerApiHandler.ts — POST /api/v1/audit, публічний Qorax
// SEO Audit API (MVP фундаменту "Qorax SEO Platform").
//
// Узгоджено з Артемом: лише SEO Audit API з п'яти запланованих
// (AI SEO/Schema/Monitoring/Reporting — не цей прохід). Переюзує
// те саме ядро, що вже живить безкоштовний lead-magnet аудит на
// лендінгу (/api/audit, index.ts::handleAuditRequest) —
// runBasicCheck + runPageSpeedChecks, БЕЗ AI-аналізу (runAiAnalysis
// коштує Gemini-виклик, для платного/лімітованого Developer API
// це окреме рішення на майбутнє — можна додати як платний "AI SEO
// API" пізніше, MVP повертає лише структуровані дані аудиту).
//
// На відміну від /api/audit (rate-limit по IP, для анонімного
// лендінг-трафіку), тут авторизація через API-ключ
// (developerApiAuth.ts) і місячний ліміт запитів на organization.
// ============================================================

import { json } from "./httpUtils";
import { normalizeAndValidateUrl } from "./url";
import { runBasicCheck } from "./basicCheck";
import { runPageSpeedChecks } from "./pageSpeed";
import { validateAndConsumeApiKey, logApiRequest } from "./developerApiAuth";
import type { Env } from "../types";

interface AuditV1RequestBody {
  url?: unknown;
}

export async function handleDeveloperAuditV1(
  request: Request,
  env: Env
): Promise<Response> {
  // CORS для Developer API навмисно відкритий (Access-Control-Allow-Origin: *) —
  // це серверний виклик з backend'у стороннього розробника, не
  // браузерний fetch з довільного сайту, тому origin-allowlist
  // (corsHeaders() з cors.ts) тут не застосовний і не потрібен.
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };

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
