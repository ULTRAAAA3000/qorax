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
  buildWeeklyDigestEmail,
} from "./email";
import {
  sendTelegramMessage,
  buildSiteDownTelegram,
  buildSiteRecoveredTelegram,
  buildSslExpiryTelegram,
} from "./telegram";
import {
  sendSlackMessage,
  buildSiteDownSlack,
  buildSiteRecoveredSlack,
  buildSslExpirySlack,
} from "./slack";
import { generateSiteInsights } from "./aiInsights";

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  monitoring_enabled: boolean;
  response_time_alert_threshold_ms: number | null;
  maintenance_until: string | null;
}

interface OpenIncidentRow {
  id: string;
  site_id: string;
  started_at: string;
}

export interface OrgEmailRow {
  email: string;
  notify_site_down: boolean;
  notify_ssl_domain_expiry: boolean;
  notify_competitor_changes: boolean;
  email_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  slack_enabled: boolean;
  slack_webhook_url: string | null;
}

export interface UptimeCheckSummary {
  sitesChecked: number;
  sitesUp: number;
  sitesDown: number;
  sitesInMaintenance?: number;
  incidentsOpened: number;
  incidentsResolved: number;
  alertsSent: number;
  errors: string[];
}

/**
 * Ручний запуск uptime-перевірки для одного конкретного сайту —
 * той самий шлях що й у cron (checkSingleSite), просто для одного
 * site_id замість усіх активних сайтів. Використовується кнопкою
 * "Перевірити зараз" у дашборді.
 */
