// ============================================================
// brokenLinksChecker.ts — краулер битих посилань (Starter+).
//
// Алгоритм:
//   1. Фетчимо головну сторінку сайту
//   2. Витягуємо всі <a href> посилання (внутрішні + зовнішні)
//   3. Паралельно (батч по 10) перевіряємо кожне — HEAD запит
//   4. 4xx/5xx → broken, 2xx/3xx → ok
//   5. Нові broken → INSERT у broken_links
//   6. Раніше broken, тепер ok → UPDATE status='fixed'
//   7. Email алерт якщо знайдені нові битi посилання
//
// Запускається раз на тиждень (щонеділі о 4:30 UTC).
// Для великих сайтів обмежуємо: макс 100 посилань за один прохід.
// ============================================================

import { selectRows, insertRow, updateRows } from "./supabase";
import { sendEmail } from "./email";

const FETCH_TIMEOUT_MS = 10_000;
const BATCH_SIZE = 10;
const MAX_LINKS = 100;
const USER_AGENT = "Mozilla/5.0 (compatible; QoraxBot/1.0; +https://qorax.com/bot)";

// ─── Типи ───────────────────────────────────────────────────

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  organization_id: string;
}

interface PlanRow { code: string }
interface SubscriptionRow { plans: PlanRow | null }

interface ExistingBrokenLink {
  id: string;
  broken_url: string;
  status: string;
}

export interface BrokenLinksResult {
  siteId: string;
  checked: number;
  newBroken: number;
  fixed: number;
  error?: string;
}

// ─── Main ────────────────────────────────────────────────────

