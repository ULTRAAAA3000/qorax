// ============================================================
// seoChecker.ts — SEO crawler для Growth+ сайтів.
//
// За один прохід перевіряє:
//   1. Meta-теги головної сторінки (title, description, h1, schema)
//   2. sitemap.xml — знаходить, рахує URL, виявляє помилки
//   3. robots.txt — чи існує, чи не блокує важливі сторінки
//
// Запускається щодня у 3:00 вкупі з runSpeedChecks.
// Записує результати у:
//   - page_seo_audits  (meta/schema)
//   - sitemap_audits   (sitemap + robots)
// ============================================================

import { selectRows, insertRow, upsertRow } from "./supabase";

const FETCH_TIMEOUT_MS = 10_000;
const USER_AGENT = "Mozilla/5.0 (compatible; QoraxBot/1.0; +https://qorax.com/bot)";

// ─── Типи ───────────────────────────────────────────────────

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  organization_id: string;
}

interface PlanRow {
  code: string;
}

interface SubscriptionRow {
  plans: PlanRow | null;
}

export interface SeoCheckSummary {
  siteId: string;
  siteUrl: string;
  seoIssues: string[];
  sitemapIssues: string[];
  error?: string;
}

// ─── Main ────────────────────────────────────────────────────

export async function runSeoChecks(
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ checked: number; errors: number }> {
  // Беремо лише сайти з Growth+ планом
  const sitesResult = await selectRows<SiteRow>(
    "sites",
    "select=id,url,display_name,organization_id&monitoring_enabled=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!sitesResult.ok || sitesResult.data.length === 0) {
    return { checked: 0, errors: 0 };
  }

  let checked = 0;
  let errors = 0;

  for (const site of sitesResult.data) {
    // Перевіряємо план організації
    const subResult = await selectRows<SubscriptionRow>(
      "subscriptions",
      `select=plans(code)&organization_id=eq.${encodeURIComponent(site.organization_id)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
      supabaseUrl,
      serviceRoleKey
    );

    const planCode = (subResult.data[0]?.plans as PlanRow | null)?.code ?? "free";
    const isGrowthPlus = ["growth", "agency", "admin", "trial"].includes(planCode);
    if (!isGrowthPlus) continue;

    try {
      const summary = await checkSite(site, supabaseUrl, serviceRoleKey);
      if (summary.error) errors++;
      else checked++;
    } catch (err) {
      console.error(`SEO check failed for ${site.url}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { checked, errors };
}

// ─── Одна перевірка для одного сайту ─────────────────────────

async function checkSite(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<SeoCheckSummary> {
  const baseUrl = normalizeBaseUrl(site.url);

  // Всі три перевірки паралельно
  const [metaResult, sitemapResult, robotsResult] = await Promise.allSettled([
    fetchMeta(baseUrl),
    fetchSitemap(baseUrl),
    fetchRobots(baseUrl),
  ]);

  const metaData = metaResult.status === "fulfilled" ? metaResult.value : null;
  const sitemapData = sitemapResult.status === "fulfilled" ? sitemapResult.value : null;
  const robotsData = robotsResult.status === "fulfilled" ? robotsResult.value : null;

  // ── page_seo_audits ──
  const seoIssues: string[] = [];
  if (metaData) {
    if (!metaData.title) seoIssues.push("Відсутній <title>");
    else if (metaData.titleLength < 30) seoIssues.push(`Title занадто короткий (${metaData.titleLength} символів, мін. 30)`);
    else if (metaData.titleLength > 60) seoIssues.push(`Title занадто довгий (${metaData.titleLength} символів, макс. 60)`);

    if (!metaData.metaDescription) seoIssues.push("Відсутній meta description");
    else if (metaData.metaDescriptionLength < 70) seoIssues.push(`Meta description занадто короткий (${metaData.metaDescriptionLength} симв.)`);
    else if (metaData.metaDescriptionLength > 160) seoIssues.push(`Meta description занадто довгий (${metaData.metaDescriptionLength} симв., макс. 160)`);

    if (!metaData.hasH1) seoIssues.push("Відсутній тег <h1>");
    else if (metaData.h1Count > 1) seoIssues.push(`Декілька тегів <h1> (знайдено: ${metaData.h1Count})`);
  } else {
    seoIssues.push("Не вдалося отримати HTML сторінки");
  }

  await insertRow(
    "page_seo_audits",
    {
      site_id: site.id,
      page_url: baseUrl,
      title: metaData?.title ?? null,
      title_length: metaData?.titleLength ?? null,
      meta_description: metaData?.metaDescription ?? null,
      meta_description_length: metaData?.metaDescriptionLength ?? null,
      has_h1: metaData?.hasH1 ?? null,
      h1_count: metaData?.h1Count ?? null,
      has_schema_markup: metaData?.hasSchema ?? null,
      schema_types: JSON.stringify(metaData?.schemaTypes ?? []),
      issues: JSON.stringify(seoIssues),
    },
    supabaseUrl,
    serviceRoleKey
  );

  // ── sitemap_audits ──
  const sitemapIssues: string[] = [];
  const sitemapErrors: string[] = [];
  const robotsIssues: string[] = [];

  if (!sitemapData?.found) sitemapIssues.push("sitemap.xml не знайдено");
  if (sitemapData?.found && (sitemapData.urlCount ?? 0) === 0) sitemapErrors.push("Sitemap порожній (0 URL)");
  if (!robotsData?.found) robotsIssues.push("robots.txt не знайдено");
  if (robotsData?.blocksImportantPages) robotsIssues.push("robots.txt блокує важливі сторінки (Disallow: /)");

  await upsertRow(
    "sitemap_audits",
    {
      site_id: site.id,
      sitemap_found: sitemapData?.found ?? false,
      sitemap_url: sitemapData?.url ?? null,
      urls_in_sitemap: sitemapData?.urlCount ?? null,
      sitemap_errors: JSON.stringify(sitemapErrors),
      robots_found: robotsData?.found ?? false,
      robots_blocks_important_pages: robotsData?.blocksImportantPages ?? false,
      robots_issues: JSON.stringify(robotsIssues),
      checked_at: new Date().toISOString(),
    },
    "site_id",
    supabaseUrl,
    serviceRoleKey
  );

  return {
    siteId: site.id,
    siteUrl: site.url,
    seoIssues,
    sitemapIssues: [...sitemapIssues, ...sitemapErrors, ...robotsIssues],
  };
}

// ─── Meta / Schema parser ─────────────────────────────────────

interface MetaData {
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  hasH1: boolean;
  h1Count: number;
  hasSchema: boolean;
  schemaTypes: string[];
}

async function fetchMeta(url: string): Promise<MetaData | null> {
  try {
    const resp = await fetchWithTimeout(url);
    if (!resp.ok) return null;

    const html = await resp.text();

    const title = extractTag(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
    const metaDescription = extractMeta(html, "description");
    const h1Matches = html.match(/<h1[^>]*>/gi) ?? [];
    const schemaScripts = html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi) ?? [];

    const schemaTypes: string[] = [];
    for (const script of schemaScripts) {
      try {
        const inner = script.replace(/<script[^>]*>/i, "").replace(/<\/script>/i, "");
        const parsed = JSON.parse(inner) as { "@type"?: string };
        if (parsed["@type"]) schemaTypes.push(parsed["@type"]);
      } catch { /* malformed JSON-LD — skip */ }
    }

    return {
      title: title?.trim() ?? null,
      titleLength: title?.trim().length ?? 0,
      metaDescription: metaDescription?.trim() ?? null,
      metaDescriptionLength: metaDescription?.trim().length ?? 0,
      hasH1: h1Matches.length > 0,
      h1Count: h1Matches.length,
      hasSchema: schemaScripts.length > 0,
      schemaTypes,
    };
  } catch {
    return null;
  }
}

// ─── Sitemap parser ───────────────────────────────────────────

interface SitemapData {
  found: boolean;
  url: string | null;
  urlCount: number | null;
}

async function fetchSitemap(baseUrl: string): Promise<SitemapData> {
  // Спочатку перевіряємо sitemap через robots.txt
  // Потім стандартний шлях /sitemap.xml
  const candidates = [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/sitemap/sitemap.xml`,
  ];

  for (const candidate of candidates) {
    try {
      const resp = await fetchWithTimeout(candidate);
      if (!resp.ok) continue;

      const xml = await resp.text();
      if (!xml.includes("<urlset") && !xml.includes("<sitemapindex")) continue;

      // Рахуємо <url> або <sitemap> елементи
      const urlMatches = xml.match(/<loc>/g) ?? [];

      return {
        found: true,
        url: candidate,
        urlCount: urlMatches.length,
      };
    } catch { continue; }
  }

  return { found: false, url: null, urlCount: null };
}

// ─── Robots parser ────────────────────────────────────────────

interface RobotsData {
  found: boolean;
  blocksImportantPages: boolean;
}

async function fetchRobots(baseUrl: string): Promise<RobotsData> {
  try {
    const resp = await fetchWithTimeout(`${baseUrl}/robots.txt`);
    if (!resp.ok) return { found: false, blocksImportantPages: false };

    const text = await resp.text();
    if (!text.trim()) return { found: false, blocksImportantPages: false };

    // Критична проблема: Disallow: / для всіх або Googlebot
    const blocksAll =
      /Disallow:\s*\/\s*$/m.test(text) &&
      /User-agent:\s*(\*|Googlebot)/i.test(text);

    return { found: true, blocksImportantPages: blocksAll };
  } catch {
    return { found: false, blocksImportantPages: false };
  }
}

// ─── Utils ────────────────────────────────────────────────────

function normalizeBaseUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

function extractTag(html: string, regex: RegExp): string | null {
  const m = html.match(regex);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  const regex = new RegExp(
    `<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']+)["']`,
    "i"
  );
  const m = html.match(regex);
  if (m) return m[1];

  // Alternate attribute order
  const regex2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${name}["']`,
    "i"
  );
  const m2 = html.match(regex2);
  return m2 ? m2[1] : null;
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
  } finally {
    clearTimeout(t);
  }
}