export async function runUptimeCheckForSite(
  siteId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string,
  telegramBotToken: string
): Promise<{ ok: boolean; status?: "up" | "down"; error?: string }> {
  const siteResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,monitoring_enabled,response_time_alert_threshold_ms,maintenance_until&id=eq.${encodeURIComponent(siteId)}`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!siteResult.ok || siteResult.data.length === 0) {
    return { ok: false, error: "Сайт не знайдено" };
  }

  const site = siteResult.data[0];
  const summary: UptimeCheckSummary = {
    sitesChecked: 0, sitesUp: 0, sitesDown: 0,
    incidentsOpened: 0, incidentsResolved: 0, alertsSent: 0, errors: [],
  };

  await checkSingleSite(site, supabaseUrl, serviceRoleKey, resendApiKey, appUrl, telegramBotToken, summary);

  if (summary.errors.length > 0) {
    return { ok: false, error: summary.errors.join("; ") };
  }
  return { ok: true, status: summary.sitesUp > 0 ? "up" : "down" };
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
    "select=id,url,display_name,monitoring_enabled,response_time_alert_threshold_ms,maintenance_until&monitoring_enabled=eq.true",
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

  // 3. Перевіряємо режим обслуговування — якщо активний, не створюємо
  // інциденти і не шлємо алерти (дані вище вже записані як завжди,
  // щоб не втрачати історію перевірок).
  const inMaintenance = site.maintenance_until != null &&
    new Date(site.maintenance_until).getTime() > Date.now();

  if (inMaintenance) {
    summary.sitesInMaintenance = (summary.sitesInMaintenance ?? 0) + 1;
    // Якщо є відкритий інцидент з ДО початку обслуговування — закриваємо
    // його мовчки (без алерту "відновлено"), щоб він не висів вічно.
    await silentlyCloseIncidentIfMaintenance(site, status, supabaseUrl, serviceRoleKey, summary);
    return;
  }

  // 4. Управление инцидентами + email алерты
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

  // 5. Custom поріг часу відповіді (миттєвий, на кожній перевірці).
  // Спрацьовує лише якщо сайт "up" (для "down" вже є окремий алерт)
  // і власник задав власний поріг у налаштуваннях сайту.
  if (
    status === "up" &&
    site.response_time_alert_threshold_ms != null &&
    check.responseTimeMs != null &&
    check.responseTimeMs > site.response_time_alert_threshold_ms
  ) {
    await checkResponseTimeThreshold(
      site,
      check.responseTimeMs,
      site.response_time_alert_threshold_ms,
      supabaseUrl,
      serviceRoleKey,
      resendApiKey,
      telegramBotToken,
      appUrl
    );
  }
}

// Якщо перед початком обслуговування був відкритий інцидент — закриваємо
// його без алерту (щоб не рахувати весь час обслуговування як simulated
// downtime у звітах). Викликається на кожній перевірці поки maintenance
// активний, тому status тут не використовується для рішення — просто
// закриваємо будь-який відкритий інцидент одразу, як тільки помічаємо
// що ввімкнено обслуговування.
async function silentlyCloseIncidentIfMaintenance(
  site: SiteRow,
  _status: "up" | "down",
  supabaseUrl: string,
  serviceRoleKey: string,
  summary: UptimeCheckSummary
): Promise<void> {
  const openIncidentResult = await selectRows<OpenIncidentRow>(
    "uptime_incidents",
    `select=id,site_id,started_at&site_id=eq.${site.id}&resolved_at=is.null`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!openIncidentResult.ok || openIncidentResult.data.length === 0) return;

  const openIncident = openIncidentResult.data[0];
  const resolvedAt = Date.now();
  const durationSeconds = Math.round((resolvedAt - new Date(openIncident.started_at).getTime()) / 1000);

  const updateResult = await updateRows(
    "uptime_incidents",
    `id=eq.${openIncident.id}`,
    { resolved_at: new Date(resolvedAt).toISOString(), duration_seconds: durationSeconds },
    supabaseUrl,
    serviceRoleKey
  );
  if (updateResult.ok) summary.incidentsResolved++;
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

// ─── Custom response-time threshold алерти ─────────────────────
// На відміну від checkSpeedDegradation (порівнює з 7-денним середнім
// раз на добу), цей алерт — миттєвий поріг, який власник сайту задає
// сам у налаштуваннях (наприклад "повідом якщо відповідь > 2000мс").
// Rate limit: не частіше одного разу на годину на сайт.
async function checkResponseTimeThreshold(
  site: SiteRow,
  responseMs: number,
  thresholdMs: number,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  telegramBotToken: string,
  appUrl: string
): Promise<void> {
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const recentAlertResult = await selectRows<{ id: string }>(
    "response_time_alerts",
    `select=id&site_id=eq.${site.id}&alerted_at=gte.${hourAgo}&limit=1`,
    supabaseUrl,
    serviceRoleKey
  );
  if (recentAlertResult.ok && recentAlertResult.data.length > 0) return; // вже слали цю годину

  const settings = await getOrgNotifSettings(site.id, supabaseUrl, serviceRoleKey);
  if (!settings) return;

  const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
  const dashboardUrl = `${appUrl}/dashboard/sites/${site.id}`;

  const subject = `⚠️ ${site.display_name} — час відповіді ${fmtMs(responseMs)} перевищує поріг ${fmtMs(thresholdMs)}`;
  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:28px;"><span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span></div>
    <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.3);border-radius:16px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#F5A623;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Перевищено поріг часу відповіді</p>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#f5f5f7;">${site.display_name}</h1>
      <p style="margin:0;font-size:13px;color:#6e6e73;font-family:'Courier New',monospace;">${site.url}</p>
    </div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:13px;color:#6e6e73;">Час відповіді</span>
        <span style="font-size:13px;font-weight:600;color:#F5A623;">${fmtMs(responseMs)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;">
        <span style="font-size:13px;color:#6e6e73;">Ваш поріг</span>
        <span style="font-size:13px;font-weight:600;color:#d6ff3f;">${fmtMs(thresholdMs)}</span>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#d6ff3f;color:#0a0a0a;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none;">Перевірити в дашборді →</a>
    </div>
    <p style="font-size:12px;color:#6e6e73;text-align:center;margin:0;">Qorax · Моніторинг сайтів</p>
  </div>
</body>
</html>`;
  const telegramText = `⚠️ *Повільна відповідь* — ${site.display_name}\n\nВідповідь: *${fmtMs(responseMs)}*\nВаш поріг: ${fmtMs(thresholdMs)}\n\n[Відкрити дашборд](${dashboardUrl})`;
  const slackText = `:warning: *Повільна відповідь* — ${site.display_name}\n\nВідповідь: *${fmtMs(responseMs)}*\nВаш поріг: ${fmtMs(thresholdMs)}\n\n<${dashboardUrl}|Відкрити дашборд>`;

  await dispatchAlert(
    settings,
    settings.email_enabled ? { subject, html } : null,
    settings.telegram_enabled && settings.telegram_chat_id ? telegramText : null,
    settings.slack_enabled && settings.slack_webhook_url ? slackText : null,
    resendApiKey,
    telegramBotToken
  );

  await insertRow(
    "response_time_alerts",
    { site_id: site.id, response_ms: responseMs, threshold_ms: thresholdMs },
    supabaseUrl,
    serviceRoleKey
  );
}

