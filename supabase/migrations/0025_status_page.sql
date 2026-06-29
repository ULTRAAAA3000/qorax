-- ============================================================
-- QORAX — Migration 0025: Public Status Page (Growth)
-- Додає до sites slug для публічної сторінки статусу.
-- ============================================================

alter table sites
  add column if not exists status_page_slug text unique,
  add column if not exists status_page_enabled boolean not null default false;

comment on column sites.status_page_slug is
  'Унікальний slug для публічної сторінки статусу. Null = не налаштовано.';
comment on column sites.status_page_enabled is
  'Чи увімкнена публічна сторінка статусу (Growth+).';

create index if not exists idx_sites_status_slug
  on sites(status_page_slug)
  where status_page_slug is not null;
