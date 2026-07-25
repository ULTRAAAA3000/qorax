// ============================================================
// developerMonitorChecker.ts — ядро Monitoring API (Qorax SEO
// Platform, Developer API, 4/5). Дає "знімок" стану сторінки:
// title/canonical/hasSchema/robotsAllowed/pagespeed — саме ті
// поля, що явно названі в початковому документі Артема
// ("Title змінився / Canonical зник / Schema зламалась / Robots
// змінився / Швидкість впала").
//
// НАВМИСНО окремий від seoChecker.ts::fetchMeta()/fetchRobots() —
// ті приватні функції завʼязані на внутрішню модель (site_id з
// таблиці sites, запис у page_seo_audits/sitemap_audits), не на
// довільний зовнішній URL без організації Qorax. Той самий принцип
// незалежності, що вже застосований у basicCheck.ts (SEO Audit API)
// і developerReportGenerator.ts (Reporting API) — Developer API
// свідомо не ділить внутрішню персистентність із рештою платформи.
// ============================================================

import { runPageSpeedChecks } from "./pageSpeed";

export interface MonitorSnapshot {
  reachable: boolean;
  errorMessage?: string;
  title: string | null;
  canonical: string | null;
  hasSchema: boolean;
  robotsAllowed: boolean;
  pagespeedMobile: number | null;
}

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; QoraxMonitorBot/1.0; +https://qorax-sites.com/bot)";

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal, redirect: "follow" });
  } finally {
    clearTimeout(timeout);
  }
}

function extractTag(html: string, regex: RegExp): string | null {
  const match = html.match(regex);
  return match ? match[1].trim() : null;
}

/** robots.txt перевірка — той самий спрощений підхід, що вже
 * прийнятий у seoChecker.ts::fetchRobots(): чи є хоч один
 * "Disallow: /" без специфічного User-agent виключення для решти —
 * повний парсинг усіх правил для кожного можливого User-agent не
 * потрібен для MVP-рівня "чи взагалі заблоковано індексацію". */
async function checkRobotsAllowed(baseUrl: string): Promise<boolean> {
  try {
    const origin = new URL(baseUrl).origin;
    const resp = await fetchWithTimeout(`${origin}/robots.txt`);
    if (!resp.ok) return true; // немає robots.txt = усе дозволено
    const text = await resp.text();
    return !/^\s*Disallow:\s*\/\s*$/im.test(text);
  } catch {
    return true; // недоступний robots.txt — не блокуємо перевірку через це
  }
}

/**
 * Знімок стану сторінки для порівняння з baseline. pagespeedMobile
 * передається як окремий, опційний виклик (googleApiKey може бути
 * відсутній у деяких середовищах) — якщо googleApiKey не передано,
 * поле лишається null, решта полів (title/canonical/schema/robots)
 * все одно перевіряються.
 */
export async function takeMonitorSnapshot(url: string, googlePageSpeedApiKey?: string): Promise<MonitorSnapshot> {
  let html: string;
  try {
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) {
      return { reachable: false, errorMessage: `HTTP ${resp.status}`, title: null, canonical: null, hasSchema: false, robotsAllowed: true, pagespeedMobile: null };
    }
    html = await resp.text();
  } catch (e) {
    return { reachable: false, errorMessage: e instanceof Error ? e.message : "fetch failed", title: null, canonical: null, hasSchema: false, robotsAllowed: true, pagespeedMobile: null };
  }

  const title = extractTag(html, /<title[^>]*>([^<]*)<\/title>/i);
  const canonical = extractTag(html, /<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  const hasSchema = /<script[^>]+type=["']application\/ld\+json["']/i.test(html);

  const [robotsAllowed, pageSpeedResult] = await Promise.all([
    checkRobotsAllowed(url),
    googlePageSpeedApiKey ? runPageSpeedChecks(url, googlePageSpeedApiKey).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    reachable: true,
    title,
    canonical,
    hasSchema,
    robotsAllowed,
    pagespeedMobile: pageSpeedResult?.mobile.performanceScore ?? null,
  };
}

export interface DetectedChange {
  field: "title" | "canonical" | "schema" | "robots" | "pagespeed";
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Порівнює новий знімок із baseline, повертає список ЗМІН (не
 * повний стан) — порожній масив означає "нічого не змінилось".
 * pagespeed вважається зміною лише якщо різниця ≥10 пунктів (щоб
 * природні коливання вимірювання PageSpeed між прогонами не
 * генерували "зміну" щогодини — той самий принцип шумозаглушення,
 * що вже застосовано деінде на платформі для деградації швидкості).
 */
export function detectChanges(
  baseline: {
    title: string | null;
    canonical: string | null;
    hasSchema: boolean | null;
    robotsAllowed: boolean | null;
    pagespeedMobile: number | null;
  },
  current: MonitorSnapshot
): DetectedChange[] {
  const changes: DetectedChange[] = [];

  if (baseline.title !== current.title) {
    changes.push({ field: "title", oldValue: baseline.title, newValue: current.title });
  }
  if (baseline.canonical !== current.canonical) {
    changes.push({ field: "canonical", oldValue: baseline.canonical, newValue: current.canonical });
  }
  if (baseline.hasSchema !== null && baseline.hasSchema !== current.hasSchema) {
    changes.push({ field: "schema", oldValue: String(baseline.hasSchema), newValue: String(current.hasSchema) });
  }
  if (baseline.robotsAllowed !== null && baseline.robotsAllowed !== current.robotsAllowed) {
    changes.push({ field: "robots", oldValue: String(baseline.robotsAllowed), newValue: String(current.robotsAllowed) });
  }
  if (
    baseline.pagespeedMobile !== null &&
    current.pagespeedMobile !== null &&
    Math.abs(baseline.pagespeedMobile - current.pagespeedMobile) >= 10
  ) {
    changes.push({ field: "pagespeed", oldValue: String(baseline.pagespeedMobile), newValue: String(current.pagespeedMobile) });
  }

  return changes;
}