export async function getOrgNotifSettings(
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
    slack_enabled: boolean;
    slack_webhook_url: string | null;
    notify_site_down: boolean;
    notify_ssl_domain_expiry: boolean;
    notify_competitor_changes: boolean;
  }>(
    "notification_settings",
    `select=email_enabled,telegram_enabled,telegram_chat_id,slack_enabled,slack_webhook_url,notify_site_down,notify_ssl_domain_expiry,notify_competitor_changes&organization_id=eq.${orgId}`,
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
      slack_enabled: s?.slack_enabled ?? false,
      slack_webhook_url: s?.slack_webhook_url ?? null,
      notify_site_down: s?.notify_site_down ?? true,
      notify_ssl_domain_expiry: s?.notify_ssl_domain_expiry ?? true,
      notify_competitor_changes: s?.notify_competitor_changes ?? true,
    };
  } catch {
    return null;
  }
}

// Спільна відправка алерту через email + Telegram (якщо ввімкнені в
// налаштуваннях організації). Раніше цей паттерн (email якщо enabled,
// telegram якщо enabled+chat_id, трекати sent) був продубльований
// в sendDownAlert, sendRecoveredAlert і checkSslExpiry.
export async function dispatchAlert(
  settings: OrgEmailRow,
  email: { subject: string; html: string } | null,
  telegramText: string | null,
  slackText: string | null,
  resendApiKey: string,
  telegramBotToken: string
): Promise<boolean> {
  let sent = false;

  if (settings.email_enabled && email) {
    const r = await sendEmail({ to: settings.email, subject: email.subject, html: email.html }, resendApiKey);
    if (r.ok) sent = true;
    else console.error("Email alert failed:", r.error);
  }

  if (settings.telegram_enabled && settings.telegram_chat_id && telegramText) {
    const r = await sendTelegramMessage(settings.telegram_chat_id, telegramText, telegramBotToken);
    if (r.ok) sent = true;
    else console.error("Telegram alert failed:", r.error);
  }

  if (settings.slack_enabled && settings.slack_webhook_url && slackText) {
    const r = await sendSlackMessage(settings.slack_webhook_url, slackText);
    if (r.ok) sent = true;
    else console.error("Slack alert failed:", r.error);
  }

  return sent;
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

  const email = settings.email_enabled
    ? buildSiteDownEmail({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        downtimeSince: new Date().toLocaleString("uk-UA"),
        dashboardUrl: `${appUrl}/dashboard`,
      })
    : null;

  const telegramText = settings.telegram_enabled && settings.telegram_chat_id
    ? buildSiteDownTelegram({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        dashboardUrl: `${appUrl}/dashboard`,
      })
    : null;

  const slackText = settings.slack_enabled && settings.slack_webhook_url
    ? buildSiteDownSlack({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        dashboardUrl: `${appUrl}/dashboard`,
      })
    : null;

  return dispatchAlert(settings, email, telegramText, slackText, resendApiKey, telegramBotToken);
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

  const email = settings.email_enabled
    ? buildSiteRecoveredEmail({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        downtimeDurationMinutes: durationMinutes,
        dashboardUrl: `${appUrl}/dashboard`,
      })
    : null;

  const telegramText = settings.telegram_enabled && settings.telegram_chat_id
    ? buildSiteRecoveredTelegram({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        downtimeDurationMinutes: durationMinutes,
        dashboardUrl: `${appUrl}/dashboard`,
      })
    : null;

  const slackText = settings.slack_enabled && settings.slack_webhook_url
    ? buildSiteRecoveredSlack({
        siteDisplayName: site.display_name,
        siteUrl: site.url,
        downtimeDurationMinutes: durationMinutes,
        dashboardUrl: `${appUrl}/dashboard`,
      })
    : null;

  return dispatchAlert(settings, email, telegramText, slackText, resendApiKey, telegramBotToken);
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

    const email = settings.email_enabled
      ? buildSslExpiryEmail({
          siteDisplayName: site.display_name,
          siteUrl: site.url,
          daysLeft: ssl.days_until_expiry,
          dashboardUrl: `${appUrl}/dashboard`,
        })
      : null;

    const telegramText = settings.telegram_enabled && settings.telegram_chat_id
      ? buildSslExpiryTelegram({
          siteDisplayName: site.display_name,
          siteUrl: site.url,
          daysLeft: ssl.days_until_expiry,
          dashboardUrl: `${appUrl}/dashboard`,
        })
      : null;

    const slackText = settings.slack_enabled && settings.slack_webhook_url
      ? buildSslExpirySlack({
          siteDisplayName: site.display_name,
          siteUrl: site.url,
          daysLeft: ssl.days_until_expiry,
          dashboardUrl: `${appUrl}/dashboard`,
        })
      : null;

    await dispatchAlert(settings, email, telegramText, slackText, resendApiKey, telegramBotToken);

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
  geminiApiKey: string,
  onSiteChecked?: (siteId: string, speedMs: number) => Promise<void>
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
      const { insightsCount, speedMs } = await checkSingleSiteSpeed(
        site,
        supabaseUrl,
        serviceRoleKey,
        pageSpeedApiKey,
        geminiApiKey
      );
      summary.sitesSucceeded++;
      summary.insightsGenerated += insightsCount;
      // Перевірка деградації після кожного сайту (якщо callback заданий)
      if (onSiteChecked && speedMs > 0) {
        await onSiteChecked(site.id, speedMs).catch(e =>
          console.warn(`Speed degradation check failed for ${site.url}:`, e)
        );
      }
    } catch (err) {
      summary.errors.push(
        `Speed check failed for ${site.url}: ${err instanceof Error ? err.message : "unknown"}`
      );
    }
  }

  return summary;
}

