-- ============================================================
-- QORAX — Migration 0008: Alerts & Notifications
-- ============================================================

create type alert_channel as enum ('email', 'telegram');
create type alert_type as enum (
  'site_down', 'site_recovered', 'ssl_expiring', 'domain_expiring',
  'broken_links_found', 'speed_degraded', 'competitor_change', 'subscription_issue'
);
create type alert_delivery_status as enum ('pending', 'sent', 'failed');

-- ------------------------------------------------------------
-- notification_settings — настройки уведомлений организации
-- ------------------------------------------------------------

create table notification_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade unique,
  email_enabled boolean not null default true,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  notify_site_down boolean not null default true,
  notify_ssl_domain_expiry boolean not null default true,
  notify_broken_links boolean not null default true,
  notify_speed_degraded boolean not null default true,
  notify_competitor_changes boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table notification_settings is 'Настройки каналов уведомлений организации. Telegram доступен с Growth плана.';

create trigger trg_notification_settings_updated_at
  before update on notification_settings
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- alerts — история отправленных уведомлений
-- ------------------------------------------------------------

create table alerts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  alert_type alert_type not null,
  channel alert_channel not null,
  message text not null,
  delivery_status alert_delivery_status not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table alerts is 'История всех отправленных алертов. Используется и для отладки доставки, и для отчётов "сколько проблем поймали за месяц".';

create index idx_alerts_organization on alerts(organization_id);
create index idx_alerts_site on alerts(site_id);
create index idx_alerts_status_pending on alerts(delivery_status) where delivery_status = 'pending';