export async function runBrokenLinksChecks(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string
): Promise<{ sites: number; newBroken: number; fixed: number; errors: number }> {
  const sitesResult = await selectRows<SiteRow>(
    "sites",
    "select=id,url,display_name,organization_id&monitoring_enabled=eq.true",
    supabaseUrl,
    serviceRoleKey
  );

  if (!sitesResult.ok || sitesResult.data.length === 0) {
    return { sites: 0, newBroken: 0, fixed: 0, errors: 0 };
  }

  let sites = 0, newBroken = 0, fixed = 0, errors = 0;

  for (const site of sitesResult.data) {
    // Перевіряємо план — broken links доступні з Starter+
    const subResult = await selectRows<SubscriptionRow>(
      "subscriptions",
      `select=plans(code)&organization_id=eq.${encodeURIComponent(site.organization_id)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
      supabaseUrl,
      serviceRoleKey
    );
    const planCode = (subResult.data[0]?.plans as PlanRow | null)?.code ?? "free";
    const hasAccess = ["starter", "growth", "agency", "admin", "trial"].includes(planCode);
    if (!hasAccess) continue;

    try {
      const result = await checkSiteBrokenLinks(
        site, supabaseUrl, serviceRoleKey, resendApiKey, appUrl
      );
      sites++;
      newBroken += result.newBroken;
      fixed += result.fixed;
      if (result.error) errors++;
    } catch (err) {
      console.error(`Broken links check failed for ${site.url}:`, err instanceof Error ? err.message : err);
      errors++;
    }
  }

  return { sites, newBroken, fixed, errors };
}

// ─── Перевірка одного сайту ───────────────────────────────────

async function checkSiteBrokenLinks(
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string
): Promise<BrokenLinksResult> {
  const baseUrl = normalizeBase(site.url);

  // Кроулимо головну сторінку
  let html: string;
  try {
    html = await fetchHtml(baseUrl);
  } catch (err) {
    return { siteId: site.id, checked: 0, newBroken: 0, fixed: 0, error: String(err) };
  }

  // Витягуємо посилання
  const links = extractLinks(html, baseUrl).slice(0, MAX_LINKS);

  // Завантажуємо вже відомі broken links з БД
  const existingResult = await selectRows<ExistingBrokenLink>(
    "broken_links",
    `select=id,broken_url,status&site_id=eq.${encodeURIComponent(site.id)}`,
    supabaseUrl,
    serviceRoleKey
  );
  const existingMap = new Map<string, ExistingBrokenLink>(
    existingResult.data.map((r) => [r.broken_url, r])
  );

  // Перевіряємо посилання батчами
  const results = await checkLinksBatch(links);

  const newlyBroken: { url: string; status: number }[] = [];
  const nowFixed: string[] = [];

  for (const { url, statusCode, ok } of results) {
    const existing = existingMap.get(url);

    if (!ok) {
      if (!existing || existing.status === "fixed") {
        // Нове або повернулось — записуємо
        newlyBroken.push({ url, status: statusCode });
        await insertRow(
          "broken_links",
          {
            site_id: site.id,
            source_page_url: baseUrl,
            broken_url: url,
            http_status_code: statusCode,
            status: "broken",
            first_found_at: new Date().toISOString(),
            last_checked_at: new Date().toISOString(),
          },
          supabaseUrl,
          serviceRoleKey
        );
      } else {
        // Вже відома — оновлюємо last_checked_at
        await updateRows(
          "broken_links",
          `id=eq.${encodeURIComponent(existing.id)}`,
          { last_checked_at: new Date().toISOString() },
          supabaseUrl,
          serviceRoleKey
        );
      }
    } else if (existing && existing.status === "broken") {
      // Виправлено — позначаємо fixed
      nowFixed.push(url);
      await updateRows(
        "broken_links",
        `id=eq.${encodeURIComponent(existing.id)}`,
        { status: "fixed", fixed_at: new Date().toISOString() },
        supabaseUrl,
        serviceRoleKey
      );
    }
  }

  // Email якщо є нові битi посилання
  if (newlyBroken.length > 0) {
    await sendBrokenLinksAlert(
      site, newlyBroken, supabaseUrl, serviceRoleKey, resendApiKey, appUrl
    );
  }

  return {
    siteId: site.id,
    checked: results.length,
    newBroken: newlyBroken.length,
    fixed: nowFixed.length,
  };
}

// ─── Link extraction ──────────────────────────────────────────

function extractLinks(html: string, baseUrl: string): string[] {
  const hrefs = new Set<string>();
  const regex = /href=["']([^"'#?][^"']*?)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html)) !== null) {
    const href = match[1].trim();
    if (!href || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;

    try {
      const absolute = new URL(href, baseUrl).href;
      // Тільки http/https
      if (!absolute.startsWith("http")) continue;
      hrefs.add(absolute);
    } catch { continue; }
  }

  return Array.from(hrefs);
}

// ─── Batch link checker ───────────────────────────────────────

interface LinkCheckResult {
  url: string;
  statusCode: number;
  ok: boolean;
}

async function checkLinksBatch(urls: string[]): Promise<LinkCheckResult[]> {
  const results: LinkCheckResult[] = [];

  // Обробляємо батчами щоб не перевантажити мережу
  for (let i = 0; i < urls.length; i += BATCH_SIZE) {
    const batch = urls.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(checkSingleLink));
    results.push(...batchResults);
  }

  return results;
}

async function checkSingleLink(url: string): Promise<LinkCheckResult> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // Спробуємо HEAD спочатку (швидше), потім GET якщо HEAD не підтримується
    let resp = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
      },
      redirect: "follow",
    });

    // Деякі сервери відхиляють HEAD — пробуємо GET
    if (resp.status === 405) {
      resp = await fetch(url, {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT },
        redirect: "follow",
      });
    }

    clearTimeout(t);

    const ok = resp.status >= 200 && resp.status < 400;
    return { url, statusCode: resp.status, ok };
  } catch {
    // Timeout або мережева помилка = broken
    return { url, statusCode: 0, ok: false };
  }
}

// ─── Alert email ──────────────────────────────────────────────

async function sendBrokenLinksAlert(
  site: SiteRow,
  brokenLinks: { url: string; status: number }[],
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  appUrl: string
): Promise<void> {
  // Отримуємо email власника
  interface MemberRow { user_id: string }
  const memberResult = await selectRows<MemberRow>(
    "organization_members",
    `select=user_id&organization_id=eq.${encodeURIComponent(site.organization_id)}&role=eq.owner&limit=1`,
    supabaseUrl,
    serviceRoleKey
  );
  const ownerId = memberResult.data[0]?.user_id;
  if (!ownerId) return;

  try {
    const authResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${ownerId}`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!authResp.ok) return;
    const authUser = (await authResp.json()) as { email?: string };
    if (!authUser.email) return;

    const dashUrl = `${appUrl}/dashboard/sites/${site.id}`;
    const linksHtml = brokenLinks
      .slice(0, 10)
      .map(
        ({ url, status }) =>
          `<div style="padding:10px 0;border-bottom:1px solid #1e2a3a;">
            <span style="font-size:12px;padding:2px 8px;border-radius:6px;background:rgba(245,103,90,0.15);color:#F5675A;font-family:monospace;">${status || "timeout"}</span>
            <span style="font-size:13px;color:#8a9bb0;margin-left:10px;word-break:break-all;">${url}</span>
          </div>`
      )
      .join("");

    await sendEmail(
      {
        to: authUser.email,
        subject: `⚠️ ${brokenLinks.length} битих посилань на ${site.display_name}`,
        html: `<!DOCTYPE html>
<html lang="uk"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:#fff;">Qorax</span>
    </div>
    <div style="background:#131929;border:1px solid #1e2a3a;border-radius:16px;padding:32px;">
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#fff;">
        ⚠️ Знайдено битих посилань: ${brokenLinks.length}
      </h1>
      <p style="margin:0 0 24px;color:#8a9bb0;font-size:15px;">
        Сайт: <strong style="color:#fff;">${site.display_name}</strong>
      </p>
      <div style="margin-bottom:24px;">${linksHtml}</div>
      ${brokenLinks.length > 10 ? `<p style="color:#5a7090;font-size:13px;margin-bottom:24px;">... та ще ${brokenLinks.length - 10} посилань</p>` : ""}
      <a href="${dashUrl}" style="display:block;text-align:center;background:#D6FF3F;color:#0C111D;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;">
        Переглянути в дашборді →
      </a>
    </div>
    <p style="text-align:center;color:#3a4a5a;font-size:12px;margin-top:24px;">Qorax · Моніторинг сайтів</p>
  </div>
</body></html>`,
      },
      resendApiKey
    );
  } catch { /* email не критичний */ }
}

// ─── Utils ────────────────────────────────────────────────────

function normalizeBase(url: string): string {
  try {
    const p = new URL(url);
    return `${p.protocol}//${p.host}`;
  } catch { return url; }
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(t);
  }
}