export async function runSpeedCheckForSite(
  siteId: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  pageSpeedApiKey: string,
  geminiApiKey: string
): Promise<number> {
  const siteResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,monitoring_enabled&id=eq.${encodeURIComponent(siteId)}`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!siteResult.ok || siteResult.data.length === 0) {
    return 0;
  }
  const site = siteResult.data[0];
  const { speedMs } = await checkSingleSiteSpeed(site, supabaseUrl, serviceRoleKey, pageSpeedApiKey, geminiApiKey);
  return speedMs;
}

async function checkSingleSiteSpeed(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  pageSpeedApiKey: string,
  geminiApiKey: string
): Promise<{ insightsCount: number; speedMs: number }> {
  // Запускаємо basicCheck і PageSpeed паралельно
  const [basic, pageSpeed] = await Promise.all([
    runBasicCheck(site.url),
    runPageSpeedChecks(site.url, pageSpeedApiKey).catch(err => {
      console.warn(`PageSpeed failed for ${site.url}:`, err instanceof Error ? err.message : err);
      return {
        mobile: { available: false, performanceScore: null, lcpMs: null, inpMs: null, clsScore: null, errorMessage: String(err) },
        desktop: { available: false, performanceScore: null, lcpMs: null, inpMs: null, clsScore: null, errorMessage: String(err) },
      };
    }),
  ]);

  const speedMs = basic.responseTimeMs ?? 0;

  // Завжди зберігаємо basicCheck (час відповіді)
  await insertRow(
    "speed_checks",
    {
      site_id: site.id,
      load_time_ms: speedMs,
      page_size_kb: basic.pageSizeKb,
    },
    supabaseUrl,
    serviceRoleKey
  );

  // CWV зберігаємо тільки якщо PageSpeed відповів
  await Promise.all([
    insertCwvRow(site.id, "mobile", pageSpeed.mobile, supabaseUrl, serviceRoleKey),
    insertCwvRow(site.id, "desktop", pageSpeed.desktop, supabaseUrl, serviceRoleKey),
  ]);

  // AI інсайти генеруємо завжди
  const insightsCount = await generateSiteInsights(
    site,
    basic,
    pageSpeed.mobile,
    geminiApiKey,
    supabaseUrl,
    serviceRoleKey
  );

  return { insightsCount, speedMs };
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

// ─── Trial onboarding emails ──────────────────────────────────
// Викликається з cron 0 5 * * * разом з expireTrials().
// Шле нагадування за 7 і 3 дні до кінця тріалу,
// а також листа про закінчення (після expireTrials переводить на free).

interface TrialOrgRow {
  organization_id: string;
  trial_ends_at: string;
  status: string;
}

interface OrgMemberRow {
  user_id: string;
}

export async function sendTrialEmails(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string
): Promise<{ reminders: number; expired: number }> {
  // Знаходимо всі активні тріали (підписки з trial_ends_at)
  const subResp = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?select=organization_id,trial_ends_at,status&trial_ends_at=not.is.null`,
    {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Accept: "application/json",
      },
    }
  );

  if (!subResp.ok) {
    console.error("sendTrialEmails: failed to fetch subscriptions");
    return { reminders: 0, expired: 0 };
  }

  const subs = (await subResp.json()) as TrialOrgRow[];
  const now = Date.now();
  let reminders = 0;
  let expired = 0;

  for (const sub of subs) {
    const endsAt = new Date(sub.trial_ends_at).getTime();
    const daysLeft = Math.ceil((endsAt - now) / (1000 * 60 * 60 * 24));

    // Нагадування за 7 або 3 дні (тільки для активних тріалів)
    const shouldRemind =
      sub.status === "trialing" && (daysLeft === 7 || daysLeft === 3);
    // Лист про закінчення (тільки що перевели на free — статус canceled сьогодні)
    const justExpired =
      sub.status === "canceled" && daysLeft >= -1 && daysLeft <= 0;

    if (!shouldRemind && !justExpired) continue;

    // Отримуємо власника організації
    const memberResp = await fetch(
      `${supabaseUrl}/rest/v1/organization_members?select=user_id&organization_id=eq.${encodeURIComponent(sub.organization_id)}&role=eq.owner&limit=1`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Accept: "application/json",
        },
      }
    );
    if (!memberResp.ok) continue;
    const members = (await memberResp.json()) as OrgMemberRow[];
    const ownerId = members[0]?.user_id;
    if (!ownerId) continue;

    // Email власника з Supabase auth
    const authResp = await fetch(
      `${supabaseUrl}/auth/v1/admin/users/${ownerId}`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      }
    );
    if (!authResp.ok) continue;
    const authUser = (await authResp.json()) as { email?: string; user_metadata?: { full_name?: string } };
    if (!authUser.email) continue;

    const firstName =
      authUser.user_metadata?.full_name?.split(" ")[0] ||
      authUser.email.split("@")[0];

    const dashboardUrl = `${appUrl}/dashboard`;
    const upgradeUrl = `${appUrl}/dashboard/upgrade`;

    let subject = "";
    let html = "";

    if (shouldRemind) {
      subject =
        daysLeft <= 3
          ? `⏰ Залишилось ${daysLeft} ${Number(daysLeft) === 1 ? "день" : "дні"} тріалу Qorax`
          : `Ваш тріал Qorax закінчується через ${daysLeft} днів`;

      html = buildTrialReminderHtml({ firstName, daysLeft, upgradeUrl });
      reminders++;
    } else if (justExpired) {
      subject = `Ваш тріал Qorax закінчився — оберіть план`;
      html = buildTrialExpiredHtml({ firstName, dashboardUrl, upgradeUrl });
      expired++;
    }

    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "Qorax <hello@qorax.app>",
        to: [authUser.email],
        subject,
        html,
      }),
    }).catch(() => {/* не критично */});
  }

  return { reminders, expired };
}

