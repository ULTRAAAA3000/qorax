// ============================================================
// monitoring.ts — задачи периодического мониторинга сайтов,
// запускаются по cron-триггеру (см. scheduled() в index.ts).
//
// runUptimeChecks — лёгкая проверка каждые 5 минут:
//   доступность + SSL статус + email алерты при падении/восстановлении
//
// runSpeedChecks — тяжёлая проверка раз в день:
//   PageSpeed Insights + Core Web Vitals + AI инсайты
// ============================================================

import { runBasicCheck } from "./basicCheck";
import { runPageSpeedChecks } from "./pageSpeed";
import { selectRows, insertRow, upsertRow, updateRows } from "./supabase";
import {
  sendEmail,
  buildSiteDownEmail,
  buildSiteRecoveredEmail,
  buildSslExpiryEmail,
} from "./email";
import {
  sendTelegramMessage,
  buildSiteDownTelegram,
  buildSiteRecoveredTelegram,
  buildSslExpiryTelegram,
} from "./telegram";
import { generateSiteInsights } from "./aiInsights";

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  monitoring_enabled: boolean;
}

interface OpenIncidentRow {
  id: string;
  site_id: string;
  started_at: string;
}

interface OrgEmailRow {
  email: string;
  notify_site_down: boolean;
  notify_ssl_domain_expiry: boolean;
  email_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
}

export interface UptimeCheckSummary {
  sitesChecked: number;
  sitesUp: number;
  sitesDown: number;
  incidentsOpened: number;
  incidentsResolved: number;
  alertsSent: number;
  errors: string[];
}

export async function runUptimeChecks(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string
): Promise<UptimeCheckSummary> {
  const summary: UptimeCheckSummary = {
    sitesChecked: 0,
    sitesUp: 0,
    sitesDown: 0,
    incidentsOpened: 0,
    incidentsResolved: 0,
    alertsSent: 0,
    errors: [],
  };

  const sitesResult = await selectRows<SiteRow>(
    "sites",
    "select=id,url,display_name,monitoring_enabled&monitoring_enabled=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!sitesResult.ok) {
    summary.errors.push(sitesResult.error ?? "Не вдалося отримати список сайтів");
    return summary;
  }

  await Promise.all(
    sitesResult.data.map((site) =>
      checkSingleSite(site, supabaseUrl, serviceRoleKey, resendApiKey, appUrl, telegramBotToken, summary)
    )
  );

  return summary;
}

async function checkSingleSite(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string,
  summary: UptimeCheckSummary
): Promise<void> {
  summary.sitesChecked++;

  const check = await runBasicCheck(site.url);
  const status: "up" | "down" = check.reachable ? "up" : "down";

  if (status === "up") summary.sitesUp++;
  else summary.sitesDown++;

  // 1. Записываем результат uptime_checks (time-series)
  const insertResult = await insertRow(
    "uptime_checks",
    {
      site_id: site.id,
      status,
      http_status_code: check.httpStatus,
      response_time_ms: check.responseTimeMs,
      error_message: check.errorMessage,
    },
    supabaseUrl,
    serviceRoleKey
  );
  if (!insertResult.ok) summary.errors.push(insertResult.error ?? "uptime_checks insert failed");

  // 2. SSL статус
  // CF Workers не може читати TLS-метадані (expiry) напряму через fetch().
  // Використовуємо безкоштовний API від SSL Labs / Cloudflare щоб отримати
  // реальну дату закінчення. Якщо API недоступний — пишемо sentinel 999
  // ("активний, дата невідома"), щоб UI не показував "Проблема".
  let daysUntilExpiry: number | null = check.sslValid ? 999 : 0;
  if (check.sslValid) {
    try {
      const hostname = new URL(site.url).hostname;
      const sslResp = await fetch(
        `https://api.ssllabs.com/api/v3/analyze?host=${hostname}&fromCache=on&maxAge=24`,
        { headers: { Accept: "application/json" } }
      );
      if (sslResp.ok) {
        const sslData = await sslResp.json() as {
          endpoints?: { details?: { cert?: { notAfter?: number } } }[];
        };
        const notAfter = sslData?.endpoints?.[0]?.details?.cert?.notAfter;
        if (notAfter) {
          const msLeft = notAfter * 1000 - Date.now();
          daysUntilExpiry = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
        }
      }
    } catch {
      // SSL Labs API недоступний — залишаємо sentinel 999
    }
  }
  const sslResult = await upsertRow(
    "ssl_certificates",
    {
      site_id: site.id,
      days_until_expiry: daysUntilExpiry,
      last_checked_at: new Date().toISOString(),
    },
    "site_id",
    supabaseUrl,
    serviceRoleKey
  );
  if (!sslResult.ok) summary.errors.push(sslResult.error ?? "ssl_certificates upsert failed");

  // 3. Управление инцидентами + email алерты
  await reconcileIncident(
    site,
    status,
    supabaseUrl,
    serviceRoleKey,
    resendApiKey,
    appUrl,
    telegramBotToken,
    summary
  );
}

