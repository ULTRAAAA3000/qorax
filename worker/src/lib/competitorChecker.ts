// ============================================================
// competitorChecker.ts — моніторинг змін на сайтах конкурентів.
//
// Алгоритм:
//   1. Беремо всі competitor_sites для Growth+ організацій
//   2. Фетчимо HTML, очищуємо від шуму (дати, timestamp, nav)
//   3. Рахуємо SHA-256 очищеного тексту
//   4. Якщо хеш відрізняється від збереженого → записуємо competitor_change
//   5. Шлємо email (і Telegram якщо підключений) власнику сайту
//   6. Оновлюємо content_hash + content_snapshot + last_change_at у competitor_sites
//
// Запускається щодня у 3:00 вкупі з SEO checker.
// ============================================================

import { selectRows, insertRow, updateRows } from "./supabase";
import { sendEmail } from "./email";
import { sendTelegramMessage } from "./telegram";

const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "Mozilla/5.0 (compatible; QoraxBot/1.0; +https://qorax.com/bot)";
const SNAPSHOT_LENGTH = 2000; // символів для збереження (preview diff)

// ─── Типи ───────────────────────────────────────────────────

interface CompetitorSiteRow {
  id: string;
  site_id: string;
  url: string;
  display_name: string | null;
  content_hash: string | null;
  content_snapshot: string | null;
  last_checked_at: string | null;
}

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

interface OrgMemberRow {
  user_id: string;
}

interface ProfileRow {
  id: string;
  full_name: string | null;
}

interface NotificationRow {
  email_alerts: boolean;
  telegram_alerts: boolean;
  telegram_chat_id: string | null;
}

// ─── Main ────────────────────────────────────────────────────

export async function runCompetitorChecks(
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  telegramBotToken: string,
  appUrl: string
): Promise<{ checked: number; changes: number; errors: number }> {
  // Беремо всі конкуруючі сайти одним запитом
  const competitorsResult = await selectRows<CompetitorSiteRow>(
    "competitor_sites",
    "select=id,site_id,url,display_name,content_hash,content_snapshot,last_checked_at",
    supabaseUrl,
    serviceRoleKey
  );

  if (!competitorsResult.ok || competitorsResult.data.length === 0) {
    return { checked: 0, changes: 0, errors: 0 };
  }

  let checked = 0;
  let changes = 0;
  let errors = 0;

  for (const competitor of competitorsResult.data) {
    // Перевіряємо план власника сайту
    const siteResult = await selectRows<SiteRow>(
      "sites",
      `select=id,url,display_name,organization_id&id=eq.${encodeURIComponent(competitor.site_id)}`,
      supabaseUrl,
      serviceRoleKey
    );
    const site = siteResult.data[0];
    if (!site) continue;

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
      const result = await checkCompetitor(
        competitor,
        site,
        supabaseUrl,
        serviceRoleKey,
        resendApiKey,
        telegramBotToken,
        appUrl
      );

      checked++;
      if (result.changed) changes++;
    } catch (err) {
      console.error(
        `Competitor check failed for ${competitor.url}:`,
        err instanceof Error ? err.message : err
      );
      errors++;
    }
  }

  return { checked, changes, errors };
}

// ─── Перевірка одного конкурента ─────────────────────────────

async function checkCompetitor(
  competitor: CompetitorSiteRow,
  site: SiteRow,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  telegramBotToken: string,
  appUrl: string
): Promise<{ changed: boolean }> {
  // Фетчимо HTML
  let html: string;
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const resp = await fetch(competitor.url, {
      signal: controller.signal,
      headers: { "User-Agent": USER_AGENT },
    });
    clearTimeout(t);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    html = await resp.text();
  } catch (err) {
    throw new Error(`Fetch failed: ${err instanceof Error ? err.message : err}`);
  }

  // Очищуємо HTML від шуму (timestamps, nav, footer, scripts, styles)
  const cleanText = extractCleanText(html);

  // SHA-256 через Web Crypto API (доступний у CF Workers)
  const newHash = await sha256(cleanText);
  const snapshot = cleanText.slice(0, SNAPSHOT_LENGTH);

  const hasChanged = competitor.content_hash !== null && competitor.content_hash !== newHash;

  // Оновлюємо запис конкурента (hash + snapshot + last_checked_at + last_change_at)
  const updatePatch: Record<string, unknown> = {
    content_hash: newHash,
    content_snapshot: snapshot,
    last_checked_at: new Date().toISOString(),
  };
  if (hasChanged) {
    updatePatch.last_change_at = new Date().toISOString();
  }

  await updateRows(
    "competitor_sites",
    `id=eq.${encodeURIComponent(competitor.id)}`,
    updatePatch,
    supabaseUrl,
    serviceRoleKey
  );

  if (!hasChanged) return { changed: false };

  // Генеруємо короткий summary про зміни
  const oldSnapshot = competitor.content_snapshot ?? null;
  const changeSummary = buildChangeSummary(competitor.url, oldSnapshot, cleanText);

  // Записуємо competitor_change
  await insertRow(
    "competitor_changes",
    {
      competitor_id: competitor.id,
      site_id: competitor.site_id,
      old_hash: competitor.content_hash,
      old_snapshot: oldSnapshot?.slice(0, 3000) ?? null,
      new_snapshot: snapshot.slice(0, 3000),
      new_hash: newHash,
      change_summary: changeSummary,
      alert_sent: false,
    },
    supabaseUrl,
    serviceRoleKey
  );

  // Шлємо алерти власнику сайту
  await sendCompetitorAlerts(
    competitor,
    site,
    changeSummary,
    supabaseUrl,
    serviceRoleKey,
    resendApiKey,
    telegramBotToken,
    appUrl
  );

  return { changed: true };
}

