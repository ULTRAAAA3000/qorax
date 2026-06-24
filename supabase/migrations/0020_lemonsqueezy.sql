-- ============================================================
-- QORAX — Migration 0020: LemonSqueezy замість Stripe
-- ============================================================
-- Перейменовуємо stripe_* колонки на ls_* (LemonSqueezy).
-- Додаємо ls_customer_portal_url для прямого посилання на портал.
-- plans.stripe_price_id → plans.ls_variant_id (variant = ціна в LS)
-- ============================================================

-- subscriptions
alter table subscriptions
  rename column stripe_subscription_id to ls_subscription_id;

alter table subscriptions
  rename column stripe_customer_id to ls_customer_id;

-- Додаємо URL порталу керування підпискою (повертається в webhook)
alter table subscriptions
  add column if not exists ls_customer_portal_url text;

-- Додаємо variant_id для зберігання LS variant (=ціна/план)
alter table subscriptions
  add column if not exists ls_variant_id text;

-- plans: stripe_price_id → ls_variant_id
alter table plans
  rename column stripe_price_id to ls_variant_id;

-- Коментарі
comment on column subscriptions.ls_subscription_id is 'LemonSqueezy subscription ID';
comment on column subscriptions.ls_customer_id is 'LemonSqueezy customer ID';
comment on column subscriptions.ls_customer_portal_url is 'URL до LemonSqueezy customer portal для управління підпискою';
comment on column plans.ls_variant_id is 'LemonSqueezy variant ID — відповідає конкретній ціні плану';
