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

// ─── Instant Actions (документ Артема, пункт 8: "Telegram пишет.
// [Исправить] [Позже]. Нажал. Qorax сделал.") ──────────────────
// Реальна дія за кнопкою "Виправити" — не магічний автофікс коду
// (такого механізму на платформі немає й не планується цим проходом),
// а той самий fix_requests flow, що вже є на вебі (заявка студії
// Qorax на ручне виправлення, handleFixRequest) — тут просто
// подається в один клік з Telegram замість форми на сайті.

export interface TelegramInlineButton {
  text: string;
  callback_data: string; // максимум 64 байти за обмеженням Telegram Bot API
}

export async function sendTelegramMessageWithButtons(
  chatId: string,
  text: string,
  buttons: TelegramInlineButton[][],
  botToken: string
): Promise<{ ok: boolean; messageId?: number; error?: string }> {
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
          reply_markup: { inline_keyboard: buttons },
        }),
      }
    );
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Telegram API error ${response.status}: ${body.slice(0, 200)}` };
    }
    const data = await response.json() as { result?: { message_id?: number } };
    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * Telegram Bot API вимагає відповіді на кожен callback_query протягом
 * кількох секунд — інакше кнопка в клієнті нескінченно показує
 * "завантаження". showAlert=true показує спливаюче вікно замість
 * тихого тоста (для явного підтвердження дії користувачу).
 */
export async function answerTelegramCallbackQuery(
  callbackQueryId: string,
  text: string | undefined,
  botToken: string,
  showAlert = false
): Promise<void> {
  try {
    await fetch(`${TELEGRAM_ENDPOINT}/bot${botToken}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: showAlert }),
    });
  } catch {
    // best-effort — якщо не вдалось, кнопка просто покрутиться
    // трохи довше в клієнті, не критично
  }
}

/**
 * Прибирає inline-кнопки з уже надісланого повідомлення (після дії —
 * щоб не можна було натиснути "Виправити" вдруге на той самий issue).
 */
export async function clearTelegramMessageButtons(
  chatId: string,
  messageId: number,
  botToken: string
): Promise<void> {
  try {
    await fetch(`${TELEGRAM_ENDPOINT}/bot${botToken}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    });
  } catch {
    // best-effort
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
