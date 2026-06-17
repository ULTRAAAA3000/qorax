-- ============================================================
-- QORAX — Migration 0002: Subscriptions (Stripe sync)
-- ============================================================
-- Логика:
-- - plans — статичная таблица с 3 тарифами (Starter/Growth/Agency), цены и лимиты.
--   Храним в БД, а не в коде, чтобы менять цены без деплоя.
-- - subscriptions — текущая подписка organization, синхронизируется через Stripe webhooks.
--   stripe_subscription_id / stripe_customer_id — ключи для связи с Stripe.
-- - audit_purchases — разовая покупка аудита за $19 (trigger-продукт), НЕ подписка.
-- ============================================================

create type subscription_status as enum (
  'trialing', 'active', 'past_due', 'canceled', 'incomplete', 'incomplete_expired', 'unpaid'
);

create type plan_code as enum ('starter', 'growth', 'agency');

-- ------------------------------------------------------------
-- plans — справочник тарифов
-- ------------------------------------------------------------

create table plans (
  id uuid primary key default gen_random_uuid(),
  code plan_code not null unique,
  name text not null,
  price_usd numeric(10, 2) not null,
  site_limit integer not null,
  extra_site_price_usd numeric(10, 2), -- только для agency: $29/доп. сайт
  stripe_price_id text, -- ID цены в Stripe для checkout
  features jsonb not null default '{}', -- флаги доступных фич плана, см. ниже пример
  created_at timestamptz not null default now()
);

comment on table plans is 'Справочник тарифов. features jsonb хранит флаги доступа к фичам плана.';

-- Начальные данные тарифов
insert into plans (code, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'starter', 'Starter', 49.00, 1, null,
  '{
    "uptime_monitoring": true,
    "speed_tracking": true,
    "ssl_domain_alerts": true,
    "broken_links": true,
    "ai_explain_simple": true,
    "monthly_pdf_report": true,
    "email_alerts": true,
    "core_web_vitals": false,
    "meta_schema_checker": false,
    "gsc_integration": false,
    "sitemap_robots_analysis": false,
    "duplicate_pages": false,
    "ai_revenue_impact": false,
    "competitor_monitoring": 0,
    "telegram_alerts": false,
    "live_dashboard": false,
    "white_label": false,
    "ai_content_generation": false
  }'::jsonb
),
(
  'growth', 'Growth', 99.00, 1, null,
  '{
    "uptime_monitoring": true,
    "speed_tracking": true,
    "ssl_domain_alerts": true,
    "broken_links": true,
    "ai_explain_simple": true,
    "monthly_pdf_report": true,
    "email_alerts": true,
    "core_web_vitals": true,
    "meta_schema_checker": true,
    "gsc_integration": true,
    "sitemap_robots_analysis": true,
    "duplicate_pages": true,
    "ai_revenue_impact": true,
    "competitor_monitoring": 1,
    "telegram_alerts": true,
    "live_dashboard": true,
    "white_label": false,
    "ai_content_generation": false
  }'::jsonb
),
(
  'agency', 'Agency', 199.00, 5, 29.00,
  '{
    "uptime_monitoring": true,
    "speed_tracking": true,
    "ssl_domain_alerts": true,
    "broken_links": true,
    "ai_explain_simple": true,
    "monthly_pdf_report": true,
    "email_alerts": true,
    "core_web_vitals": true,
    "meta_schema_checker": true,
    "gsc_integration": true,
    "sitemap_robots_analysis": true,
    "duplicate_pages": true,
    "ai_revenue_impact": true,
    "competitor_monitoring": -1,
    "telegram_alerts": true,
    "live_dashboard": true,
    "white_label": true,
    "ai_content_generation": true
  }'::jsonb
);
-- competitor_monitoring: 0 = нет, 1 = один сайт, -1 = безлимит (на каждый сайт)

-- ------------------------------------------------------------
-- subscriptions — активная подписка организации
-- ------------------------------------------------------------

create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  plan_id uuid not null references plans(id),
  status subscription_status not null default 'incomplete',
  stripe_customer_id text,
  stripe_subscription_id text unique,
  extra_sites integer not null default 0, -- доп. сайты сверх лимита плана (только agency)
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table subscriptions is 'Текущая подписка организации. Синхронизируется через Stripe webhooks (checkout.session.completed, customer.subscription.updated и т.д.)';

create unique index idx_subscriptions_one_active_per_org on subscriptions(organization_id)
  where status in ('trialing', 'active', 'past_due');
-- Гарантирует что у организации не может быть двух одновременно активных подписок

create index idx_subscriptions_stripe_customer on subscriptions(stripe_customer_id);

create trigger trg_subscriptions_updated_at
  before update on subscriptions
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- audit_purchases — разовый платный аудит $19 (НЕ подписка)
-- ------------------------------------------------------------

create table audit_purchases (
  id uuid primary key default gen_random_uuid(),
  -- покупка может быть до регистрации (просто по email), поэтому organization_id опционален
  organization_id uuid references organizations(id) on delete set null,
  email text not null,
  site_url text not null,
  price_usd numeric(10, 2) not null default 19.00,
  stripe_payment_intent_id text unique,
  paid boolean not null default false,
  pdf_url text, -- ссылка на сгенерированный PDF после оплаты
  created_at timestamptz not null default now()
);

comment on table audit_purchases is 'Разовый платный аудит за $19 — trigger-продукт перед подпиской. Не требует регистрации.';

create index idx_audit_purchases_email on audit_purchases(email);
