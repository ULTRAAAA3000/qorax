-- ============================================================
-- QORAX — Migration 0005: Monitoring — SSL, Domain, Broken Links, Console Errors
-- ============================================================

-- ------------------------------------------------------------
-- ssl_certificates — текущий статус SSL сертификата
-- ------------------------------------------------------------
-- В отличие от uptime/speed это не временной ряд, а "текущее состояние",
-- поэтому одна запись на сайт с overwrite (upsert), не append.

create table ssl_certificates (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade unique,
  issuer text,
  valid_from timestamptz,
  valid_until timestamptz,
  days_until_expiry integer, -- вычисляется при каждой проверке, для быстрой выборки "скоро истекут"
  last_checked_at timestamptz not null default now(),
  alert_sent_30d boolean not null default false, -- чтобы не слать алерт повторно
  alert_sent_7d boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table ssl_certificates is 'Текущий статус SSL. Одна запись на сайт (upsert при каждой проверке).';

create index idx_ssl_expiry on ssl_certificates(days_until_expiry);

-- ------------------------------------------------------------
-- domain_registrations — статус домена (когда истекает регистрация)
-- ------------------------------------------------------------

create table domain_registrations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade unique,
  registrar text,
  expires_at timestamptz,
  days_until_expiry integer,
  last_checked_at timestamptz not null default now(),
  alert_sent_30d boolean not null default false,
  alert_sent_7d boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table domain_registrations is 'Статус регистрации домена через WHOIS. Одна запись на сайт.';

create index idx_domain_expiry on domain_registrations(days_until_expiry);

-- ------------------------------------------------------------
-- broken_links — найденные битые ссылки при краулинге сайта
-- ------------------------------------------------------------

create type link_check_status as enum ('broken', 'fixed');

create table broken_links (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  source_page_url text not null, -- на какой странице найдена ссылка
  broken_url text not null, -- сама битая ссылка
  http_status_code integer,
  status link_check_status not null default 'broken',
  first_found_at timestamptz not null default now(),
  last_checked_at timestamptz not null default now(),
  fixed_at timestamptz
);

comment on table broken_links is 'Битые ссылки, найденные краулером раз в неделю. status=fixed когда повторная проверка не находит ошибку.';

create index idx_broken_links_site on broken_links(site_id);
create index idx_broken_links_active on broken_links(site_id) where status = 'broken';

-- ------------------------------------------------------------
-- console_errors — ошибки JS в браузерной консоли (headless browser)
-- ------------------------------------------------------------

create table console_errors (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  error_message text not null,
  error_source text, -- файл/строка если доступно
  severity text not null default 'error' check (severity in ('error', 'warning')),
  checked_at timestamptz not null default now()
);

comment on table console_errors is 'Ошибки в консоли браузера, собранные headless browser проверкой (Puppeteer/Playwright в Worker).';

create index idx_console_errors_site_time on console_errors(site_id, checked_at desc);

-- ------------------------------------------------------------
-- mobile_checks — проверка мобильной версии
-- ------------------------------------------------------------

create table mobile_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  is_mobile_friendly boolean,
  viewport_configured boolean,
  text_readable boolean,
  tap_targets_ok boolean,
  screenshot_url text, -- скриншот мобильной версии, если делаем визуальный мониторинг
  issues jsonb not null default '[]', -- список конкретных найденных проблем
  checked_at timestamptz not null default now()
);

comment on table mobile_checks is 'Проверка мобильной версии сайта (viewport, читаемость текста, размер тап-таргетов).';

create index idx_mobile_checks_site_time on mobile_checks(site_id, checked_at desc);
