-- ============================================================
-- QORAX — Migration 0027: fix incomplete 0026 + status_page
-- form_checks таблиця створена частково — дропаємо і ребілдуємо
-- ============================================================

-- 1. competitor_changes snapshot columns
alter table competitor_changes
  add column if not exists old_snapshot text,
  add column if not exists new_snapshot text;

-- 2. monitored_urls (idempotent)
create table if not exists monitored_urls (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  url         text not null,
  label       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique(site_id, url)
);
create index if not exists idx_monitored_urls_site on monitored_urls(site_id);
alter table monitored_urls enable row level security;
drop policy if exists "org members" on monitored_urls;
create policy "org members" on monitored_urls
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

-- 3. url_speed_checks (idempotent)
create table if not exists url_speed_checks (
  id               uuid primary key default gen_random_uuid(),
  monitored_url_id uuid not null references monitored_urls(id) on delete cascade,
  site_id          uuid not null references sites(id) on delete cascade,
  load_time_ms     integer,
  status_code      integer,
  checked_at       timestamptz not null default now()
);
create index if not exists idx_url_speed_checks_url_date
  on url_speed_checks(monitored_url_id, checked_at desc);
alter table url_speed_checks enable row level security;
drop policy if exists "org members" on url_speed_checks;
create policy "org members" on url_speed_checks
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

-- 4. monitored_forms (idempotent)
create table if not exists monitored_forms (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  page_url      text not null,
  form_selector text,
  label         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique(site_id, page_url)
);
create index if not exists idx_monitored_forms_site on monitored_forms(site_id);
alter table monitored_forms enable row level security;
drop policy if exists "org members" on monitored_forms;
create policy "org members" on monitored_forms
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

-- 5. form_checks — дропаємо стару незавершену і ребілдуємо
drop table if exists form_checks cascade;
create table form_checks (
  id                uuid primary key default gen_random_uuid(),
  monitored_form_id uuid not null references monitored_forms(id) on delete cascade,
  site_id           uuid not null references sites(id) on delete cascade,
  form_found        boolean not null,
  fields_count      integer,
  has_submit        boolean,
  checked_at        timestamptz not null default now()
);
create index idx_form_checks_form_date
  on form_checks(monitored_form_id, checked_at desc);
alter table form_checks enable row level security;
create policy "org members" on form_checks
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

-- 6. status_page columns на sites
alter table sites
  add column if not exists status_page_slug text,
  add column if not exists status_page_enabled boolean not null default false;

create unique index if not exists idx_sites_status_slug
  on sites(status_page_slug)
  where status_page_slug is not null;
