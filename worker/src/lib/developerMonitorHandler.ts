// ============================================================
// developerMonitorHandler.ts — Monitoring API (Qorax SEO Platform,
// Developer API, 4/5, останній із початкового списку — AI SEO API
// свідомо пропущено назавжди).
//
// POST /api/v1/monitor — додає URL під моніторинг, одразу знімає
//   baseline (перший знімок стану).
// GET /api/v1/monitor — список усіх URL цього ключа + останній
//   статус + нещодавні зміни.
// DELETE /api/v1/monitor/:id — знімає URL з моніторингу
//   (active=false, м'яке видалення — лог змін лишається доступним).
//
// Щогодинний cron (worker/src/index.ts, runDeveloperMonitorChecks())
// звіряє всі активні URL із baseline, записує зміни в
// developer_monitor_changes, оновлює baseline при зміні — БЕЗ
// webhook-доставки назовні (окремий наступний крок за прямою
// вказівкою Артема, щоб не робити все одразу).
// ============================================================

import { json } from "./httpUtils";
import { normalizeAndValidateUrl } from "./url";
import { validateAndConsumeApiKey, logApiRequest } from "./developerApiAuth";
import { takeMonitorSnapshot, detectChanges } from "./developerMonitorChecker";
import { selectRows, insertRowReturning, updateRows } from "./supabase";
import type { Env } from "../types";

const DEVELOPER_API_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

interface MonitoredUrlRow {
  id: string;
  url: string;
  active: boolean;
  baseline_title: string | null;
  baseline_canonical: string | null;
  baseline_has_schema: boolean | null;
  baseline_robots_allowed: boolean | null;
  baseline_pagespeed_mobile: number | null;
  last_checked_at: string | null;
  last_check_ok: boolean | null;
  created_at: string;
}

interface MonitorRequestBody {
  url?: unknown;
}

