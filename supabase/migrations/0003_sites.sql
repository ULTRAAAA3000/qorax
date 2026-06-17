-- ============================================================
-- QORAX — Migration 0003: Sites
-- ============================================================
-- sites — сайт клиента, добавленный на мониторинг.
-- Один client = до 1 сайта (лимит из плана), agency = до 5 (+ extra_sites).
-- Реальная проверка лимита делается в коде приложения перед insert,
-- здесь только структура.
-- ============================================================

create type site_platform as enum (
  'wordpress', 'shopify', 'webflow', 'custom', 'wix', 'squarespace', 'other', 'unknown'
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  url text not null,
  display_name text not null,
  platform site_platform not null default 'unknown',
  is_ecommerce boolean not null default false, -- влияет на доступные проверки (чекаут, товары)
  monitoring_enabled boolean not null default true,
  -- частота проверок в минутах, зависит от плана (можно тонко настраивать позже)
  check_interval_minutes integer not null default 5,
  timezone text not null default 'Europe/Kyiv',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table sites is 'Сайт клиента на мониторинге. Лимит количества сайтов на organization проверяется в коде по plans.site_limit + subscriptions.extra_sites.';

create index idx_sites_organization on sites(organization_id);

create trigger trg_sites_updated_at
  before update on sites
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- competitor_sites — сайты конкурентов для мониторинга изменений
-- ------------------------------------------------------------

create table competitor_sites (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade, -- "наш" сайт, к которому привязан конкурент
  url text not null,
  display_name text,
  last_snapshot_hash text, -- хэш контента страницы для определения изменений
  last_checked_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table competitor_sites is 'Сайты конкурентов. Лимит: Growth = 1 на организацию, Agency = безлимит на каждый сайт.';

create index idx_competitor_sites_site on competitor_sites(site_id);
