// ============================================================
// telegramBotHandler.ts — Qorax Business Telegram (перший крок
// апгрейду з "просто алерти" до "повноцінний AI-помічник бізнесу").
// ============================================================
// Джерело: детальне бачення Артема (17 пунктів) — Telegram як
// другий інтерфейс поруч з веб-панеллю, не лише канал сповіщень.
// Перший прохід реалізує найважливіше з переліку:
//   1. AI Chat (⭐⭐⭐⭐⭐, найвищий пріоритет за оцінкою Артема) —
//      довільне природномовне питання, переюзовує вже наявний
//      buildOrgScopedPrompt() з chatHandler.ts (той самий движок,
//      що і веб-версія Qorax AI Chat), НЕ новий промпт з нуля
//   2. Slash-команди: /audit, /score, /issues, /rank — на основі
//      РЕАЛЬНИХ полів БД (uptime_checks.status, core_web_vitals_checks.
//      performance_score, ai_insights, rank_tracked_queries+gsc_metrics),
//      а не вигаданого єдиного "SEO Score" (документ Артема згадує
//      "SEO Score 92" ілюстративно, такого поля в БД немає — команди
//      побудовані на тому, що реально вимірюється, той самий принцип
//      чесності, що вже в STYLE_INSTRUCTIONS чату: "Забороняється
//      вигадувати дані")
//   3. Priority-емодзі (🟢🟡🟠🔴) для issues — простий візуальний
//      маркер severity, як в документі
//
// СВІДОМО НЕ ЗРОБЛЕНО цим проходом (наступні кроки за списком
// Артема): голосові повідомлення — Gemini вміє РОЗПІЗНАВАТИ голос
// (STT технічно можливо), але НЕ вміє генерувати голос у відповідь
// (TTS — окремий сервіс, нова інфраструктура), а документ хоче саме
// "AI відповідає голосом" (пункт 12). Узгоджено з Артемом: пропустити
// голос повністю, а не робити половинчастий компроміс (голос
// вхід/текст вихід) — якщо колись знадобиться TTS-інтеграція, це
// окрема майбутня ітерація. Smart Alerts реалізовано (alerts.ts вже
// має пороги).
//
// Фото-аналіз (документ Артема, пункт 13: "Відправив скрін. AI
// аналізує.") — РЕАЛІЗОВАНО, handleTelegramPhotoMessage() нижче.
// downloadTelegramFile() (telegram.ts) + callGeminiVision()
// (contentGeneration.ts, та сама vision-функція, що вже
// переюзовується для Visual Search у Qorax Browser).
//
// Business Coach (документ Артема, пункт 16, ⭐⭐⭐⭐⭐) — РЕАЛІЗОВАНО,
// runBusinessCoachCheck() нижче. Викликається щодня з того самого
// cron-циклу, що вже робить speed/SEO/конкуренти (0 3 * * *,
// index.ts) — не новий Cloudflare cron trigger. Два сигнали:
// тиша в контенті (14+ днів без Social-публікації) і похвала за
// помітне покращення швидкості (>20%). Дедуплікація через нову
// telegram_coach_messages (0085) — один тип сигналу на організацію
// не частіше ніж раз на 10 днів.
//
// Weekly Digest AI-текстом (документ Артема, пункт 5) — РЕАЛІЗОВАНО,
// sendTelegramWeeklyDigests() нижче. НЕ переписаний sendWeeklyDigests()
// з monitoring.ts (той лишається як є — критична вже працююча
// email-інфраструктура через Resend). Замість перевикористання
// по-сайтової логіки email-версії — власний збір метрик АГРЕГОВАНО
// по всій організації одразу.
//
// Instant Actions (документ Артема, пункт 8: "[Исправить] [Позже].
// Нажал. Qorax сделал.") — РЕАЛІЗОВАНО, handleTelegramCallbackQuery()
// нижче. "Виправити" — НЕ автофікс коду (такого механізму на
// платформі немає), а той самий fix_requests flow, що вже на вебі
// (заявка студії Qorax на ручне виправлення) — ядро винесено в
// createFixRequest() (fixRequestHandler.ts), переюзовується і
// HTTP-хендлером, і цим Telegram-шляхом. requested_by береться як
// organization_members.role='owner' (немає Supabase JWT з Telegram —
// chat_id прив'язаний до організації, не до конкретного profiles.id).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow } from "./supabase";
import { sendTelegramMessage, sendTelegramMessageWithButtons, answerTelegramCallbackQuery, clearTelegramMessageButtons, downloadTelegramFile } from "./telegram";
import { buildOrgScopedPrompt } from "./chatHandler";
import { checkAiCredits, deductAiCredits } from "./aiCredits";
import { createFixRequest } from "./fixRequestHandler";
import { callGeminiVision } from "./contentGeneration";

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
}

interface UptimeRow {
  site_id: string;
  status: string;
  checked_at: string;
}

interface CwvRow {
  site_id: string;
  performance_score: number | null;
  lcp_ms: number | null;
  inp_ms: number | null;
  cls_score: number | null;
  checked_at: string;
}

interface InsightRow {
  id: string;
  site_id: string;
  severity: string;
  problem_summary: string;
  estimated_monthly_loss_usd: number | null;
  generated_at: string;
}

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function severityEmoji(severity: string): string {
  switch (severity) {
    case "critical": return "🔴";
    case "warning": return "🟡";
    default: return "🟢"; // info
  }
}

/** organization_id за telegram_chat_id — той самий мапінг, що /start вже зберіг у notification_settings. */
async function getOrgIdByChatId(chatId: string, env: Env): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "notification_settings",
    `select=organization_id&telegram_chat_id=eq.${encodeURIComponent(chatId)}&telegram_enabled=eq.true`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data?.[0]?.organization_id ?? null;
}

async function getOrgSites(organizationId: string, env: Env): Promise<SiteRow[]> {
  const res = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data ?? [];
}

