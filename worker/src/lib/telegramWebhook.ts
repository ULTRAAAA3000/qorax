// ============================================================
// telegramWebhook.ts — обробник webhook-апдейтів від Telegram Bot API.
//
// Флоу підключення:
//   1. Фронт генерує посилання t.me/<botname>?start=<org_id>
//   2. Користувач переходить, натискає START — Telegram шле боту
//      message з текстом "/start <org_id>"
//   3. Цей обробник зберігає chat_id → notification_settings і
//      вмикає telegram_enabled = true
//   4. Фронт робить polling /api/telegram/status?org=<org_id> і
//      відображає "✅ Підключено" без перезавантаження сторінки
//
// Безпека: перевіряємо що бот-токен у URL-секреті співпадає —
// Telegram Bot API дозволяє задати secret_token при setWebhook,
// тоді кожен апдейт приходить із заголовком X-Telegram-Bot-Api-Secret-Token.
// Без цієї перевірки будь-хто міг би POST'ити на /api/telegram/webhook.
// ============================================================

import type { Env } from "../types";
import { selectRows, upsertRow } from "./supabase";
import { sendTelegramMessage } from "./telegram";

// Telegram Bot API шле апдейти у вигляді JSON-об'єкта Update.
// Визначаємо тільки поля, які нам потрібні.
interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number; first_name?: string; username?: string };
    chat: { id: number; type: string };
    text?: string;
  };
}

export async function handleTelegramWebhook(
  request: Request,
  env: Env
): Promise<Response> {
  // Перевірка secret token — якщо він заданий при setWebhook
  // (рекомендовано), то будь-який запит без правильного заголовку
  // відхиляємо одразу. Якщо secret не налаштований — пропускаємо перевірку.
  if (env.TELEGRAM_WEBHOOK_SECRET) {
    const incomingSecret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (incomingSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return new Response("Bad Request", { status: 400 });
  }

  const message = update.message;
  // Нас цікавлять тільки текстові повідомлення — ігноруємо решту апдейтів
  // (фото, стікери, inline query і т.д.) без помилки.
  if (!message?.text) {
    return new Response("ok", { status: 200 });
  }

  const chatId = String(message.chat.id);
  const text = message.text.trim();

  // Формат: /start <org_id>
  // Telegram замінює пробіл на _ у deep link, але при START зберігає оригінал.
  if (text.startsWith("/start")) {
    const parts = text.split(/\s+/);
    const rawPayload = parts[1] ?? null;

    // Відновлюємо UUID: фронт передає org_id з _ замість - (обмеження
    // Telegram deep link payload — дефіси заборонені)
    const orgId = rawPayload ? rawPayload.replace(/_/g, "-") : null;

    if (!orgId) {
      // /start без параметру — бот запущений напряму, не через наш deep link
      await sendTelegramMessage(
        chatId,
        `👋 Вітаємо у Qorax Bot!\n\nЦей бот надсилає алерти про стан ваших сайтів.\n\nЩоб підключити сповіщення, перейдіть у <b>Налаштування → Telegram</b> у вашому дашборді Qorax і натисніть кнопку підключення.`,
        env.TELEGRAM_BOT_TOKEN
      );
      return new Response("ok", { status: 200 });
    }

    // Перевіряємо що org_id справді існує в базі — щоб не зберігати
    // сміттєві chat_id від людей, які вгадали або перебирають org_id
    const orgCheck = await selectRows<{ id: string }>(
      "organizations",
      `select=id&id=eq.${encodeURIComponent(orgId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!orgCheck.ok || !orgCheck.data[0]) {
      await sendTelegramMessage(
        chatId,
        `❌ Посилання недійсне або застаріло. Спробуйте згенерувати нове у налаштуваннях Qorax.`,
        env.TELEGRAM_BOT_TOKEN
      );
      return new Response("ok", { status: 200 });
    }

    // Зберігаємо chat_id і вмикаємо telegram алерти для цієї організації
    const upsertResult = await upsertRow(
      "notification_settings",
      {
        organization_id: orgId,
        telegram_chat_id: chatId,
        telegram_enabled: true,
      },
      "organization_id",
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!upsertResult.ok) {
      console.error("Telegram webhook: failed to save chat_id", upsertResult.error);
      await sendTelegramMessage(
        chatId,
        `⚠️ Виникла помилка при підключенні. Спробуйте ще раз або зверніться до підтримки.`,
        env.TELEGRAM_BOT_TOKEN
      );
      return new Response("ok", { status: 200 });
    }

    const firstName = message.from?.first_name ?? "";
    await sendTelegramMessage(
      chatId,
      `✅ <b>Telegram підключено до Qorax${firstName ? `, ${firstName}` : ""}!</b>\n\nВи отримуватимете сповіщення коли:\n• 🔴 Сайт стає недоступним\n• ✅ Сайт відновлює роботу\n• ⚠️ SSL-сертифікат закінчується\n\nНалаштувати типи сповіщень можна у <b>Налаштування → Сповіщення</b> у дашборді.`,
      env.TELEGRAM_BOT_TOKEN
    );

    return new Response("ok", { status: 200 });
  }

  // Будь-яке інше повідомлення — підказка
  await sendTelegramMessage(
    chatId,
    `Цей бот надсилає автоматичні алерти від Qorax. Для підключення скористайтесь посиланням у налаштуваннях дашборду.`,
    env.TELEGRAM_BOT_TOKEN
  );

  return new Response("ok", { status: 200 });
}
