// ============================================================
// telegram.ts — відправка Telegram-алертів через Bot API.
// Доступно з Growth плану. Бот: @QoraxBot (потрібно створити
// через @BotFather і додати TELEGRAM_BOT_TOKEN до Worker secrets).
//
// Повідомлення форматуються в HTML (Telegram підтримує базовий
// HTML: <b>, <i>, <code>, <a>) — виглядає чисто і читабельно.
// ============================================================

const TELEGRAM_ENDPOINT = "https://api.telegram.org";

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  botToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${TELEGRAM_ENDPOINT}/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Telegram API error ${response.status}: ${body.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Message builders ─────────────────────────────────────────

export function buildSiteDownTelegram(params: {
  siteDisplayName: string;
  siteUrl: string;
  dashboardUrl: string;
}): string {
  return `🔴 <b>Сайт недоступний</b>

<b>${params.siteDisplayName}</b>
<code>${params.siteUrl}</code>

Qorax виявив проблему і відстежує відновлення.
Ми надішлемо повідомлення коли сайт запрацює.

<a href="${params.dashboardUrl}">→ Відкрити дашборд</a>`;
}

export function buildSiteRecoveredTelegram(params: {
  siteDisplayName: string;
  siteUrl: string;
  downtimeDurationMinutes: number;
  dashboardUrl: string;
}): string {
  const dur = params.downtimeDurationMinutes < 60
    ? `${params.downtimeDurationMinutes} хв`
    : `${Math.round(params.downtimeDurationMinutes / 60)} год ${params.downtimeDurationMinutes % 60} хв`;

  return `✅ <b>Сайт відновлено</b>

<b>${params.siteDisplayName}</b>
<code>${params.siteUrl}</code>

Тривалість простою: <b>${dur}</b>

<a href="${params.dashboardUrl}">→ Відкрити дашборд</a>`;
}

export function buildSslExpiryTelegram(params: {
  siteDisplayName: string;
  siteUrl: string;
  daysLeft: number;
  dashboardUrl: string;
}): string {
  const emoji = params.daysLeft <= 7 ? "🚨" : "⚠️";
  return `${emoji} <b>SSL закінчується через ${params.daysLeft} днів</b>

<b>${params.siteDisplayName}</b>
<code>${params.siteUrl}</code>

Поновіть сертифікат щоб уникнути попереджень у браузерах.

<a href="${params.dashboardUrl}">→ Відкрити дашборд</a>`;
}

export function buildCompetitorChangeTelegram(params: {
  siteDisplayName: string;
  competitorUrl: string;
  dashboardUrl: string;
}): string {
  return `👁 <b>Зміни у конкурента</b>

На сайті <code>${params.competitorUrl}</code> зафіксовано зміни контенту.

Сайт під моніторингом: <b>${params.siteDisplayName}</b>

<a href="${params.dashboardUrl}">→ Переглянути</a>`;
}