function buildTrialReminderHtml(p: {
  firstName: string;
  daysLeft: number;
  upgradeUrl: string;
}): string {
  const urgent = p.daysLeft <= 3;
  const accent = urgent ? "#F5A623" : "#8CF6FF";
  const accentBg = urgent ? "rgba(245,166,35,0.08)" : "rgba(140,246,255,0.06)";
  const accentBorder = urgent ? "rgba(245,166,35,0.3)" : "rgba(140,246,255,0.2)";
  const daysWord = p.daysLeft === 1 ? "день" : p.daysLeft < 5 ? "дні" : "днів";

  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;"><span style="font-size:18px;font-weight:700;color:#f5f5f7;">Qorax</span></div>
    <div style="background:${accentBg};border:1px solid ${accentBorder};border-radius:16px;padding:28px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:${accent};text-transform:uppercase;letter-spacing:0.05em;">${urgent ? "⏰ Скоро закінчується" : "Нагадування"}</p>
      <p style="margin:0;font-size:20px;font-weight:600;color:#f5f5f7;">${p.firstName}, залишилось ${p.daysLeft} ${daysWord}</p>
    </div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;color:#8a9bb0;line-height:1.6;">Після закінчення тріалу — безкоштовний план: uptime раз на 30 хв, без AI та SSL.</p>
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(214,255,63,0.08);border:1px solid rgba(214,255,63,0.2);border-radius:10px;padding:14px 16px;margin-bottom:8px;">
        <div><p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#f5f5f7;">Starter</p><p style="margin:0;font-size:12px;color:#8a9bb0;">Uptime 5хв · SSL · AI</p></div>
        <span style="font-size:15px;font-weight:700;color:#D6FF3F;">$49/міс</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(140,246,255,0.06);border:1px solid rgba(140,246,255,0.15);border-radius:10px;padding:14px 16px;">
        <div><p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#f5f5f7;">Growth</p><p style="margin:0;font-size:12px;color:#8a9bb0;">+ CWV · SEO · Конкуренти · Qoraxus</p></div>
        <span style="font-size:15px;font-weight:700;color:#8CF6FF;">$99/міс</span>
      </div>
    </div>
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${p.upgradeUrl}" style="display:inline-block;background:#D6FF3F;color:#0C111D;font-size:14px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">Обрати план →</a>
    </div>
    <p style="font-size:12px;color:#5a7090;text-align:center;margin:0;">Qorax · Моніторинг сайтів</p>
  </div>
</body></html>`;
}

function buildTrialExpiredHtml(p: {
  firstName: string;
  dashboardUrl: string;
  upgradeUrl: string;
}): string {
  const features = ["Перевірка кожні 5 хвилин", "SSL та domain моніторинг", "AI-аналіз з revenue impact", "SEO аудит та Core Web Vitals", "Telegram алерти"];
  const featuresHtml = features.map(f =>
    `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;"><span style="color:#F5675A;">✕</span><span style="font-size:14px;color:#8a9bb0;">${f}</span></div>`
  ).join("");

  return `<!DOCTYPE html>
<html lang="uk"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:-apple-system,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;"><span style="font-size:18px;font-weight:700;color:#f5f5f7;">Qorax</span></div>
    <div style="background:rgba(245,103,90,0.06);border:1px solid rgba(245,103,90,0.25);border-radius:16px;padding:28px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f5f5f7;">${p.firstName}, ваш тріал закінчився</p>
      <p style="margin:0;font-size:15px;color:#8a9bb0;line-height:1.6;">Акаунт переведено на безкоштовний план.</p>
    </div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#f5f5f7;">Що вимкнено:</p>
      ${featuresHtml}
    </div>
    <div style="text-align:center;margin-bottom:12px;">
      <a href="${p.upgradeUrl}" style="display:inline-block;background:#D6FF3F;color:#0C111D;font-size:14px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">Відновити доступ →</a>
    </div>
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${p.dashboardUrl}" style="font-size:13px;color:#5a7090;text-decoration:none;">Перейти до дашборду</a>
    </div>
    <p style="font-size:12px;color:#5a7090;text-align:center;margin:0;">Питання? Відповідайте на цей лист.<br>Qorax · Моніторинг сайтів</p>
  </div>
</body></html>`;
}

