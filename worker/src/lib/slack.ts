// ============================================================
// slack.ts — відправка Slack-алертів через Incoming Webhook.
// Доступно з Growth плану, аналогічно Telegram.
//
// На відміну від Telegram, Slack не потребує bot-токена —
// organization просто вставляє Incoming Webhook URL зі свого
// Slack workspace (Settings → Incoming Webhooks).
//
// Повідомлення форматуються через Slack Block Kit — виглядає
// чистіше за простий текст і підтримує розмітку заголовків.
// ============================================================

export async function sendSlackMessage(
  webhookUrl: string,
  text: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Slack webhook error ${response.status}: ${body.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Message builders ─────────────────────────────────────────
// Slack підтримує mrkdwn: *bold*, `code`, <url|text>

export function buildSiteDownSlack(params: {
  siteDisplayName: string;
  siteUrl: string;
  dashboardUrl: string;
}): string {
  return `:red_circle: *Сайт недоступний*\n\n*${params.siteDisplayName}*\n\`${params.siteUrl}\`\n\nQorax виявив проблему і відстежує відновлення.\n<${params.dashboardUrl}|→ Відкрити дашборд>`;
}

export function buildSiteRecoveredSlack(params: {
  siteDisplayName: string;
  siteUrl: string;
  downtimeDurationMinutes: number;
  dashboardUrl: string;
}): string {
  const dur = params.downtimeDurationMinutes < 60
    ? `${params.downtimeDurationMinutes} хв`
    : `${Math.round(params.downtimeDurationMinutes / 60)} год ${params.downtimeDurationMinutes % 60} хв`;

  return `:white_check_mark: *Сайт відновлено*\n\n*${params.siteDisplayName}*\n\`${params.siteUrl}\`\n\nТривалість простою: *${dur}*\n<${params.dashboardUrl}|→ Відкрити дашборд>`;
}

export function buildSslExpirySlack(params: {
  siteDisplayName: string;
  siteUrl: string;
  daysLeft: number;
  dashboardUrl: string;
}): string {
  const emoji = params.daysLeft <= 7 ? ":rotating_light:" : ":warning:";
  return `${emoji} *SSL закінчується через ${params.daysLeft} днів*\n\n*${params.siteDisplayName}*\n\`${params.siteUrl}\`\n\nПоновіть сертифікат щоб уникнути попереджень у браузерах.\n<${params.dashboardUrl}|→ Відкрити дашборд>`;
}

export function buildCompetitorChangeSlack(params: {
  siteDisplayName: string;
  competitorUrl: string;
  dashboardUrl: string;
}): string {
  return `:eyes: *Зміни у конкурента*\n\nНа сайті \`${params.competitorUrl}\` зафіксовано зміни контенту.\n\nСайт під моніторингом: *${params.siteDisplayName}*\n<${params.dashboardUrl}|→ Переглянути>`;
}