async function reconcileIncident(
  site: SiteRow,
  status: "up" | "down",
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string,
  summary: UptimeCheckSummary
): Promise<void> {
  const openIncidentResult = await selectRows<OpenIncidentRow>(
    "uptime_incidents",
    `select=id,site_id,started_at&site_id=eq.${site.id}&resolved_at=is.null`,
    supabaseUrl,
    serviceRoleKey
  );

  if (!openIncidentResult.ok) {
    summary.errors.push(openIncidentResult.error ?? "uptime_incidents select failed");
    return;
  }

  const openIncident = openIncidentResult.data[0];

  if (status === "down" && !openIncident) {
    const insertResult = await insertRow(
      "uptime_incidents",
      { site_id: site.id, started_at: new Date().toISOString() },
      supabaseUrl,
      serviceRoleKey
    );
    if (insertResult.ok) {
      summary.incidentsOpened++;
      const sent = await sendDownAlert(site, supabaseUrl, serviceRoleKey, resendApiKey, appUrl, telegramBotToken);
      if (sent) summary.alertsSent++;
    } else {
      summary.errors.push(insertResult.error ?? "uptime_incidents insert failed");
    }
    return;
  }

  if (status === "up" && openIncident) {
    const startedAt = new Date(openIncident.started_at).getTime();
    const resolvedAt = Date.now();
    const durationSeconds = Math.round((resolvedAt - startedAt) / 1000);

    const updateResult = await updateRows(
      "uptime_incidents",
      `id=eq.${openIncident.id}`,
      {
        resolved_at: new Date(resolvedAt).toISOString(),
        duration_seconds: durationSeconds,
      },
      supabaseUrl,
      serviceRoleKey
    );
    if (updateResult.ok) {
      summary.incidentsResolved++;
      const sent = await sendRecoveredAlert(
        site,
        Math.round(durationSeconds / 60),
        supabaseUrl,
        serviceRoleKey,
        resendApiKey,
        appUrl,
        telegramBotToken
      );
      if (sent) summary.alertsSent++;
    } else {
      summary.errors.push(updateResult.error ?? "uptime_incidents update failed");
    }
  }
}

