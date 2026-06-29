-- ============================================================
-- QORAX — Migration 0026: snapshot diff + multi-URL + forms
-- ============================================================

-- 1. Додаємо old_snapshot / new_snapshot у competitor_changes
--    щоб показувати реальний diff у дашборді
alter table competitor_changes
  add column if not exists old_snapshot text,
  add column if not exists new_snapshot text;

-- 2. Таблиця для моніторингу конкретних URL сайту (multi-URL speed)
create table if not exists monitored_urls (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  url         text not null,
  label       text,                   -- напр. "Кошик", "Контакти"
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique(site_id, url)
);

create index if not exists idx_monitored_urls_site on monitored_urls(site_id);

alter table monitored_urls enable row level security;
create policy "org members" on monitored_urls
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

-- 3. Speed checks для конкретних URL (окремо від головної)
create table if not exists url_speed_checks (
  id              uuid primary key default gen_random_uuid(),
  monitored_url_id uuid not null references monitored_urls(id) on delete cascade,
  site_id         uuid not null references sites(id) on delete cascade,
  load_time_ms    integer,
  status_code     integer,
  checked_at      timestamptz not null default now()
);

create index if not exists idx_url_speed_checks_url_date
  on url_speed_checks(monitored_url_id, checked_at desc);

alter table url_speed_checks enable row level security;
create policy "org members" on url_speed_checks
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

-- 4. Form monitoring
create table if not exists monitored_forms (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references sites(id) on delete cascade,
  page_url      text not null,
  form_selector text,               -- CSS selector або null (перша форма)
  label         text,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique(site_id, page_url)
);

create index if not exists idx_monitored_forms_site on monitored_forms(site_id);

alter table monitored_forms enable row level security;
create policy "org members" on monitored_forms
  using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid()
    )
  );

create table if not exists form_checks (
  id               uuid primary key default gen_random_uuid(),
  monitored_form_id uuid not null references monitored_forms(id) on delete cascade,
  site_id          uuid not null references sites(id) on delete cascade,
  form_found       boolean not null,
  fields_count     integer,
  has_submit       boolean,
  checked_at       timestamptz not null default now()
);

create index if not exists idx_form_checks_form_date
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

comment on table monitored_urls is 'Додаткові URL сайту для моніторингу швидкості (не тільки головна)';
comment on table url_speed_checks is 'Результати перевірок швидкості для конкретних URL';
comment on table monitored_forms is 'Форми на сайті клієнта для моніторингу доступності';
comment on table form_checks is 'Результати перевірок наявності та стану форм';