export async function handleDeveloperMonitorCreate(request: Request, env: Env): Promise<Response> {
  const corsHeaders = DEVELOPER_API_CORS_HEADERS;

  const auth = await validateAndConsumeApiKey(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401, corsHeaders);

  let body: MonitorRequestBody;
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
    await logApiRequest(auth.apiKeyId!, "/api/v1/monitor", body.url, 400, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    return json({ error: validation.error }, 400, corsHeaders);
  }

  // Перший знімок стає baseline одразу при створенні — не чекаємо
  // на наступний годинний cron-прогін, щоб перша перевірка "з нуля"
  // не порівнювалась з порожнім baseline (що завжди дало б "зміну").
  const snapshot = await takeMonitorSnapshot(validation.url, env.GOOGLE_PAGESPEED_API_KEY);

  const created = await insertRowReturning<MonitoredUrlRow>(
    "developer_monitored_urls",
    {
      api_key_id: auth.apiKeyId,
      url: validation.url,
      baseline_title: snapshot.title,
      baseline_canonical: snapshot.canonical,
      baseline_has_schema: snapshot.hasSchema,
      baseline_robots_allowed: snapshot.robotsAllowed,
      baseline_pagespeed_mobile: snapshot.pagespeedMobile,
      last_checked_at: new Date().toISOString(),
      last_check_ok: snapshot.reachable,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  await logApiRequest(auth.apiKeyId!, "/api/v1/monitor", validation.url, created.ok ? 201 : 500, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  if (!created.ok || !created.data[0]) {
    return json({ error: created.error ?? "Не вдалося додати URL під моніторинг" }, 500, corsHeaders);
  }

  const row = created.data[0];
  return json(
    {
      id: row.id,
      url: row.url,
      reachable: snapshot.reachable,
      baseline: { title: row.baseline_title, canonical: row.baseline_canonical, hasSchema: row.baseline_has_schema, robotsAllowed: row.baseline_robots_allowed, pagespeedMobile: row.baseline_pagespeed_mobile },
    },
    201,
    corsHeaders
  );
}

interface ChangeRow {
  monitored_url_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string;
}

export async function handleDeveloperMonitorList(request: Request, env: Env): Promise<Response> {
  const corsHeaders = DEVELOPER_API_CORS_HEADERS;

  const auth = await validateAndConsumeApiKey(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401, corsHeaders);

  const urlsResult = await selectRows<MonitoredUrlRow>(
    "developer_monitored_urls",
    `select=id,url,active,baseline_title,baseline_canonical,baseline_has_schema,baseline_robots_allowed,baseline_pagespeed_mobile,last_checked_at,last_check_ok,created_at&api_key_id=eq.${encodeURIComponent(auth.apiKeyId!)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!urlsResult.ok) return json({ error: urlsResult.error }, 500, corsHeaders);

  const urlIds = urlsResult.data.map(u => u.id);
  let changesByUrl: Record<string, ChangeRow[]> = {};
  if (urlIds.length > 0) {
    const idsFilter = urlIds.map(id => encodeURIComponent(id)).join(",");
    const changesResult = await selectRows<ChangeRow>(
      "developer_monitor_changes",
      `select=monitored_url_id,field,old_value,new_value,detected_at&monitored_url_id=in.(${idsFilter})&order=detected_at.desc&limit=100`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (changesResult.ok) {
      changesByUrl = {};
      for (const change of changesResult.data) {
        (changesByUrl[change.monitored_url_id] ??= []).push(change);
      }
    }
  }

  return json(
    {
      monitors: urlsResult.data.map(row => ({
        id: row.id,
        url: row.url,
        active: row.active,
        baseline: { title: row.baseline_title, canonical: row.baseline_canonical, hasSchema: row.baseline_has_schema, robotsAllowed: row.baseline_robots_allowed, pagespeedMobile: row.baseline_pagespeed_mobile },
        lastCheckedAt: row.last_checked_at,
        lastCheckOk: row.last_check_ok,
        recentChanges: (changesByUrl[row.id] ?? []).map(c => ({ field: c.field, oldValue: c.old_value, newValue: c.new_value, detectedAt: c.detected_at })),
      })),
    },
    200,
    corsHeaders
  );
}

export async function handleDeveloperMonitorDelete(monitorId: string, request: Request, env: Env): Promise<Response> {
  const corsHeaders = DEVELOPER_API_CORS_HEADERS;

  const auth = await validateAndConsumeApiKey(request, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!auth.ok) return json({ error: auth.error }, auth.status ?? 401, corsHeaders);

  // Фільтр по api_key_id у WHERE — гарантія, що ключ не зможе
  // деактивувати чужий монітор, підставивши довільний id в URL (той
  // самий принцип, що developerApiKeysHandler.ts::handleDeveloperApiKeyRevoke).
  const result = await updateRows(
    "developer_monitored_urls",
    `id=eq.${encodeURIComponent(monitorId)}&api_key_id=eq.${encodeURIComponent(auth.apiKeyId!)}`,
    { active: false },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!result.ok) return json({ error: result.error ?? "Не вдалося видалити монітор" }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

/**
 * Щогодинний cron sweep (worker/src/index.ts, "0 * * * *" тригер) —
 * звіряє ВСІ активні developer_monitored_urls з їхнім baseline,
 * записує виявлені зміни в developer_monitor_changes, оновлює
 * baseline на НОВИЙ стан (не лишає старий baseline назавжди —
 * інакше одна зміна title генерувала б "зміну" щогодини
 * нескінченно, detectChanges() порівнює лише з ПОПЕРЕДНІМ станом).
 *
 * НЕ використовує API-ключ і requests_limit (це фонова платформна
 * робота, не виклик від зовнішнього розробника) — service-role
 * напряму, той самий підхід, що решта нічних/погодинних cron-задач
 * платформи (runUptimeChecks/runSeoChecks/тощо).
 *
 * Без webhook-доставки назовні (за прямою вказівкою Артема, MVP-
 * рівень) — зміни лишаються видимі лише через GET /api/v1/monitor.
 */
export async function runDeveloperMonitorChecks(env: Env): Promise<{ checked: number; changed: number; errors: number }> {
  const activeResult = await selectRows<MonitoredUrlRow>(
    "developer_monitored_urls",
    "select=id,url,baseline_title,baseline_canonical,baseline_has_schema,baseline_robots_allowed,baseline_pagespeed_mobile&active=eq.true",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!activeResult.ok) {
    console.error("[monitor-cron] Failed to fetch active monitors:", activeResult.error);
    return { checked: 0, changed: 0, errors: 1 };
  }

  let changedCount = 0;
  let errorCount = 0;

  for (const monitor of activeResult.data) {
    try {
      const snapshot = await takeMonitorSnapshot(monitor.url, env.GOOGLE_PAGESPEED_API_KEY);

      if (!snapshot.reachable) {
        await updateRows(
          "developer_monitored_urls",
          `id=eq.${encodeURIComponent(monitor.id)}`,
          { last_checked_at: new Date().toISOString(), last_check_ok: false },
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        );
        continue;
      }

      const changes = detectChanges(
        {
          title: monitor.baseline_title,
          canonical: monitor.baseline_canonical,
          hasSchema: monitor.baseline_has_schema,
          robotsAllowed: monitor.baseline_robots_allowed,
          pagespeedMobile: monitor.baseline_pagespeed_mobile,
        },
        snapshot
      );

      if (changes.length > 0) {
        changedCount++;
        // Записуємо кожну зміну окремим рядком — послідовно, не
        // Promise.all, щоб не створювати сплеск паралельних insert
        // при монітору з кількома одночасними змінами (рідкісний
        // випадок, послідовність тут не критична для швидкості).
        for (const change of changes) {
          await insertRowReturning(
            "developer_monitor_changes",
            { monitored_url_id: monitor.id, field: change.field, old_value: change.oldValue, new_value: change.newValue },
            env.SUPABASE_URL,
            env.SUPABASE_SERVICE_ROLE_KEY
          );
        }
      }

      // Baseline завжди оновлюється на поточний стан (навіть якщо
      // changes.length === 0) — last_checked_at/last_check_ok мають
      // відображати щойно виконану перевірку незалежно від того, чи
      // була зміна.
      await updateRows(
        "developer_monitored_urls",
        `id=eq.${encodeURIComponent(monitor.id)}`,
        {
          baseline_title: snapshot.title,
          baseline_canonical: snapshot.canonical,
          baseline_has_schema: snapshot.hasSchema,
          baseline_robots_allowed: snapshot.robotsAllowed,
          baseline_pagespeed_mobile: snapshot.pagespeedMobile,
          last_checked_at: new Date().toISOString(),
          last_check_ok: true,
        },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
    } catch (e) {
      errorCount++;
      console.error("[monitor-cron] Failed to check monitor:", monitor.id, monitor.url, e);
    }
  }

  return { checked: activeResult.data.length, changed: changedCount, errors: errorCount };
}
