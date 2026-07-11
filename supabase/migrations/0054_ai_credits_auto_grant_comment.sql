-- 0054_ai_credits_auto_grant_comment.sql
-- Фаза 0.3 з EXECUTION_PLAN.md — авто-видача ai_credits реалізована
-- в lemonSqueezyWebhook.ts (handleSubscriptionActive, upsert
-- ai_credits при subscription_created/updated/resumed). Коментар на
-- таблиці з 0042_ai_content_module.sql стверджував протилежне —
-- оновлюємо, щоб не залишати неправдиве твердження в схемі.

comment on table ai_credits is
  'Ліміт AI-генерацій на організацію. Автоматично видається/оновлюється при subscription_created/updated/resumed (lemonSqueezyWebhook.ts, handleSubscriptionActive) — конкретні числа на тариф у AI_CREDITS_BY_PLAN, робочі заглушки (EXECUTION_PLAN.md Фаза 0.3), не остаточне комерційне рішення. credits_reset_at виставляється на 1-е число наступного місяця при кожній активації підписки; фактичне ЩОМІСЯЧНЕ скидання (окремий cron) ще не реалізовано — TODO, якщо організація не отримує новий webhook щомісяця (напр. річна підписка), credits_remaining не оновиться автоматично.';