// ─── Weekly Digest ────────────────────────────────────────────
// Викликається з cron щопонеділка о 8:00 (0 8 * * 1).
// Збирає дані за останні 7 днів по кожному сайту і шле дайджест власнику.

export async function sendWeeklyDigests(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string
): Promise<{ sent: number; errors: string[] }> {
  const summary = { sent: 0, errors: [] as string[] };
  const h = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: "application/json" };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Всі активні орги (trial або paid)
  const subsResp = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?select=organization_id,status&status=in.(trialing,active)`,
    { headers: h }
  );
  if (!subsResp.ok) { summary.errors.push("Failed to fetch subscriptions"); return summary; }
  const subs = await subsResp.json() as Array<{ organization_id: string; status: string }>;

  for (const sub of subs) {
    const orgId = sub.organization_id;

    // Сайти організації
    const sitesResp = await fetch(
      `${supabaseUrl}/rest/v1/sites?select=id,url,display_name&organization_id=eq.${orgId}&monitoring_enabled=eq.true`,
      { headers: h }
    );
    if (!sitesResp.ok) continue;
    const sites = await sitesResp.json() as Array<{ id: string; url: string; display_name: string }>;
    if (!sites.length) continue;

    // Власник орги
    const memberResp = await fetch(
      `${supabaseUrl}/rest/v1/organization_members?select=user_id&organization_id=eq.${orgId}&role=eq.owner&limit=1`,
      { headers: h }
    );
    if (!memberResp.ok) continue;
    const members = await memberResp.json() as Array<{ user_id: string }>;
    const ownerId = members[0]?.user_id;
    if (!ownerId) continue;

    const authResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${ownerId}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!authResp.ok) continue;
    const authUser = await authResp.json() as { email?: string; user_metadata?: { full_name?: string } };
    if (!authUser.email) continue;
    const firstName = authUser.user_metadata?.full_name?.split(" ")[0] || authUser.email.split("@")[0];

    // По кожному сайту збираємо метрики
    for (const site of sites) {
      try {
        const [uptimeResp, incidentResp, speedResp, seoResp, sslResp] = await Promise.all([
          fetch(`${supabaseUrl}/rest/v1/uptime_checks?select=status&site_id=eq.${site.id}&checked_at=gte.${weekAgo}`, { headers: h }),
          fetch(`${supabaseUrl}/rest/v1/uptime_incidents?select=started_at,resolved_at&site_id=eq.${site.id}&started_at=gte.${weekAgo}`, { headers: h }),
          fetch(`${supabaseUrl}/rest/v1/speed_checks?select=load_time_ms,checked_at&site_id=eq.${site.id}&checked_at=gte.${weekAgo}&order=checked_at.asc`, { headers: h }),
          fetch(`${supabaseUrl}/rest/v1/page_seo_audits?select=issues&site_id=eq.${site.id}&checked_at=gte.${weekAgo}&order=checked_at.desc&limit=1`, { headers: h }),
          fetch(`${supabaseUrl}/rest/v1/ssl_certificates?select=days_until_expiry&site_id=eq.${site.id}&limit=1`, { headers: h }),
        ]);

        const uptimeChecks = uptimeResp.ok ? await uptimeResp.json() as Array<{ status: string }> : [];
        const incidents = incidentResp.ok ? await incidentResp.json() as Array<{ started_at: string; resolved_at: string | null }> : [];
        const speedChecks = speedResp.ok ? await speedResp.json() as Array<{ load_time_ms: number; checked_at: string }> : [];
        const seoAudits = seoResp.ok ? await seoResp.json() as Array<{ issues: unknown }> : [];
        const sslArr = sslResp.ok ? await sslResp.json() as Array<{ days_until_expiry: number | null }> : [];

        // Uptime %
        const totalChecks = uptimeChecks.length;
        const upChecks = uptimeChecks.filter(c => c.status === "up").length;
        const uptimePct = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

        // Простій
        let totalDowntimeMinutes = 0;
        for (const inc of incidents) {
          const start = new Date(inc.started_at).getTime();
          const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : Date.now();
          totalDowntimeMinutes += Math.round((end - start) / 60000);
        }

        // Швидкість
        const speeds = speedChecks.map(c => c.load_time_ms);
        const avgSpeedMs = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
        // Попередній тиждень для порівняння
        const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const prevSpeedResp = await fetch(
          `${supabaseUrl}/rest/v1/speed_checks?select=load_time_ms&site_id=eq.${site.id}&checked_at=gte.${twoWeeksAgo}&checked_at=lt.${weekAgo}`,
          { headers: h }
        );
        const prevSpeeds = prevSpeedResp.ok
          ? (await prevSpeedResp.json() as Array<{ load_time_ms: number }>).map(c => c.load_time_ms)
          : [];
        const prevAvgSpeedMs = prevSpeeds.length ? Math.round(prevSpeeds.reduce((a, b) => a + b, 0) / prevSpeeds.length) : null;

        // SEO issues
        let newSeoIssues = 0;
        if (seoAudits[0]?.issues) {
          try {
            const issues = Array.isArray(seoAudits[0].issues)
              ? seoAudits[0].issues
              : JSON.parse(String(seoAudits[0].issues));
            newSeoIssues = issues.length;
          } catch { /* ignore */ }
        }

        const sslDaysLeft = sslArr[0]?.days_until_expiry ?? null;

        const { subject, html } = buildWeeklyDigestEmail({
          firstName,
          siteName: site.display_name,
          siteUrl: site.url,
          dashboardUrl: `${appUrl}/dashboard/sites/${site.id}`,
          uptimePct,
          avgSpeedMs,
          prevAvgSpeedMs,
          incidentsCount: incidents.length,
          totalDowntimeMinutes,
          newSeoIssues,
          sslDaysLeft,
        });

        const result = await sendEmail({ to: authUser.email, subject, html }, resendApiKey);
        if (result.ok) summary.sent++;
        else summary.errors.push(`${site.display_name}: ${result.error}`);
      } catch (err) {
        summary.errors.push(`${site.display_name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return summary;
}

