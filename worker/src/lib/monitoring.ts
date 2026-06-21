// ============================================================
// monitoring.ts — задачи периодического мониторинга сайтов,
// запускаются по cron-триггеру (см. scheduled() в index.ts).
//
// runUptimeChecks — лёгкая проверка (каждые 5 минут): доступность
// сайта + базовый статус SSL (есть/нет, без точной даты истечения —
// Cloudflare Workers fetch() не даёт доступа к деталям TLS-сертификата
// удалённого сервера без платного стороннего API, что выходит за рамки
// MVP-бюджета. Если/когда появится бюджет — заменить на реальный
// valid_from/valid_until через сторонний SSL-checker API).
// ============================================================

import { runBasicCheck } from "./basicCheck";
import { runPageSpeedCheck } from "./pageSpeed";
import { selectRows, insertRow, upsertRow, updateRows } from "./supabase";

interface SiteRow {
  id: string;
  url: string;
  monitoring_enabled: boolean;
}

interface OpenIncidentRow {
  id: string;
  site_id: string;
}

export interface UptimeCheckSummary {
  sitesChecked: number;
  sitesUp: number;
  sitesDown: number;
  incidentsOpened: number;
  incidentsResolved: number;
  errors: string[];
}

export async function runUptimeChecks(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<UptimeCheckSummary> {
  const summary: UptimeCheckSummary = {
    sitesChecked: 0,
    sitesUp: 0,
    sitesDown: 0,
    incidentsOpened: 0,
    incidentsResolved: 0,
    errors: [],
  };

  const sitesResult = await selectRows<SiteRow>(
    "sites",
    "select=id,url,monitoring_enabled&monitoring_enabled=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!sitesResult.ok) {
    summary.errors.push(sitesResult.error ?? "Не вдалося отримати список сайтів");
    return summary;
  }

  // Запускаем проверки сайтов параллельно (с разумным лимитом не нужен —
  // Workers cron имеет до 15 минут на выполнение, а каждый fetch таймаутится
  // за 10с в runBasicCheck, так что даже сотни сайтов отработают в пределах лимита).
  await Promise.all(
    sitesResult.data.map((site) => checkSingleSite(site, supabaseUrl, serviceRoleKey, summary))
  );

  return summary;
}

async function checkSingleSite(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  summary: UptimeCheckSummary
): Promise<void> {
  summary.sitesChecked++;

  const check = await runBasicCheck(site.url);
  const status: "up" | "down" = check.reachable ? "up" : "down";

  if (status === "up") {
    summary.sitesUp++;
  } else {
    summary.sitesDown++;
  }

  // 1. Записываем результат в uptime_checks (time-series, append-only)
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

  // 2. Обновляем "текущее состояние" SSL — простой boolean есть/нет,
  // без точной даты истечения (см. комментарий в шапке файла).
  const sslResult = await upsertRow(
    "ssl_certificates",
    {
      site_id: site.id,
      // valid_until оставляем null намеренно — нет источника точной даты на этом этапе.
      days_until_expiry: check.sslValid ? null : 0,
      last_checked_at: new Date().toISOString(),
    },
    "site_id",
    supabaseUrl,
    serviceRoleKey
  );
  if (!sslResult.ok) summary.errors.push(sslResult.error ?? "ssl_certificates upsert failed");

  // 3. Управление инцидентами: открываем при первом "down", закрываем
  // при восстановлении. Не шлём alert здесь — это будет отдельной задачей
  // (Phase 1: email/Telegram alerts), здесь только трекинг состояния.
  await reconcileIncident(site.id, status, supabaseUrl, serviceRoleKey, summary);
}

async function reconcileIncident(
  siteId: string,
  status: "up" | "down",
  supabaseUrl: string,
  serviceRoleKey: string,
  summary: UptimeCheckSummary
): Promise<void> {
  const openIncidentResult = await selectRows<OpenIncidentRow>(
    "uptime_incidents",
    `select=id,site_id&site_id=eq.${siteId}&resolved_at=is.null`,
    supabaseUrl,
    serviceRoleKey
  );

  if (!openIncidentResult.ok) {
    summary.errors.push(openIncidentResult.error ?? "uptime_incidents select failed");
    return;
  }

  const openIncident = openIncidentResult.data[0];

  if (status === "down" && !openIncident) {
    // Сайт только что упал — открываем новый инцидент.
    const insertResult = await insertRow(
      "uptime_incidents",
      { site_id: siteId, started_at: new Date().toISOString() },
      supabaseUrl,
      serviceRoleKey
    );
    if (insertResult.ok) summary.incidentsOpened++;
    else summary.errors.push(insertResult.error ?? "uptime_incidents insert failed");
    return;
  }

  if (status === "up" && openIncident) {
    // Сайт восстановился — закрываем открытый инцидент.
    const updateResult = await updateRows(
      "uptime_incidents",
      `id=eq.${openIncident.id}`,
      { resolved_at: new Date().toISOString() },
      supabaseUrl,
      serviceRoleKey
    );
    if (updateResult.ok) summary.incidentsResolved++;
    else summary.errors.push(updateResult.error ?? "uptime_incidents update failed");
  }
}

// ============================================================
// runSpeedChecks — тяжёлая проверка (раз в день): Lighthouse через
// PageSpeed Insights API. Дорогая по времени (~10-20с на сайт) и по
// квоте (25k/день на бесплатном тарифе), поэтому отдельно от uptime
// и запускается реже.
// ============================================================

export interface SpeedCheckSummary {
  sitesChecked: number;
  sitesSucceeded: number;
  errors: string[];
}

export async function runSpeedChecks(
  supabaseUrl: string,
  serviceRoleKey: string,
  pageSpeedApiKey: string
): Promise<SpeedCheckSummary> {
  const summary: SpeedCheckSummary = { sitesChecked: 0, sitesSucceeded: 0, errors: [] };

  const sitesResult = await selectRows<SiteRow>(
    "sites",
    "select=id,url,monitoring_enabled&monitoring_enabled=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!sitesResult.ok) {
    summary.errors.push(sitesResult.error ?? "Не вдалося отримати список сайтів");
    return summary;
  }

  // PageSpeed-проверки тяжёлые (~10-20с каждая) — гоняем последовательно,
  // а не Promise.all, чтобы не упереться в одновременный конкурентный
  // лимит исходящих запросов Worker'а и не сжечь дневную квоту API одним
  // взрывом параллельных вызовов при сбое ретраев.
  for (const site of sitesResult.data) {
    summary.sitesChecked++;
    try {
      await checkSingleSiteSpeed(site, supabaseUrl, serviceRoleKey, pageSpeedApiKey);
      summary.sitesSucceeded++;
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
  pageSpeedApiKey: string
): Promise<void> {
  const [basic, pageSpeed] = await Promise.all([
    runBasicCheck(site.url),
    runPageSpeedCheck(site.url, pageSpeedApiKey),
  ]);

  // speed_checks — простой замер времени ответа (приближение к load time;
  // полноценный browser-based замер размера страницы/числа запросов
  // потребовал бы headless browser, чего у нас пока нет).
  await insertRow(
    "speed_checks",
    { site_id: site.id, load_time_ms: basic.responseTimeMs ?? 0 },
    supabaseUrl,
    serviceRoleKey
  );

  if (pageSpeed.available) {
    await insertRow(
      "core_web_vitals_checks",
      {
        site_id: site.id,
        lcp_ms: pageSpeed.lcpMs ? Math.round(pageSpeed.lcpMs) : null,
        inp_ms: pageSpeed.inpMs ? Math.round(pageSpeed.inpMs) : null,
        cls_score: pageSpeed.clsScore,
        performance_score: pageSpeed.performanceScore,
      },
      supabaseUrl,
      serviceRoleKey
    );
  }
}
