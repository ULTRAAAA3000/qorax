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

// ─── Постійна reply-клавіатура + меню команд (UX: людині не треба
// пам'ятати команди напам'ять — кнопки внизу екрана + офіційне меню
// Telegram при натисканні "☰"). ────────────────────────────────

/**
 * Постійна клавіатура з кнопками замість inline (та зникає одразу
 * після натискання) — reply-кнопки лишаються видимими під полем
 * вводу, доки їх явно не приберуть. Натискання кнопки надсилає її
 * текст як звичайне повідомлення — тому текст кнопки має точно
 * збігатися з тим, що диспетчер команд (handleTelegramBotMessage)
 * очікує розпізнати.
 */
export async function sendTelegramMessageWithReplyKeyboard(
  chatId: string,
  text: string,
  keyboard: string[][],
  botToken: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${TELEGRAM_ENDPOINT}/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: {
          keyboard: keyboard.map(row => row.map(t => ({ text: t }))),
          resize_keyboard: true,
          is_persistent: true,
        },
      }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Telegram API error ${response.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * setMyCommands — реєструє офіційне меню команд Telegram (кнопка
 * "☰" поруч з полем вводу повідомлення). Викликається один раз при
 * старті воркера/деплої, не на кожне повідомлення — Telegram кешує
 * це на своїй стороні per-bot, не per-chat.
 */
export async function setTelegramBotCommands(botToken: string): Promise<{ ok: boolean; error?: string }> {
  const commands = [
    { command: "audit", description: "Короткий звіт по всіх сайтах" },
    { command: "score", description: "PageSpeed (Lighthouse)" },
    { command: "speed", description: "Core Web Vitals (LCP/INP/CLS)" },
    { command: "issues", description: "Активні проблеми" },
    { command: "rank", description: "Позиції у пошуку" },
    { command: "traffic", description: "Трафік з пошуку (GSC)" },
    { command: "report", description: "Де знайти повний звіт" },
    { command: "help", description: "Список команд і можливостей" },
  ];
  try {
    const response = await fetch(`${TELEGRAM_ENDPOINT}/bot${botToken}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands }),
    });
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: `Telegram API error ${response.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

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
 * Завантажує файл з Telegram (фото/документ) за file_id — потребує
 * двох запитів: getFile повертає file_path, потім прямий GET на
 * файловий сервер Telegram. Повертає base64 для передачі в Gemini
 * vision (callGeminiVision очікує саме base64 + mimeType).
 */
export async function downloadTelegramFile(
  fileId: string,
  botToken: string
): Promise<{ ok: true; base64: string; mimeType: string } | { ok: false; error: string }> {
  try {
    const getFileResp = await fetch(`${TELEGRAM_ENDPOINT}/bot${botToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    if (!getFileResp.ok) return { ok: false, error: `getFile ${getFileResp.status}` };
    const getFileData = await getFileResp.json() as { result?: { file_path?: string } };
    const filePath = getFileData.result?.file_path;
    if (!filePath) return { ok: false, error: "file_path відсутній у відповіді Telegram" };

    const fileResp = await fetch(`${TELEGRAM_ENDPOINT}/file/bot${botToken}/${filePath}`);
    if (!fileResp.ok) return { ok: false, error: `завантаження файлу ${fileResp.status}` };

    const buffer = await fileResp.arrayBuffer();
    // Cloudflare Workers має btoa, але не Buffer — конвертуємо через
    // Uint8Array напряму, той самий підхід, що вже десь у кодовій базі
    // для роботи з бінарними даними без Node.js Buffer API.
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const chunkSize = 8192; // уникаємо переповнення стеку на великих файлах через apply()
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const ext = filePath.split(".").pop()?.toLowerCase();
    const mimeType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";

    return { ok: true, base64, mimeType };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
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