// ─── Speed degradation alert ──────────────────────────────────
// Викликається після runSpeedCheckForSite.
// Якщо поточна швидкість вдвічі гірша за середню за 7 днів — шле алерт.

export async function checkSpeedDegradation(
  siteId: string,
  currentSpeedMs: number,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  telegramBotToken: string,
  appUrl: string
): Promise<void> {
  const h = { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}`, Accept: "application/json" };
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Середнє за 7 днів (виключаємо поточний замір)
  const resp = await fetch(
    `${supabaseUrl}/rest/v1/speed_checks?select=load_time_ms&site_id=eq.${siteId}&checked_at=gte.${weekAgo}&order=checked_at.desc&limit=20`,
    { headers: h }
  );
  if (!resp.ok) return;
  const checks = await resp.json() as Array<{ load_time_ms: number }>;
  if (checks.length < 3) return; // Замало даних для порівняння

  const avg = checks.reduce((a, b) => a + b.load_time_ms, 0) / checks.length;

  // Тригер: поточне значення вдвічі гірше середнього І перевищує 3с абсолютно
  if (currentSpeedMs < avg * 2 || currentSpeedMs < 3000) return;

  // Отримуємо сайт і налаштування
  const siteResp = await fetch(`${supabaseUrl}/rest/v1/sites?select=id,url,display_name,organization_id&id=eq.${siteId}&limit=1`, { headers: h });
  if (!siteResp.ok) return;
  const sites = await siteResp.json() as Array<{ id: string; url: string; display_name: string; organization_id: string }>;
  const site = sites[0];
  if (!site) return;

  // Перевіряємо чи не шляли вже сьогодні (щоб не спамити)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const alertCheckResp = await fetch(
    `${supabaseUrl}/rest/v1/speed_degradation_alerts?select=id&site_id=eq.${siteId}&alerted_at=gte.${todayStart.toISOString()}&limit=1`,
    { headers: h }
  );
  if (alertCheckResp.ok) {
    const existing = await alertCheckResp.json() as Array<unknown>;
    if (existing.length > 0) return; // Вже шляли сьогодні
  }

  const settings = await getOrgNotifSettings(siteId, supabaseUrl, serviceRoleKey);
  if (!settings) return;

  const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
  const dashboardUrl = `${appUrl}/dashboard/sites/${siteId}`;

  const subject = `⚡ ${site.display_name} — швидкість впала до ${fmtMs(currentSpeedMs)} (норма ${fmtMs(Math.round(avg))})`;
  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:28px;"><span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span></div>
    <div style="background:rgba(245,166,35,0.08);border:1px solid rgba(245,166,35,0.3);border-radius:16px;padding:24px;margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#F5A623;text-transform:uppercase;letter-spacing:0.05em;">⚡ Швидкість впала</p>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#f5f5f7;">${site.display_name}</h1>
      <p style="margin:0;font-size:13px;color:#6e6e73;font-family:'Courier New',monospace;">${site.url}</p>
    </div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:20px;">
      <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:13px;color:#6e6e73;">Поточна швидкість</span>
        <span style="font-size:13px;font-weight:600;color:#F5A623;">${fmtMs(currentSpeedMs)}</span>
      </div>
      <div style="display:flex;justify-content:space-between;padding:10px 0;">
        <span style="font-size:13px;color:#6e6e73;">Середня за 7 днів</span>
        <span style="font-size:13px;font-weight:600;color:#d6ff3f;">${fmtMs(Math.round(avg))}</span>
      </div>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${dashboardUrl}" style="display:inline-block;background:#d6ff3f;color:#0a0a0a;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none;">Перевірити в дашборді →</a>
    </div>
    <p style="font-size:12px;color:#6e6e73;text-align:center;margin:0;">Qorax · Моніторинг сайтів</p>
  </div>
</body>
</html>`;
  const telegramText = `⚡ *Швидкість впала* — ${site.display_name}\n\nПоточна: *${fmtMs(currentSpeedMs)}*\nНорма (7 днів): ${fmtMs(Math.round(avg))}\n\n[Відкрити дашборд](${dashboardUrl})`;
  const slackText = `:zap: *Швидкість впала* — ${site.display_name}\n\nПоточна: *${fmtMs(currentSpeedMs)}*\nНорма (7 днів): ${fmtMs(Math.round(avg))}\n\n<${dashboardUrl}|Відкрити дашборд>`;

  await dispatchAlert(
    settings,
    settings.email_enabled ? { subject, html } : null,
    settings.telegram_enabled && settings.telegram_chat_id ? telegramText : null,
    settings.slack_enabled && settings.slack_webhook_url ? slackText : null,
    resendApiKey,
    telegramBotToken
  );

  // Записуємо алерт щоб не спамити
  await fetch(`${supabaseUrl}/rest/v1/speed_degradation_alerts`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ site_id: siteId, speed_ms: currentSpeedMs, avg_ms: Math.round(avg), alerted_at: new Date().toISOString() }),
  });
}
