-- 0064_analytics_module.sql
-- Analytics — модуль "єдина аналітика" (MODULE_ROADMAP.md, розділ 3).
-- MVP-обсяг цієї ітерації: тільки GA4 (Cloudflare Analytics — друга
-- ітерація, роадмап явно дозволяє звузити MVP до одного джерела).
--
-- Точна схема з MODULE_ROADMAP.md розділ 3, Крок 1, з одним уточненням:
-- ga4_connections повторює структуру gsc_connections (0006_monitoring_seo.sql)
-- максимально близько — той самий OAuth-патерн (AES-GCM шифрування
-- refresh_token, is_active/last_synced_at для стану підключення), щоб
-- переюзати вже написані encrypt/decrypt helpers з gscHandler.ts, а не
-- винаходити нову форму зберігання токенів.

create table ga4_connections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade unique,
  property_id text not null,          -- GA4 property id (напр. "properties/123456789")
  encrypted_refresh_token text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  is_active boolean not null default true
);

comment on table ga4_connections is 'OAuth-підключення до Google Analytics 4. encrypted_refresh_token шифрується AES-GCM тим самим ключем/helper, що gsc_connections (GOOGLE_TOKEN_ENCRYPTION_KEY) — не зберігати plaintext токени.';

create unique index idx_ga4_connections_site_id on ga4_connections(site_id);

create table analytics_daily_snapshot (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  date date not null,
  sessions integer,
  conversions integer,
  bounce_rate numeric,
  source text not null,               -- 'ga4' | 'cloudflare' (друге джерело — майбутня ітерація)
  created_at timestamptz not null default now(),
  unique (site_id, date, source)
);

comment on table analytics_daily_snapshot is 'Уніфікований щоденний зріз аналітики. Один рядок = один сайт + дата + джерело — дозволяє об''єднувати кілька джерел (GA4, згодом Cloudflare Analytics) без окремих таблиць на кожне.';

create index idx_analytics_daily_snapshot_site on analytics_daily_snapshot(site_id, date desc);

-- ── RLS — той самий патерн, що gsc_connections/gsc_metrics (0011_row_level_security.sql) ──

alter table ga4_connections enable row level security;
create policy "Members can view own ga4 connections"
  on ga4_connections for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table analytics_daily_snapshot enable row level security;
create policy "Members can view own analytics snapshots"
  on analytics_daily_snapshot for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

-- ── Реєстрація модуля в platform_modules ──────────────────────────────
-- 'analytics' вже зареєстрований у 0039_platform_foundation.sql зі
-- статусом 'coming_soon' (sort_order 60) — новий insert не потрібен,
-- Артем переводить у 'live' вручну через /dashboard/admin, коли
-- перевірить готовий модуль (той самий механізм, що інші модулі).
