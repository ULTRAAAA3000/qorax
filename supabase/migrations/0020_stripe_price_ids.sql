-- ============================================================
-- QORAX — Migration 0020: Stripe Price IDs
-- ============================================================
-- Додаємо stripe_price_id до планів. Значення заповнюються вручну
-- після створення продуктів/цін у Stripe Dashboard.
--
-- Як заповнити:
--   Stripe Dashboard → Products → створи продукт для кожного плану
--   → скопіюй Price ID (price_xxx) → встав нижче → виконай міграцію
--
-- АБО заповни через SQL після створення цін:
--   update plans set stripe_price_id = 'price_xxx' where code = 'starter';
--   update plans set stripe_price_id = 'price_xxx' where code = 'growth';
--   update plans set stripe_price_id = 'price_xxx' where code = 'agency';
-- ============================================================

-- stripe_price_id вже є в таблиці plans (з migration 0002)
-- Просто додаємо коментар для ясності:
comment on column plans.stripe_price_id is
  'Stripe Price ID (price_xxx) для цього плану. Використовується при створенні Checkout Session.';

-- Додаємо stripe_webhook_event_id для idempotency webhook обробки
alter table subscriptions
  add column if not exists stripe_webhook_event_id text;

comment on column subscriptions.stripe_webhook_event_id is
  'ID останнього обробленого Stripe webhook event — для idempotency.';