async function getOrgNotifSettings(
  siteId: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<OrgEmailRow | null> {
  const siteOrgResult = await selectRows<{ organization_id: string }>(
    "sites",
    `select=organization_id&id=eq.${siteId}`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!siteOrgResult.ok || !siteOrgResult.data[0]) return null;
  const orgId = siteOrgResult.data[0].organization_id;

  const settingsResult = await selectRows<{
    email_enabled: boolean;
    telegram_enabled: boolean;
    telegram_chat_id: string | null;
    notify_site_down: boolean;
    notify_ssl_domain_expiry: boolean;
  }>(
    "notification_settings",
    `select=email_enabled,telegram_enabled,telegram_chat_id,notify_site_down,notify_ssl_domain_expiry&organization_id=eq.${orgId}`,
    supabaseUrl,
    serviceRoleKey
  );

  const ownerResult = await selectRows<{ user_id: string }>(
    "organization_members",
    `select=user_id&organization_id=eq.${orgId}&role=eq.owner`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!ownerResult.ok || !ownerResult.data[0]) return null;

  try {
    const authResp = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${ownerResult.data[0].user_id}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    if (!authResp.ok) return null;
    const authData = (await authResp.json()) as { email?: string };
    if (!authData.email) return null;

    const s = settingsResult.data[0];
    return {
      email: authData.email,
      email_enabled: s?.email_enabled ?? true,
      telegram_enabled: s?.telegram_enabled ?? false,
      telegram_chat_id: s?.telegram_chat_id ?? null,
      notify_site_down: s?.notify_site_down ?? true,
      notify_ssl_domain_expiry: s?.notify_ssl_domain_expiry ?? true,
    };
  } catch {
    return null;
  }
}

async function sendDownAlert(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string
): Promise<boolean> {
  const settings = await getOrgNotifSettings(site.id, supabaseUrl, serviceRoleKey);
  if (!settings || !settings.notify_site_down) return false;

  let sent = false;

  if (settings.email_enabled) {
    const { subject, html } = buildSiteDownEmail({
      siteDisplayName: site.display_name,
      siteUrl: site.url,
      downtimeSince: new Date().toLocaleString("uk-UA"),
      dashboardUrl: `${appUrl}/dashboard`,
    });
    const r = await sendEmail({ to: settings.email, subject, html }, resendApiKey);
    if (r.ok) sent = true;
    else console.error("Email down alert failed:", r.error);
  }

  if (settings.telegram_enabled && settings.telegram_chat_id) {
    const text = buildSiteDownTelegram({
      siteDisplayName: site.display_name,
      siteUrl: site.url,
      dashboardUrl: `${appUrl}/dashboard`,
    });
    const r = await sendTelegramMessage(settings.telegram_chat_id, text, telegramBotToken);
    if (r.ok) sent = true;
    else console.error("Telegram down alert failed:", r.error);
  }

  return sent;
}

async function sendRecoveredAlert(
  site: SiteRow,
  durationMinutes: number,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string
): Promise<boolean> {
  const settings = await getOrgNotifSettings(site.id, supabaseUrl, serviceRoleKey);
  if (!settings || !settings.notify_site_down) return false;

  let sent = false;

  if (settings.email_enabled) {
    const { subject, html } = buildSiteRecoveredEmail({
      siteDisplayName: site.display_name,
      siteUrl: site.url,
      downtimeDurationMinutes: durationMinutes,
      dashboardUrl: `${appUrl}/dashboard`,
    });
    const r = await sendEmail({ to: settings.email, subject, html }, resendApiKey);
    if (r.ok) sent = true;
  }

  if (settings.telegram_enabled && settings.telegram_chat_id) {
    const text = buildSiteRecoveredTelegram({
      siteDisplayName: site.display_name,
      siteUrl: site.url,
      downtimeDurationMinutes: durationMinutes,
      dashboardUrl: `${appUrl}/dashboard`,
    });
    const r = await sendTelegramMessage(settings.telegram_chat_id, text, telegramBotToken);
    if (r.ok) sent = true;
  }

  return sent;
}

// SSL expiry checks — вызывается из runUptimeChecks раз в сутки
// (проверяем флаг: шлём один раз при 30д и один раз при 7д)
export async function checkSslExpiry(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string
): Promise<void> {
  // Все SSL записи с days_until_expiry <= 30 и alert ещё не слали
  const sslResult = await selectRows<{
    site_id: string;
    days_until_expiry: number;
    alert_sent_30d: boolean;
    alert_sent_7d: boolean;
  }>(
    "ssl_certificates",
    "select=site_id,days_until_expiry,alert_sent_30d,alert_sent_7d&days_until_expiry=lte.30&days_until_expiry=gt.0",
    supabaseUrl,
    serviceRoleKey
  );
  if (!sslResult.ok) return;

  for (const ssl of sslResult.data) {
    const isUrgent = ssl.days_until_expiry <= 7;
    const alreadySent = isUrgent ? ssl.alert_sent_7d : ssl.alert_sent_30d;
    if (alreadySent) continue;

    // Получаем данные сайта
    const siteResult = await selectRows<SiteRow>(
      "sites",
      `select=id,url,display_name,monitoring_enabled&id=eq.${ssl.site_id}`,
      supabaseUrl,
      serviceRoleKey
    );
    if (!siteResult.ok || !siteResult.data[0]) continue;
    const site = siteResult.data[0];

    const settings = await getOrgNotifSettings(site.id, supabaseUrl, serviceRoleKey);
    if (!settings || !settings.notify_ssl_domain_expiry) continue;

    if (settings.email_enabled) {
      const { subject, html } = buildSslExpiryEmail({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        daysLeft: ssl.days_until_expiry,
        dashboardUrl: `${appUrl}/dashboard`,
      });
      await sendEmail({ to: settings.email, subject, html }, resendApiKey);
    }

    if (settings.telegram_enabled && settings.telegram_chat_id) {
      const text = buildSslExpiryTelegram({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        daysLeft: ssl.days_until_expiry,
        dashboardUrl: `${appUrl}/dashboard`,
      });
      await sendTelegramMessage(settings.telegram_chat_id, text, telegramBotToken);
    }

    await updateRows(
      "ssl_certificates",
      `site_id=eq.${ssl.site_id}`,
      isUrgent ? { alert_sent_7d: true } : { alert_sent_30d: true },
      supabaseUrl,
      serviceRoleKey
    );
  }
}

// ============================================================
// runSpeedChecks — тяжёлая проверка раз в день
// ============================================================

export interface SpeedCheckSummary {
  sitesChecked: number;
  sitesSucceeded: number;
  insightsGenerated: number;
  errors: string[];
}

export async function runSpeedChecks(
  supabaseUrl: string,
  serviceRoleKey: string,
  pageSpeedApiKey: string,
  geminiApiKey: string
): Promise<SpeedCheckSummary> {
  const summary: SpeedCheckSummary = {
    sitesChecked: 0,
    sitesSucceeded: 0,
    insightsGenerated: 0,
    errors: [],
  };

  const sitesResult = await selectRows<SiteRow>(
    "sites",
    "select=id,url,display_name,monitoring_enabled&monitoring_enabled=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!sitesResult.ok) {
    summary.errors.push(sitesResult.error ?? "Не вдалося отримати список сайтів");
    return summary;
  }

  // PageSpeed-проверки тяжёлые — гоняем последовательно
  for (const site of sitesResult.data) {
    summary.sitesChecked++;
    try {
      const insightsCount = await checkSingleSiteSpeed(
        site,
        supabaseUrl,
        serviceRoleKey,
        pageSpeedApiKey,
        geminiApiKey
      );
      summary.sitesSucceeded++;
      summary.insightsGenerated += insightsCount;
    } catch (err) {
      summary.errors.push(
        `Speed check failed for ${site.url}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  return summary;
}

async function checkSingleSiteSpeed(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  pageSpeedApiKey: string,
  geminiApiKey: string
): Promise<number> {
  const [basic, pageSpeed] = await Promise.all([
    runBasicCheck(site.url),
    runPageSpeedChecks(site.url, pageSpeedApiKey),
  ]);

  await insertRow(
    "speed_checks",
    {
      site_id: site.id,
      load_time_ms: basic.responseTimeMs ?? 0,
      page_size_kb: basic.pageSizeKb,
    },
    supabaseUrl,
    serviceRoleKey
  );

  await Promise.all([
    insertCwvRow(site.id, "mobile", pageSpeed.mobile, supabaseUrl, serviceRoleKey),
    insertCwvRow(site.id, "desktop", pageSpeed.desktop, supabaseUrl, serviceRoleKey),
  ]);

  // Генеруємо AI-інсайти та зберігаємо в ai_insights
  const insightsCount = await generateSiteInsights(
    site,
    basic,
    pageSpeed.mobile,
    geminiApiKey,
    supabaseUrl,
    serviceRoleKey
  );

  return insightsCount;
}

async function insertCwvRow(
  siteId: string,
  strategy: "mobile" | "desktop",
  result: {
    available: boolean;
    lcpMs: number | null;
    inpMs: number | null;
    clsScore: number | null;
    performanceScore: number | null;
  },
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  if (!result.available) return;
  await insertRow(
    "core_web_vitals_checks",
    {
      site_id: siteId,
      strategy,
      lcp_ms: result.lcpMs ? Math.round(result.lcpMs) : null,
      inp_ms: result.inpMs ? Math.round(result.inpMs) : null,
      cls_score: result.clsScore,
      performance_score: result.performanceScore,
    },
    supabaseUrl,
    serviceRoleKey
  );
}

// ─── Trial expiry ────────────────────────────────────────────
// Вызывается cron'ом раз в день (0 5 * * *).
// Делегирует всю логику хранимой функции expire_trials() в Supabase,
// которая одним UPDATE переводит истёкшие trial → free.
export async function expireTrials(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<number> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/expire_trials`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    const text = await response.text();
    console.error("expire_trials RPC failed:", text);
    return 0;
  }

  const count = await response.json();
  return typeof count === "number" ? count : 0;
}