// ── /audit — короткий health-звіт по всіх сайтах: uptime% (останні
// 20 перевірок кожного сайту) + кількість активних insights по severity
async function handleAuditCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу. Додайте перший у дашборді Qorax.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const siteIds = sites.map(s => s.id);
  const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;

  const [uptimeRes, insightsRes] = await Promise.all([
    selectRows<UptimeRow>(
      "uptime_checks",
      `select=site_id,status,checked_at&site_id=${siteIdFilter}&order=checked_at.desc&limit=${sites.length * 20}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    selectRows<InsightRow>(
      "ai_insights",
      `select=id,site_id,severity,problem_summary,estimated_monthly_loss_usd&site_id=${siteIdFilter}&is_resolved=eq.false`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
  ]);

  const lines: string[] = [`📋 <b>Аудит порт­фоліо</b> — ${sites.length} сайт(ів)\n`];

  for (const site of sites) {
    const siteUptime = (uptimeRes.data ?? []).filter(u => u.site_id === site.id);
    const siteInsights = (insightsRes.data ?? []).filter(i => i.site_id === site.id);
    const upCount = siteUptime.filter(u => u.status === "up").length;
    const uptimePct = siteUptime.length > 0 ? ((upCount / siteUptime.length) * 100).toFixed(1) : null;

    lines.push(`<b>${site.display_name}</b> (<code>${safeHostname(site.url)}</code>)`);
    lines.push(uptimePct !== null ? `Uptime: ${uptimePct}%` : "Uptime: даних ще немає");
    lines.push(siteInsights.length > 0 ? `${siteInsights.length} активних проблем` : "Активних проблем немає ✅");
    lines.push("");
  }

  await sendTelegramMessage(chatId, lines.join("\n").trim(), env.TELEGRAM_BOT_TOKEN);
}

// ── /score — останній Lighthouse performance_score (mobile) кожного сайту
async function handleScoreCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const lines: string[] = ["⚡ <b>PageSpeed (Lighthouse)</b>\n"];

  for (const site of sites) {
    const cwvRes = await selectRows<CwvRow>(
      "core_web_vitals_checks",
      `select=site_id,performance_score,checked_at&site_id=eq.${encodeURIComponent(site.id)}&order=checked_at.desc&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const latest = cwvRes.data?.[0];
    const score = latest?.performance_score;
    const emoji = score === null || score === undefined ? "⚪" : score >= 90 ? "🟢" : score >= 50 ? "🟡" : "🔴";
    lines.push(`${emoji} <b>${site.display_name}</b>: ${score ?? "ще не перевірено"}`);
  }

  await sendTelegramMessage(chatId, lines.join("\n"), env.TELEGRAM_BOT_TOKEN);
}

// ── /speed — детальні Core Web Vitals (LCP/INP/CLS), не лише один
// підсумковий score як /score. Документ Артема, пункт 2: окрема
// команда "Core Web Vitals".
function cwvThresholdEmoji(value: number | null, good: number, needsImprovement: number): string {
  if (value === null) return "⚪";
  if (value <= good) return "🟢";
  if (value <= needsImprovement) return "🟡";
  return "🔴";
}

async function handleSpeedCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const lines: string[] = ["🚀 <b>Core Web Vitals</b>\n"];

  for (const site of sites) {
    const cwvRes = await selectRows<CwvRow>(
      "core_web_vitals_checks",
      `select=site_id,performance_score,lcp_ms,inp_ms,cls_score,checked_at&site_id=eq.${encodeURIComponent(site.id)}&order=checked_at.desc&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const latest = cwvRes.data?.[0];

    lines.push(`<b>${site.display_name}</b>`);
    if (!latest) {
      lines.push("Даних ще немає\n");
      continue;
    }
    // Порогові значення — офіційні Google Core Web Vitals thresholds
    lines.push(`${cwvThresholdEmoji(latest.lcp_ms, 2500, 4000)} LCP: ${latest.lcp_ms !== null ? `${(latest.lcp_ms / 1000).toFixed(1)}с` : "—"} (завантаження основного контенту)`);
    lines.push(`${cwvThresholdEmoji(latest.inp_ms, 200, 500)} INP: ${latest.inp_ms !== null ? `${latest.inp_ms}мс` : "—"} (відгук на дії користувача)`);
    lines.push(`${cwvThresholdEmoji(latest.cls_score, 0.1, 0.25)} CLS: ${latest.cls_score !== null ? latest.cls_score.toFixed(3) : "—"} (стабільність верстки)`);
    lines.push("");
  }

  await sendTelegramMessage(chatId, lines.join("\n").trim(), env.TELEGRAM_BOT_TOKEN);
}

// ── /traffic — GSC clicks/impressions за тиждень з трендом до
// попереднього тижня. Документ Артема, пункт 2: окрема команда
// "Трафик". Агрегат по всьому сайту (page_url IS NULL AND
// query IS NULL — той самий рядок, що gscHandler.ts вставляє окремо
// від per-page/per-query розбивки, підтверджено звіркою коду синку).
interface TrafficRow {
  site_id: string;
  clicks: number;
  impressions: number;
  date: string;
}

async function handleTrafficCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу.", env.TELEGRAM_BOT_TOKEN);
    return;
  }
  const siteIds = sites.map(s => s.id);
  const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const trafficRes = await selectRows<TrafficRow>(
    "gsc_metrics",
    `select=site_id,clicks,impressions,date&site_id=${siteIdFilter}&page_url=is.null&query=is.null&date=gte.${twoWeeksAgo}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const rows = trafficRes.data ?? [];

  if (rows.length === 0) {
    await sendTelegramMessage(
      chatId,
      "Немає даних Google Search Console. Підключіть GSC у дашборді → сайт → SEO, щоб бачити трафік тут.",
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  const lines: string[] = ["📈 <b>Трафік з пошуку (GSC)</b>\n"];

  for (const site of sites) {
    const siteRows = rows.filter(r => r.site_id === site.id);
    if (siteRows.length === 0) continue;

    const thisWeek = siteRows.filter(r => r.date >= weekAgo);
    const prevWeek = siteRows.filter(r => r.date < weekAgo);
    const thisClicks = thisWeek.reduce((sum, r) => sum + r.clicks, 0);
    const thisImpr = thisWeek.reduce((sum, r) => sum + r.impressions, 0);
    const prevClicks = prevWeek.reduce((sum, r) => sum + r.clicks, 0);

    let trend = "";
    if (prevWeek.length > 0) {
      const delta = prevClicks > 0 ? Math.round(((thisClicks - prevClicks) / prevClicks) * 100) : null;
      if (delta !== null && delta !== 0) trend = ` (${delta > 0 ? "+" : ""}${delta}% до тижня раніше)`;
    }

    lines.push(`<b>${site.display_name}</b>`);
    lines.push(`Кліки: ${thisClicks}${trend}`);
    lines.push(`Показів: ${thisImpr}`);
    lines.push("");
  }

  await sendTelegramMessage(chatId, lines.join("\n").trim(), env.TELEGRAM_BOT_TOKEN);
}

// ── /report — документ Артема, пункт 2: "Последний отчет". Повний
// PDF-звіт (generateReportHtml, pdfReport.ts) вимагає Supabase JWT
// (handleReportRequest — вебова авторизація), якого з Telegram-боку
// немає, і сам HTML не рендериться в PDF-файл на цьому середовищі
// (Cloudflare Workers без headless browser — генерація PDF з нуля
// для Telegram-бота вимагала б окремої зовнішньої інфраструктури,
// це НЕ той самий фічер, що просто відкрити готовий HTML). Чесний
// компроміс — не вигадувати спрощений звіт у чаті (він уже
// покривається /audit + /score + /issues + /rank + /traffic разом),
// а направити в дашборд, де звіт реально відкривається.
async function handleReportCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const dashboardUrl = `${env.APP_URL}/dashboard`;
  await sendTelegramMessage(
    chatId,
    `📄 Повний звіт (PDF) доступний у дашборді для кожного сайту окремо.\n\n<a href="${dashboardUrl}">→ Відкрити дашборд</a>\n\nАбо скористайтесь тут: /audit — короткий підсумок, /score — швидкість, /issues — проблеми, /rank — позиції, /traffic — трафік з пошуку.`,
    env.TELEGRAM_BOT_TOKEN
  );
}

// ── /issues — усі активні ai_insights з priority-емодзі, найважливіші перші
async function handleIssuesCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу.", env.TELEGRAM_BOT_TOKEN);
    return;
  }
  const siteById = new Map(sites.map(s => [s.id, s]));
  const siteIds = sites.map(s => s.id);
  const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;

  const insightsRes = await selectRows<InsightRow>(
    "ai_insights",
    `select=id,site_id,severity,problem_summary,estimated_monthly_loss_usd,generated_at&site_id=${siteIdFilter}&is_resolved=eq.false&order=generated_at.desc&limit=50`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const severityRank: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  const insights = (insightsRes.data ?? [])
    .sort((a, b) => (severityRank[a.severity] ?? 3) - (severityRank[b.severity] ?? 3))
    .slice(0, 15);

  if (insights.length === 0) {
    await sendTelegramMessage(chatId, "🟢 Активних проблем немає — усе в порядку.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const lines: string[] = [`🔎 <b>Активні проблеми</b> (${insights.length})\n`];
  for (const ins of insights) {
    const site = siteById.get(ins.site_id);
    const loss = ins.estimated_monthly_loss_usd ? ` <i>(~$${ins.estimated_monthly_loss_usd}/міс)</i>` : "";
    lines.push(`${severityEmoji(ins.severity)} ${ins.problem_summary}${loss}`);
    if (site) lines.push(`<code>${safeHostname(site.url)}</code>`);
    lines.push("");
  }

  await sendTelegramMessage(chatId, lines.join("\n").trim(), env.TELEGRAM_BOT_TOKEN);

  // Instant Actions (документ Артема, пункт 8: "[Исправить] [Позже].
  // Нажал. Qorax сделал.") — окремі повідомлення з кнопками лише для
  // critical, і лише перші 3, щоб не заспамити чат: некритичні issues
  // (warning/info) не варті negайного запиту на ручне виправлення,
  // для них досить самого списку вище.
  const criticalOnes = insights.filter(i => i.severity === "critical").slice(0, 3);
  for (const ins of criticalOnes) {
    const site = siteById.get(ins.site_id);
    await sendTelegramMessageWithButtons(
      chatId,
      `🔴 ${ins.problem_summary}${site ? `\n<code>${safeHostname(site.url)}</code>` : ""}`,
      [[
        { text: "🛠 Замовити виправлення", callback_data: `fix:${ins.id}` },
        { text: "Пізніше", callback_data: `snooze:${ins.id}` },
      ]],
      env.TELEGRAM_BOT_TOKEN
    );
  }
}

// ── /rank — позиція по tracked-запитах (rank_tracked_queries, 0041)
// з найостаннішим average_position з gsc_metrics + тренд відносно
// попереднього виміру. Вимагає підключеного GSC (gsc_connections) —
// без нього tracked-запитів у сайта просто немає, повідомляємо про
// це прямо, не показуємо порожній список без пояснення.
interface RankTrackedRow {
  site_id: string;
  query: string;
}

interface GscMetricRow {
  site_id: string;
  query: string | null;
  average_position: number | null;
  date: string;
}

async function handleRankCommand(chatId: string, organizationId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) {
    await sendTelegramMessage(chatId, "У вас ще немає жодного сайту на моніторингу.", env.TELEGRAM_BOT_TOKEN);
    return;
  }
  const siteIds = sites.map(s => s.id);
  const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;

  const trackedRes = await selectRows<RankTrackedRow>(
    "rank_tracked_queries",
    `select=site_id,query&site_id=${siteIdFilter}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const tracked = trackedRes.data ?? [];

  if (tracked.length === 0) {
    await sendTelegramMessage(
      chatId,
      "Ще немає жодного відстежуваного запиту. Додайте запити в дашборді → Rank, щоб бачити позицію тут.",
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  // Останні 2 виміри на кожен (site_id, query) — для тренду ↑/↓.
  // gsc_metrics зберігає добову агрегацію по кожному tracked-запиту
  // окремим рядком (query IS NOT NULL) — беремо запас 4 останніх
  // днів на запит з рестом, щоб точно захопити 2 останні різні дати
  // навіть якщо якийсь день синк пропустив.
  const metricsRes = await selectRows<GscMetricRow>(
    "gsc_metrics",
    `select=site_id,query,average_position,date&site_id=${siteIdFilter}&query=not.is.null&order=date.desc&limit=${tracked.length * 4}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const metrics = metricsRes.data ?? [];

  const lines: string[] = ["🔍 <b>Позиції у пошуку</b>\n"];

  for (const site of sites) {
    const siteTracked = tracked.filter(t => t.site_id === site.id);
    if (siteTracked.length === 0) continue;

    lines.push(`<b>${site.display_name}</b>`);
    for (const t of siteTracked) {
      const rows = metrics
        .filter(m => m.site_id === site.id && m.query === t.query && m.average_position !== null)
        .sort((a, b) => (a.date < b.date ? 1 : -1));
      const latest = rows[0];
      const prev = rows.find(r => r.date !== latest?.date);

      if (!latest) {
        lines.push(`• «${t.query}» — даних ще немає`);
        continue;
      }
      const pos = latest.average_position!.toFixed(1);
      let trend = "";
      if (prev?.average_position != null) {
        const delta = prev.average_position - latest.average_position!; // позитивна = позиція покращилась (менше число)
        if (delta > 0.5) trend = ` ↑ (було ${prev.average_position.toFixed(1)})`;
        else if (delta < -0.5) trend = ` ↓ (було ${prev.average_position.toFixed(1)})`;
      }
      lines.push(`• «${t.query}» — ${pos}${trend}`);
    }
    lines.push("");
  }

  if (lines.length === 1) {
    await sendTelegramMessage(chatId, "Ще немає жодного відстежуваного запиту. Додайте запити в дашборді → Rank.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  await sendTelegramMessage(chatId, lines.join("\n").trim(), env.TELEGRAM_BOT_TOKEN);
}

// ── AI Chat — довільне природномовне питання. Переюзовує
// buildOrgScopedPrompt() з chatHandler.ts (той самий движок веб-версії:
// Memory + Knowledge Graph + агрегація по всіх сайтах), окремий
// одноразовий Gemini-виклик БЕЗ персистентного ai_chat_threads —
// Telegram-повідомлення короткоживучі, історія розмови в межах
// одного чату природно тримається в самому Telegram, не дублюємо
// збереження в БД для першого проходу (можна додати пізніше, якщо
// знадобиться контекст між повідомленнями).
async function handleAiChatMessage(chatId: string, organizationId: string, message: string, env: Env): Promise<void> {
  const creditsCheck = await checkAiCredits(organizationId, "business", env);
  if (!creditsCheck.ok) {
    await sendTelegramMessage(
      chatId,
      creditsCheck.disabledByAdmin
        ? "⚠️ AI-чат тимчасово вимкнено адміністратором."
        : "⚠️ Кредити AI вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу.",
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) {
    await sendTelegramMessage(chatId, "⚠️ AI не налаштований — зверніться до підтримки.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const systemPrompt = await buildOrgScopedPrompt(organizationId, env);
  if (!systemPrompt.ok) {
    await sendTelegramMessage(chatId, "⚠️ Не вдалося зібрати контекст для відповіді.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const geminiBody = {
    system_instruction: { parts: [{ text: systemPrompt.prompt }] },
    contents: [{ role: "user", parts: [{ text: message }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(geminiBody),
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[telegram-bot] Gemini error:", resp.status, errText.slice(0, 300));
      await sendTelegramMessage(chatId, "⚠️ AI тимчасово недоступний, спробуйте за хвилину.", env.TELEGRAM_BOT_TOKEN);
      return;
    }

    interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const data = (await resp.json()) as GeminiResponse;
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();

    if (!text) {
      await sendTelegramMessage(chatId, "⚠️ AI не повернув відповідь, спробуйте переформулювати питання.", env.TELEGRAM_BOT_TOKEN);
      return;
    }

    await deductAiCredits(organizationId, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
    // Telegram parse_mode=HTML не розуміє markdown — Gemini інколи
    // повертає ** для жирного, тут не конвертуємо (за замовчуванням
    // HTML entities в тексті Gemini рідкісні для укр. відповідей),
    // sendTelegramMessage уже екранує/надсилає як є.
    await sendTelegramMessage(chatId, text, env.TELEGRAM_BOT_TOKEN);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      await sendTelegramMessage(chatId, "⚠️ AI не відповів вчасно, спробуйте ще раз.", env.TELEGRAM_BOT_TOKEN);
      return;
    }
    console.error("[telegram-bot] chat error:", err instanceof Error ? err.message : err);
    await sendTelegramMessage(chatId, "⚠️ Внутрішня помилка, спробуйте пізніше.", env.TELEGRAM_BOT_TOKEN);
  }
}

const HELP_TEXT = `🤖 <b>Qorax Bot</b>

Команди:
/audit — короткий звіт по всіх сайтах
/score — PageSpeed (Lighthouse) кожного сайту
/speed — детальні Core Web Vitals (LCP/INP/CLS)
/issues — активні проблеми з пріоритетом
/rank — позиції по відстежуваних запитах
/traffic — трафік з пошуку (GSC)
/report — де знайти повний PDF-звіт

Або просто напишіть питання природною мовою, наприклад:
<i>«Чому впали позиції?»</i>
<i>«Що зараз найважливіше виправити?»</i>

Можна також надіслати скріншот (Google Search Console, Analytics, PageSpeed) — AI проаналізує.`;

/**
 * Головна точка входу для будь-якого текстового повідомлення від
 * ПІДКЛЮЧЕНОГО чату (telegram_chat_id вже є в notification_settings —
 * перевірка належності робиться тут, не в telegramWebhook.ts, щоб
 * /start-флоу лишався окремим і простим). Викликається з
 * telegramWebhook.ts для будь-якого тексту, що не є /start.
 */
export async function handleTelegramBotMessage(chatId: string, text: string, env: Env): Promise<void> {
  const organizationId = await getOrgIdByChatId(chatId, env);
  if (!organizationId) {
    await sendTelegramMessage(
      chatId,
      "Цей чат ще не підключено до жодної організації Qorax. Перейдіть у дашборд → Налаштування → Telegram, щоб підключити.",
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  const trimmed = text.trim();

  if (trimmed === "/help" || trimmed === "/start") {
    await sendTelegramMessage(chatId, HELP_TEXT, env.TELEGRAM_BOT_TOKEN);
    return;
  }
  if (trimmed === "/audit") {
    await handleAuditCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed === "/score") {
    await handleScoreCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed === "/issues") {
    await handleIssuesCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed === "/rank") {
    await handleRankCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed === "/speed") {
    await handleSpeedCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed === "/traffic") {
    await handleTrafficCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed === "/report") {
    await handleReportCommand(chatId, organizationId, env);
    return;
  }
  if (trimmed.startsWith("/")) {
    await sendTelegramMessage(chatId, `Невідома команда. ${HELP_TEXT}`, env.TELEGRAM_BOT_TOKEN);
    return;
  }

  // Довільний текст без "/" — AI Chat
  await handleAiChatMessage(chatId, organizationId, trimmed, env);
}

// ============================================================
// Weekly Digest — AI-текстом, для всіх Telegram-підключених
// організацій разом (документ Артема, пункт 5: "Раз в неделю. AI
// пише. Не цифры. А человеческий текст". Приклад з документа:
// "За неделю сайт ускорился на 18%. Исправлено 12 ошибок...").
// ============================================================

interface DigestSslRow {
  site_id: string;
  days_until_expiry: number | null;
}

interface DigestIncidentRow {
  site_id: string;
  started_at: string;
  resolved_at: string | null;
}

interface DigestSpeedRow {
  site_id: string;
  load_time_ms: number;
  checked_at: string;
}

interface DigestSeoRow {
  site_id: string;
  issues: unknown;
  checked_at: string;
}

interface TelegramConnectedOrg {
  organization_id: string;
  telegram_chat_id: string;
}

/**
 * Одна організація: агрегує uptime/простій/швидкість(з трендом
 * тиждень-до-тижня)/нові SEO-проблеми/SSL по ВСІХ сайтах разом,
 * просить Gemini написати зв'язний людський текст (не цифровий
 * шаблон — той є в email-версії), надсилає в Telegram.
 */
async function sendTelegramDigestForOrg(organizationId: string, chatId: string, env: Env): Promise<{ ok: boolean }> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) return { ok: false };

  const siteIds = sites.map(s => s.id);
  const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [uptimeRes, incidentsRes, speedRes, prevSpeedRes, seoRes, sslRes, insightsRes] = await Promise.all([
    selectRows<UptimeRow>("uptime_checks", `select=site_id,status,checked_at&site_id=${siteIdFilter}&checked_at=gte.${weekAgo}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<DigestIncidentRow>("uptime_incidents", `select=site_id,started_at,resolved_at&site_id=${siteIdFilter}&started_at=gte.${weekAgo}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<DigestSpeedRow>("speed_checks", `select=site_id,load_time_ms,checked_at&site_id=${siteIdFilter}&checked_at=gte.${weekAgo}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<DigestSpeedRow>("speed_checks", `select=site_id,load_time_ms,checked_at&site_id=${siteIdFilter}&checked_at=gte.${twoWeeksAgo}&checked_at=lt.${weekAgo}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<DigestSeoRow>("page_seo_audits", `select=site_id,issues,checked_at&site_id=${siteIdFilter}&checked_at=gte.${weekAgo}&order=checked_at.desc`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<DigestSslRow>("ssl_certificates", `select=site_id,days_until_expiry&site_id=${siteIdFilter}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    selectRows<InsightRow>("ai_insights", `select=id,site_id,severity,problem_summary,estimated_monthly_loss_usd,generated_at&site_id=${siteIdFilter}&is_resolved=eq.false&order=generated_at.desc&limit=20`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
  ]);

  const uptimeChecks = uptimeRes.data ?? [];
  const totalChecks = uptimeChecks.length;
  const upChecks = uptimeChecks.filter(c => c.status === "up").length;
  const uptimePct = totalChecks > 0 ? (upChecks / totalChecks) * 100 : 100;

  const incidents = incidentsRes.data ?? [];
  let totalDowntimeMinutes = 0;
  for (const inc of incidents) {
    const start = new Date(inc.started_at).getTime();
    const end = inc.resolved_at ? new Date(inc.resolved_at).getTime() : Date.now();
    totalDowntimeMinutes += Math.round((end - start) / 60000);
  }

  const speeds = (speedRes.data ?? []).map(c => c.load_time_ms);
  const avgSpeedMs = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
  const prevSpeeds = (prevSpeedRes.data ?? []).map(c => c.load_time_ms);
  const prevAvgSpeedMs = prevSpeeds.length ? Math.round(prevSpeeds.reduce((a, b) => a + b, 0) / prevSpeeds.length) : null;
  const speedChangePct = avgSpeedMs !== null && prevAvgSpeedMs !== null && prevAvgSpeedMs > 0
    ? Math.round(((prevAvgSpeedMs - avgSpeedMs) / prevAvgSpeedMs) * 100) // позитивне = стало швидше
    : null;

  // Нові SEO-проблеми за тиждень — найостанніший аудит на кожен сайт
  let totalSeoIssues = 0;
  const seenSites = new Set<string>();
  for (const audit of seoRes.data ?? []) {
    if (seenSites.has(audit.site_id)) continue;
    seenSites.add(audit.site_id);
    try {
      const issues = Array.isArray(audit.issues) ? audit.issues : JSON.parse(String(audit.issues));
      totalSeoIssues += issues.length;
    } catch { /* ignore */ }
  }

  const sslWarnings = (sslRes.data ?? []).filter(s => s.days_until_expiry !== null && s.days_until_expiry <= 30);

  const insights = insightsRes.data ?? [];
  const criticalCount = insights.filter(i => i.severity === "critical").length;

  // Якщо взагалі немає жодних даних за тиждень — не турбуємо AI-викликом,
  // сайти щойно додані/моніторинг щойно ввімкнено.
  if (totalChecks === 0 && speeds.length === 0 && insights.length === 0) {
    return { ok: false };
  }

  const creditsCheck = await checkAiCredits(organizationId, "business", env);
  if (!creditsCheck.ok) {
    // Дайджест — не запит користувача, а проактивна розсилка:
    // немає кредитів чи вимкнено адміном — просто мовчки пропускаємо
    // цю організацію цього тижня, без повідомлення про помилку
    // (на відміну від команд, де користувач чекає на відповідь).
    return { ok: false };
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return { ok: false };

  const factsBlock = [
    `Сайтів на моніторингу: ${sites.length}`,
    `Uptime за тиждень: ${uptimePct.toFixed(2)}%`,
    incidents.length > 0 ? `Інцидентів недоступності: ${incidents.length} (сумарний простій ${totalDowntimeMinutes} хв)` : `Інцидентів недоступності: 0`,
    avgSpeedMs !== null ? `Середня швидкість завантаження: ${avgSpeedMs}мс${speedChangePct !== null ? ` (${speedChangePct >= 0 ? "швидше" : "повільніше"} на ${Math.abs(speedChangePct)}% порівняно з попереднім тижнем)` : ""}` : "Даних про швидкість за тиждень немає",
    `Нових SEO-проблем виявлено: ${totalSeoIssues}`,
    sslWarnings.length > 0 ? `SSL-сертифікати, що скоро закінчуються: ${sslWarnings.length}` : null,
    `Активних проблем усього: ${insights.length}${criticalCount > 0 ? ` (з них ${criticalCount} критичних)` : ""}`,
    insights.length > 0 ? `Найважливіші: ${insights.slice(0, 3).map(i => i.problem_summary).join("; ")}` : null,
  ].filter(Boolean).join("\n");

  const prompt = `Ти пишеш щотижневий дайджест для власника бізнесу про стан його сайтів у Qorax. Ось факти за останній тиждень:

${factsBlock}

Напиши короткий (3-5 речень) людський текст українською мовою — не перелічуй цифри як список, а розкажи зв'язно, що сталося за тиждень, що покращилось, що варто звернути увагу. Тон — як від консультанта, який щиро зацікавлений в успіху бізнесу, без зайвого захвату чи драматизму. Використовуй лише факти з переліку вище, нічого не вигадуй.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.6, maxOutputTokens: 500 },
      }),
    });
    clearTimeout(timeout);
    if (!resp.ok) return { ok: false };

    interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const data = (await resp.json()) as GeminiResponse;
    const text = (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    if (!text) return { ok: false };

    await deductAiCredits(organizationId, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
    await sendTelegramMessage(chatId, `📊 <b>Тижневий дайджест</b>\n\n${text}`, env.TELEGRAM_BOT_TOKEN);
    return { ok: true };
  } catch (err) {
    console.error("[telegram-digest] error:", err instanceof Error ? err.message : err);
    return { ok: false };
  }
}

/**
 * Викликається з cron-хендлера (index.ts) щопонеділка — та сама умова
 * дня тижня, що вже перевіряється перед sendWeeklyDigests() (email).
 * Проходить по всіх telegram_enabled організаціях (не по digest_frequency
 * — Telegram-дайджест поки завжди weekly, налаштування частоти окремо
 * для Telegram документ не описував; email-версія лишається джерелом
 * істини для weekly/biweekly/monthly вибору користувача).
 */
export async function sendTelegramWeeklyDigests(env: Env): Promise<{ sent: number; skipped: number }> {
  const connectedRes = await selectRows<TelegramConnectedOrg>(
    "notification_settings",
    `select=organization_id,telegram_chat_id&telegram_enabled=eq.true&telegram_chat_id=not.is.null`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const orgs = connectedRes.data ?? [];

  let sent = 0;
  let skipped = 0;

  for (const org of orgs) {
    const result = await sendTelegramDigestForOrg(org.organization_id, org.telegram_chat_id, env);
    if (result.ok) sent++; else skipped++;
  }

  return { sent, skipped };
}

// ============================================================
// Instant Actions callback — обробка натискання inline-кнопки
// ("🛠 Замовити виправлення" / "Пізніше") під critical issue, яку
// показав /issues (документ Артема, пункт 8). Викликається з
// telegramWebhook.ts для будь-якого update.callback_query.
// ============================================================

interface InsightForFix {
  id: string;
  site_id: string;
  problem_summary: string;
}

interface OwnerMembership {
  user_id: string;
}

/**
 * "Замовити виправлення" — та сама заявка, що вебова форма створює
 * через handleFixRequest (createFixRequest, спільне ядро з
 * fixRequestHandler.ts). Немає Supabase JWT з Telegram — тому
 * requested_by беремо як owner-учасника організації (перший
 * знайдений з role='owner'), а не намагаємось встановити "хто саме
 * написав у Telegram" (chat_id прив'язаний до організації, не до
 * конкретного profiles.id — той самий компроміс, що вже є в дизайні
 * notification_settings).
 */
export async function handleTelegramCallbackQuery(
  callbackQueryId: string,
  chatId: string,
  messageId: number,
  data: string,
  env: Env
): Promise<void> {
  const organizationId = await getOrgIdByChatId(chatId, env);
  if (!organizationId) {
    await answerTelegramCallbackQuery(callbackQueryId, "Чат не підключено до організації", env.TELEGRAM_BOT_TOKEN, true);
    return;
  }

  const [action, insightId] = data.split(":");

  if (action === "snooze") {
    await answerTelegramCallbackQuery(callbackQueryId, "Гаразд, нагадаємо пізніше", env.TELEGRAM_BOT_TOKEN);
    await clearTelegramMessageButtons(chatId, messageId, env.TELEGRAM_BOT_TOKEN);
    return;
  }

  if (action !== "fix" || !insightId) {
    await answerTelegramCallbackQuery(callbackQueryId, undefined, env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const insightRes = await selectRows<InsightForFix>(
    "ai_insights",
    `select=id,site_id,problem_summary&id=eq.${encodeURIComponent(insightId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const insight = insightRes.data?.[0];
  if (!insight) {
    await answerTelegramCallbackQuery(callbackQueryId, "Проблему не знайдено — можливо, вже вирішена", env.TELEGRAM_BOT_TOKEN, true);
    return;
  }

  const ownerRes = await selectRows<OwnerMembership>(
    "organization_members",
    `select=user_id&organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.owner&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const ownerId = ownerRes.data?.[0]?.user_id;
  if (!ownerId) {
    await answerTelegramCallbackQuery(callbackQueryId, "Не вдалося визначити власника організації", env.TELEGRAM_BOT_TOKEN, true);
    return;
  }

  const result = await createFixRequest(
    {
      siteId: insight.site_id,
      organizationId,
      requestedByUserId: ownerId,
      requestedByEmail: null,
      problemDescription: insight.problem_summary,
      insightId: insight.id,
    },
    env
  );

  if (!result.ok && result.reason === "upgrade_required") {
    await answerTelegramCallbackQuery(callbackQueryId, "Замовлення виправлень доступне з плану Growth", env.TELEGRAM_BOT_TOKEN, true);
    return;
  }
  if (!result.ok) {
    await answerTelegramCallbackQuery(callbackQueryId, "Не вдалося створити заявку, спробуйте пізніше", env.TELEGRAM_BOT_TOKEN, true);
    return;
  }

  await answerTelegramCallbackQuery(callbackQueryId, "✅ Заявку надіслано", env.TELEGRAM_BOT_TOKEN);
  await clearTelegramMessageButtons(chatId, messageId, env.TELEGRAM_BOT_TOKEN);
  await sendTelegramMessage(
    chatId,
    result.isFree
      ? "✅ Заявку на виправлення надіслано — це безкоштовна заявка в межах вашого плану. Ми зв'яжемось найближчим часом."
      : "✅ Заявку на виправлення надіслано. Це понад безкоштовний ліміт цього місяця — вартість узгодимо окремо.",
    env.TELEGRAM_BOT_TOKEN
  );
}

// ============================================================
// Business Coach (документ Артема, пункт 16, ⭐⭐⭐⭐⭐: "Telegram сам
// пише. Не по ошибкам. А как консультант" — на відміну від Weekly
// Digest, не за фіксованим розкладом, а коли є значуща подія;
// не лише проблеми, а й похвала за покращення).
// ============================================================
// Викликається щодня з того самого cron-циклу, що вже робить
// speed/SEO/конкуренти (0 3 * * *) — не додає новий Cloudflare cron
// trigger (пам'ять: додавання тригерів вручну в Dashboard болюче,
// wrangler.toml [triggers] не працює на цьому акаунті). Дедуплікація
// через telegram_coach_messages (0085) — один тип сигналу на
// організацію не частіше що N днів, щоб справді відповідати "не
// спамити" з документа Артема (пункт 10, Smart Alerts — той самий
// принцип застосовано і тут).
//
// Перший прохід — два сигнали, обмежено реалістичним обсягом даних,
// які вже надійно доступні:
//   1. Тиша в контенті — немає published Social-постів 14+ днів
//   2. Похвала за швидкість — помітне покращення (>20%) за останні
//      3 дні порівняно з попередніми 7, БЕЗ дублювання з
//      checkSpeedDegradation (той — про погіршення, протилежний сигнал)
// ============================================================

const COACH_SIGNAL_COOLDOWN_DAYS = 10; // один тип сигналу на організацію не частіше ніж раз на 10 днів

interface CoachSocialPostRow {
  organization_id: string;
  published_at: string;
}

interface CoachSpeedRow {
  site_id: string;
  load_time_ms: number;
  checked_at: string;
}

async function wasCoachSignalSentRecently(organizationId: string, signalType: string, env: Env): Promise<boolean> {
  const cutoff = new Date(Date.now() - COACH_SIGNAL_COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const res = await selectRows<{ id: string }>(
    "telegram_coach_messages",
    `select=id&organization_id=eq.${encodeURIComponent(organizationId)}&signal_type=eq.${encodeURIComponent(signalType)}&sent_at=gte.${cutoff}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return (res.data?.length ?? 0) > 0;
}

/**
 * Одна організація — перевіряє обидва сигнали по черзі, надсилає
 * НАЙБІЛЬШЕ ОДНЕ повідомлення (не заспамлювати кількома coach-
 * порадами за один день навіть якщо спрацювало кілька сигналів).
 */
async function checkBusinessCoachForOrg(organizationId: string, chatId: string, env: Env): Promise<void> {
  const sites = await getOrgSites(organizationId, env);
  if (sites.length === 0) return;

  // ── Сигнал 1: тиша в контенті (14+ днів без published Social-посту)
  const silenceAlreadySent = await wasCoachSignalSentRecently(organizationId, "content_silence", env);
  if (!silenceAlreadySent) {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const recentPostsRes = await selectRows<CoachSocialPostRow>(
      "social_posts",
      `select=organization_id,published_at&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.published&published_at=gte.${fourteenDaysAgo}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    // Перевіряємо, що організація взагалі колись публікувала (інакше
    // "тиша" не значуща подія — можливо, Social модуль просто не
    // використовується цією організацією, і нагадування недоречне).
    const everPostedRes = await selectRows<{ id: string }>(
      "social_posts",
      `select=id&organization_id=eq.${encodeURIComponent(organizationId)}&status=eq.published&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const hasEverPosted = (everPostedRes.data?.length ?? 0) > 0;
    const hasRecentPost = (recentPostsRes.data?.length ?? 0) > 0;

    if (hasEverPosted && !hasRecentPost) {
      await sendTelegramMessage(
        chatId,
        `💡 <b>Порада від Qorax</b>\n\nВже понад два тижні не було нових публікацій у соцмережах. Свіжий контент допомагає утримувати аудиторію та підтримує SEO-видимість.`,
        env.TELEGRAM_BOT_TOKEN
      );
      await insertCoachSignalRecord(organizationId, "content_silence", env);
      return; // одне повідомлення на день максимум
    }
  }

  // ── Сигнал 2: похвала за помітне покращення швидкості
  const speedAlreadySent = await wasCoachSignalSentRecently(organizationId, "speed_improvement", env);
  if (!speedAlreadySent) {
    const siteIds = sites.map(s => s.id);
    const siteIdFilter = `in.(${siteIds.map(id => encodeURIComponent(id)).join(",")})`;
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();

    const [recentRes, priorRes] = await Promise.all([
      selectRows<CoachSpeedRow>("speed_checks", `select=site_id,load_time_ms,checked_at&site_id=${siteIdFilter}&checked_at=gte.${threeDaysAgo}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
      selectRows<CoachSpeedRow>("speed_checks", `select=site_id,load_time_ms,checked_at&site_id=${siteIdFilter}&checked_at=gte.${tenDaysAgo}&checked_at=lt.${threeDaysAgo}`, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    ]);
    const recentTimes = (recentRes.data ?? []).map(r => r.load_time_ms);
    const priorTimes = (priorRes.data ?? []).map(r => r.load_time_ms);

    if (recentTimes.length >= 2 && priorTimes.length >= 3) {
      const recentAvg = recentTimes.reduce((a, b) => a + b, 0) / recentTimes.length;
      const priorAvg = priorTimes.reduce((a, b) => a + b, 0) / priorTimes.length;
      const improvementPct = priorAvg > 0 ? Math.round(((priorAvg - recentAvg) / priorAvg) * 100) : 0;

      // Той самий принцип, що checkSpeedDegradation: значний відсоток
      // ЗАМІСТЬ дрібних коливань, щоб не хвалити за шум вимірювання.
      if (improvementPct >= 20) {
        await sendTelegramMessage(
          chatId,
          `🎉 <b>Гарна новина від Qorax</b>\n\nШвидкість завантаження помітно покращилась — на ${improvementPct}% за останні дні. Що б це не було (оптимізація, деплой, хостинг) — це працює, продовжуйте в тому ж напрямку!`,
          env.TELEGRAM_BOT_TOKEN
        );
        await insertCoachSignalRecord(organizationId, "speed_improvement", env);
      }
    }
  }
}

async function insertCoachSignalRecord(organizationId: string, signalType: string, env: Env): Promise<void> {
  await insertRow(
    "telegram_coach_messages",
    { organization_id: organizationId, signal_type: signalType },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  ).catch(() => {});
}

/**
 * Викликається з cron-хендлера (index.ts) щодня в тому самому циклі,
 * що вже виконує speed/SEO/конкуренти — не новий Cloudflare cron
 * trigger. Проходить по всіх Telegram-підключених організаціях.
 */
export async function runBusinessCoachCheck(env: Env): Promise<{ checked: number }> {
  const connectedRes = await selectRows<TelegramConnectedOrg>(
    "notification_settings",
    `select=organization_id,telegram_chat_id&telegram_enabled=eq.true&telegram_chat_id=not.is.null`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const orgs = connectedRes.data ?? [];

  for (const org of orgs) {
    await checkBusinessCoachForOrg(org.organization_id, org.telegram_chat_id, env).catch(err => {
      console.error("[business-coach] error for org:", err instanceof Error ? err.message : err);
    });
  }

  return { checked: orgs.length };
}

// ============================================================
// Фото-аналіз (документ Артема, пункт 13: "Відправив скрін. Google
// Search Console. AI аналізує.") Приймає скріншот (GSC, Analytics,
// Lighthouse-звіт тощо), передає в callGeminiVision (contentGeneration.ts
// — та сама vision-функція, що вже переюзовується для Visual Search
// у Qorax Browser, не новий шлях виклику Gemini) з промптом, що
// орієнтує AI саме на бізнес-контекст Qorax (SEO/аналітика/
// продуктивність), а не загальний опис зображення.
// ============================================================

const PHOTO_ANALYSIS_MAX_BYTES = 4 * 1024 * 1024; // Gemini inline_data ліміт з запасом

export async function handleTelegramPhotoMessage(
  chatId: string,
  photos: Array<{ file_id: string; width: number; height: number }>,
  caption: string,
  env: Env
): Promise<void> {
  const organizationId = await getOrgIdByChatId(chatId, env);
  if (!organizationId) {
    await sendTelegramMessage(
      chatId,
      "Цей чат ще не підключено до жодної організації Qorax. Перейдіть у дашборд → Налаштування → Telegram, щоб підключити.",
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  const creditsCheck = await checkAiCredits(organizationId, "business", env);
  if (!creditsCheck.ok) {
    await sendTelegramMessage(
      chatId,
      creditsCheck.disabledByAdmin ? "⚠️ AI-аналіз тимчасово вимкнено адміністратором." : "⚠️ Кредити AI вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу.",
      env.TELEGRAM_BOT_TOKEN
    );
    return;
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) {
    await sendTelegramMessage(chatId, "⚠️ AI не налаштований — зверніться до підтримки.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  // Telegram надсилає кілька розмірів того самого фото — беремо
  // найбільший (найкраща якість для аналізу деталей на скріншоті).
  const largest = photos.reduce((best, p) => (p.width > best.width ? p : best), photos[0]);

  const downloadResult = await downloadTelegramFile(largest.file_id, env.TELEGRAM_BOT_TOKEN);
  if (!downloadResult.ok) {
    console.error("[telegram-photo] download error:", downloadResult.error);
    await sendTelegramMessage(chatId, "⚠️ Не вдалося завантажити фото. Спробуйте ще раз.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  // Приблизна перевірка розміру base64 (base64 ≈ 4/3 від бінарного розміру)
  if (downloadResult.base64.length > PHOTO_ANALYSIS_MAX_BYTES * 1.4) {
    await sendTelegramMessage(chatId, "⚠️ Зображення завелике для аналізу. Спробуйте надіслати менший скріншот.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  const prompt = `Це скріншот, надісланий власником бізнесу в Telegram-боті Qorax (платформа технічного моніторингу сайтів і SEO). Це може бути звіт з Google Search Console, Google Analytics, PageSpeed Insights, панель іншого SEO-інструменту, або просто скріншот сайту.${caption ? `\n\nПідпис від користувача: "${caption}"` : ""}

Проаналізуй зображення і дай коротку (3-5 речень) відповідь українською мовою: що це за дані, які там ключові цифри/тренди помітні, і чи є щось, на що варто звернути увагу. Якщо на зображенні немає нічого схожого на аналітику/метрики сайту — просто чесно опиши, що бачиш, не вигадуй SEO-контекст, якого там немає.`;

  const result = await callGeminiVision(prompt, downloadResult.base64, downloadResult.mimeType, apiKey);
  if (!result.ok) {
    await sendTelegramMessage(chatId, "⚠️ Не вдалося проаналізувати зображення, спробуйте ще раз.", env.TELEGRAM_BOT_TOKEN);
    return;
  }

  await deductAiCredits(organizationId, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
  await sendTelegramMessage(chatId, `🖼 <b>Аналіз зображення</b>\n\n${result.text}`, env.TELEGRAM_BOT_TOKEN);
}
