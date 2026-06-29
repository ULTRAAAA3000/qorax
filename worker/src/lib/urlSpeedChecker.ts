// ============================================================
// urlSpeedChecker.ts — перевірка швидкості для конкретних URL
// (multi-URL speed monitoring, Starter+)
// Запускається разом з основним speed check у cron.
// ============================================================

import { selectRows, insertRow } from "./supabase";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; QoraxBot/1.0)";

interface MonitoredUrlRow {
  id: string;
  site_id: string;
  url: string;
  label: string | null;
}

export async function runUrlSpeedChecks(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ checked: number; errors: number }> {
  const result = await selectRows<MonitoredUrlRow>(
    "monitored_urls",
    "select=id,site_id,url,label&active=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!result.data?.length) return { checked: 0, errors: 0 };

  let checked = 0, errors = 0;

  for (const mu of result.data) {
    try {
      const { loadTimeMs, statusCode } = await measureUrl(mu.url);
      await insertRow(
        "url_speed_checks",
        {
          monitored_url_id: mu.id,
          site_id: mu.site_id,
          load_time_ms: loadTimeMs,
          status_code: statusCode,
        },
        supabaseUrl,
        serviceRoleKey
      );
      checked++;
    } catch (err) {
      console.error(`URL speed check failed for ${mu.url}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { checked, errors };
}

async function measureUrl(url: string): Promise<{ loadTimeMs: number; statusCode: number }> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const start = Date.now();
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
    });
    clearTimeout(t);
    return { loadTimeMs: Date.now() - start, statusCode: resp.status };
  } catch (err) {
    clearTimeout(t);
    throw err;
  }
}