// ─── Алерти ──────────────────────────────────────────────────

async function sendCompetitorAlerts(
  competitor: CompetitorSiteRow,
  site: SiteRow,
  changeSummary: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  resendApiKey: string,
  telegramBotToken: string,
  appUrl: string
): Promise<void> {
  // Отримуємо налаштування сповіщень власника
  const memberResult = await selectRows<OrgMemberRow>(
    "organization_members",
    `select=user_id&organization_id=eq.${encodeURIComponent(site.organization_id)}&role=eq.owner&limit=1`,
    supabaseUrl,
    serviceRoleKey
  );
  const ownerId = memberResult.data[0]?.user_id;
  if (!ownerId) return;

  const [profileResult, notifResult] = await Promise.all([
    selectRows<ProfileRow>(
      "profiles",
      `select=id,full_name&id=eq.${encodeURIComponent(ownerId)}`,
      supabaseUrl,
      serviceRoleKey
    ),
    selectRows<NotificationRow>(
      "notification_settings",
      `select=email_alerts,telegram_alerts,telegram_chat_id&user_id=eq.${encodeURIComponent(ownerId)}&site_id=eq.${encodeURIComponent(site.id)}`,
      supabaseUrl,
      serviceRoleKey
    ),
  ]);

  const notif = notifResult.data[0];
  const profile = profileResult.data[0];

  const competitorName = competitor.display_name ?? new URL(competitor.url).hostname;
  const siteUrl = `${appUrl}/dashboard/sites/${site.id}/competitor`;

  // Email
  if (notif?.email_alerts !== false && ownerId) {
    // Отримуємо email з auth.users через service role
    const userResult = await selectRows<{ email: string }>(
      "profiles",
      `select=id&id=eq.${encodeURIComponent(ownerId)}`,
      supabaseUrl,
      serviceRoleKey
    );

    // Беремо email напряму з Supabase auth API
    try {
      const authResp = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${ownerId}`,
        {
          headers: {
            apikey: serviceRoleKey,
            Authorization: `Bearer ${serviceRoleKey}`,
          },
        }
      );
      if (authResp.ok) {
        const authUser = (await authResp.json()) as { email?: string };
        if (authUser.email) {
          await sendEmail(
            {
              to: authUser.email,
              subject: `🔔 Зміни на сайті конкурента: ${competitorName}`,
              html: buildCompetitorEmailHtml(
                profile?.full_name ?? "Привіт",
                site.display_name,
                competitorName,
                competitor.url,
                changeSummary,
                siteUrl
              ),
            },
            resendApiKey
          );
        }
      }
    } catch { /* email не критичний — ігноруємо помилку */ }

    // Позбавляємось попередження про невикористану змінну
    void userResult;
  }

  // Telegram
  if (notif?.telegram_alerts && notif?.telegram_chat_id) {
    const msg =
      `🔔 *Зміни у конкурента*\n\n` +
      `Сайт: *${site.display_name}*\n` +
      `Конкурент: ${competitorName}\n` +
      `URL: ${competitor.url}\n\n` +
      `${changeSummary}\n\n` +
      `[Переглянути деталі](${siteUrl})`;

    await sendTelegramMessage(notif.telegram_chat_id, msg, telegramBotToken);
  }
}

// ─── Допоміжні функції ────────────────────────────────────────

/** Очищає HTML від скриптів, стилів, nav/footer та витягує чистий текст */
function extractCleanText(html: string): string {
  return html
    // Видаляємо блоки з великим шумом
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<nav[\s\S]*?<\/nav>/gi, "")
    .replace(/<footer[\s\S]*?<\/footer>/gi, "")
    .replace(/<header[\s\S]*?<\/header>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    // Видаляємо всі HTML теги
    .replace(/<[^>]+>/g, " ")
    // Нормалізуємо пробіли
    .replace(/\s+/g, " ")
    .trim();
}

/** SHA-256 через Web Crypto API */
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Простий summary зміни (без AI — щоб не витрачати квоту) */
/** Повертає короткий текстовий diff між старим та новим знімком */
function buildChangeSummary(url: string, oldText: string | null, newText: string): string {
  const hostname = (() => {
    try { return new URL(url).hostname; } catch { return url; }
  })();

  if (!oldText) {
    const words = newText.split(/\s+/).length;
    return `На сайті ${hostname} зафіксовано зміни контенту (~${words.toLocaleString("uk")} слів у поточній версії).`;
  }

  // Word-level diff (додано / видалено слів)
  const oldWords = new Set(oldText.split(/\s+/).filter(Boolean));
  const newWords = new Set(newText.split(/\s+/).filter(Boolean));

  const added: string[] = [];
  const removed: string[] = [];
  for (const w of newWords) { if (!oldWords.has(w)) added.push(w); }
  for (const w of oldWords) { if (!newWords.has(w)) removed.push(w); }

  const parts: string[] = [];
  if (added.length > 0) parts.push(`+${added.length} нових слів (напр.: «${added.slice(0,3).join("», «")}»)`);
  if (removed.length > 0) parts.push(`−${removed.length} видалених слів (напр.: «${removed.slice(0,3).join("», «")}»)`);
  if (parts.length === 0) parts.push("незначні структурні зміни");

  return `${hostname}: ${parts.join("; ")}.`;
}

/** Генерує рядки з inline diff (до 60 рядків) для відображення у дашборді */
export function buildInlineDiff(oldText: string, newText: string): Array<{ type: "same"|"add"|"del"; text: string }> {
  const oldLines = oldText.split("\n").map(l => l.trim()).filter(Boolean);
  const newLines = newText.split("\n").map(l => l.trim()).filter(Boolean);
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const result: Array<{ type: "same"|"add"|"del"; text: string }> = [];

  // Видалені рядки
  for (const l of oldLines.slice(0, 80)) {
    if (!newSet.has(l)) result.push({ type: "del", text: l.slice(0, 120) });
    else result.push({ type: "same", text: l.slice(0, 120) });
  }
  // Додані рядки
  for (const l of newLines.slice(0, 80)) {
    if (!oldSet.has(l)) result.push({ type: "add", text: l.slice(0, 120) });
  }

  // Фільтруємо: тільки add/del, плюс контекст (1 same навколо)
  const filtered: typeof result = [];
  for (let i = 0; i < result.length && filtered.length < 60; i++) {
    if (result[i].type !== "same") filtered.push(result[i]);
  }
  return filtered.slice(0, 30);
}

/** HTML для email-сповіщення про зміну конкурента */
function buildCompetitorEmailHtml(
  recipientName: string,
  siteName: string,
  competitorName: string,
  competitorUrl: string,
  changeSummary: string,
  dashboardUrl: string
): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:system-ui,sans-serif;">
  <div style="max-width:560px;margin:40px auto;padding:0 20px;">
    <div style="margin-bottom:24px;">
      <span style="font-size:20px;font-weight:700;color:#fff;letter-spacing:-0.5px;">Qorax</span>
    </div>
    <div style="background:#131929;border:1px solid #1e2a3a;border-radius:16px;padding:32px;">
      <div style="font-size:28px;margin-bottom:16px;">🔔</div>
      <h1 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#fff;">
        Зміни на сайті конкурента
      </h1>
      <p style="margin:0 0 24px;color:#8a9bb0;font-size:15px;">
        ${recipientName}, ми зафіксували оновлення.
      </p>

      <div style="background:#0C111D;border-radius:12px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 6px;font-size:12px;color:#5a7090;text-transform:uppercase;letter-spacing:0.05em;">Ваш сайт</p>
        <p style="margin:0;font-size:15px;color:#fff;font-weight:500;">${siteName}</p>

        <div style="height:1px;background:#1e2a3a;margin:16px 0;"></div>

        <p style="margin:0 0 6px;font-size:12px;color:#5a7090;text-transform:uppercase;letter-spacing:0.05em;">Конкурент</p>
        <p style="margin:0 0 4px;font-size:15px;color:#fff;font-weight:500;">${competitorName}</p>
        <a href="${competitorUrl}" style="font-size:13px;color:#8CF6FF;text-decoration:none;">${competitorUrl}</a>

        <div style="height:1px;background:#1e2a3a;margin:16px 0;"></div>

        <p style="margin:0 0 6px;font-size:12px;color:#5a7090;text-transform:uppercase;letter-spacing:0.05em;">Що змінилось</p>
        <p style="margin:0;font-size:14px;color:#c8d8e8;">${changeSummary}</p>
      </div>

      <a href="${dashboardUrl}"
         style="display:block;text-align:center;background:#D6FF3F;color:#0C111D;padding:14px 24px;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;">
        Переглянути деталі →
      </a>
    </div>
    <p style="text-align:center;color:#3a4a5a;font-size:12px;margin-top:24px;">
      Qorax · Моніторинг сайтів
    </p>
  </div>
</body>
</html>`;
}
