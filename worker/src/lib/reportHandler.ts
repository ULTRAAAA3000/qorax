// ============================================================
// reportHandler.ts — обработка GET /api/report?site_id=...
// Собирает данные за последний месяц и возвращает HTML-отчёт.
// Авторизация: JWT токен Supabase в Authorization header.
// ============================================================

import type { Env } from "../types";
import { selectRows } from "./supabase";
import { generateReportHtml, type ReportData } from "./pdfReport";

export async function handleReportRequest(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");

  if (!siteId) {
    return new Response(JSON.stringify({ error: "site_id обов'язковий" }), {
      status: 400,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  // Проверяем токен (Supabase JWT)
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Необхідна авторизація" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }
  const token = authHeader.slice(7);

  // Верифицируем токен через Supabase Auth
  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
  });
  if (!userResp.ok) {
    return new Response(JSON.stringify({ error: "Невалідний токен" }), {
      status: 401,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  // Собираем данные за последние 30 дней
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const now = new Date();

  const [siteResult, uptimeResult, incidentsResult, speedResult, cwvResult, sslResult, insightsResult] =
    await Promise.all([
      selectRows<{ display_name: string; url: string; organization_id: string }>(
        "sites",
        `select=display_name,url,organization_id&id=eq.${siteId}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
      selectRows<{ status: string }>(
        "uptime_checks",
        `select=status&site_id=eq.${siteId}&checked_at=gte.${thirtyDaysAgo}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
      selectRows<{ duration_seconds: number | null }>(
        "uptime_incidents",
        `select=duration_seconds&site_id=eq.${siteId}&started_at=gte.${thirtyDaysAgo}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
      selectRows<{ load_time_ms: number }>(
        "speed_checks",
        `select=load_time_ms&site_id=eq.${siteId}&checked_at=gte.${thirtyDaysAgo}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
      selectRows<{ strategy: string; performance_score: number | null; lcp_ms: number | null; cls_score: number | null }>(
        "core_web_vitals_checks",
        `select=strategy,performance_score,lcp_ms,cls_score&site_id=eq.${siteId}&order=checked_at.desc&limit=4`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
      selectRows<{ days_until_expiry: number | null }>(
        "ssl_certificates",
        `select=days_until_expiry&site_id=eq.${siteId}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
      selectRows<{
        severity: string;
        problem_summary: string;
        plain_explanation: string;
        estimated_monthly_loss_usd: number | null;
        recommendation: string;
      }>(
        "ai_insights",
        `select=severity,problem_summary,plain_explanation,estimated_monthly_loss_usd,recommendation&site_id=eq.${siteId}&is_resolved=eq.false&order=generated_at.desc&limit=5`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      ),
    ]);

  if (!siteResult.ok || !siteResult.data[0]) {
    return new Response(JSON.stringify({ error: "Сайт не знайдено" }), {
      status: 404,
      headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
    });
  }

  const site = siteResult.data[0];
  const uptimeChecks = uptimeResult.data ?? [];
  const incidents = incidentsResult.data ?? [];
  const speedChecks = speedResult.data ?? [];
  const cwvChecks = cwvResult.data ?? [];
  const ssl = sslResult.data?.[0] ?? null;
  const insights = insightsResult.data ?? [];

  // Вычисляем метрики
  const upCount = uptimeChecks.filter((c) => c.status === "up").length;
  const uptimePercent = uptimeChecks.length
    ? (upCount / uptimeChecks.length) * 100
    : 100;

  const totalDowntimeMinutes = incidents.reduce(
    (sum, inc) => sum + Math.round((inc.duration_seconds ?? 0) / 60),
    0
  );

  const avgResponseTimeMs = speedChecks.length
    ? Math.round(speedChecks.reduce((s, c) => s + c.load_time_ms, 0) / speedChecks.length)
    : null;

  const latestMobile = cwvChecks.find((c) => c.strategy === "mobile");
  const totalEstimatedLoss = insights.reduce(
    (sum, ins) => sum + (ins.estimated_monthly_loss_usd ?? 0),
    0
  );

  const periodLabel = now.toLocaleDateString("uk-UA", { month: "long", year: "numeric" });
  const generatedAt = now.toLocaleString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const reportData: ReportData = {
    siteName: site.display_name,
    siteUrl: site.url,
    periodLabel,
    generatedAt,
    uptimePercent,
    totalDowntimeMinutes,
    incidentsCount: incidents.length,
    avgResponseTimeMs,
    latestPageSpeedMobile: latestMobile?.performance_score ?? null,
    latestPageSpeedDesktop: cwvChecks.find((c) => c.strategy === "desktop")?.performance_score ?? null,
    latestLcpMs: latestMobile?.lcp_ms ?? null,
    latestClsScore: latestMobile?.cls_score ?? null,
    sslDaysLeft: ssl?.days_until_expiry ?? null,
    insights: insights.map((ins) => ({
      severity: ins.severity,
      problemSummary: ins.problem_summary,
      plainExplanation: ins.plain_explanation,
      estimatedMonthlyLossUsd: ins.estimated_monthly_loss_usd,
      recommendation: ins.recommendation,
    })),
    totalEstimatedLossUsd: Math.round(totalEstimatedLoss),
  };

  // White-label: якщо org_type = agency → замінюємо брендинг
  const orgResult = await selectRows<{ org_type: string; name: string }>(
    "organizations",
    `select=org_type,name&id=eq.${encodeURIComponent(site.organization_id ?? "")}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const org = orgResult.data?.[0];
  if (org?.org_type === "agency") {
    reportData.whiteLabel = {
      agencyName: org.name,
    };
  }

  const html = generateReportHtml(reportData);

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...corsHeaders(origin),
    },
  });
}

// Генерация месячных отчётов (вызывается из cron 0 4 1 * *)
export async function generateMonthlyReports(env: Env): Promise<number> {
  const { selectRows, insertRow } = await import("./supabase");

  const sitesResult = await selectRows<{ id: string }>(
    "sites",
    "select=id,organization_id&monitoring_enabled=eq.true",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!sitesResult.ok) return 0;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0);

  let count = 0;
  for (const site of sitesResult.data) {
    // Создаём запись отчёта со статусом "ready" (HTML генерируется on-demand)
    const result = await insertRow(
      "reports",
      {
        site_id: site.id,
        report_type: "monthly_summary",
        status: "ready",
        period_start: periodStart.toISOString().split("T")[0],
        period_end: periodEnd.toISOString().split("T")[0],
        summary_data: {},
        // pdf_url = null — отчёт генерируется on-demand через /api/report?site_id=
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (result.ok) count++;
  }

  return count;
}

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://qorax.mrcru96.workers.dev",
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}
