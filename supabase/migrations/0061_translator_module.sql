-- 0061_translator_module.sql
-- Translator-модуль (MODULE_ROADMAP.md, розділ 5; EXECUTION_PLAN.md
-- Фаза 3.2). Пряме продовження Sites-конструктора (модуль 4,
-- 0058/0059) — розблокований щойно тому, бо MVP Translator має сенс
-- тільки для сторінок, створених у Sites-конструкторі.
--
-- ВІДХИЛЕННЯ ВІД ЧЕРНЕТКИ MODULE_ROADMAP.md (задокументоване явно,
-- не мовчки): чернетка Кроку 1 прив'язує обидві таблиці до site_id
-- (посилання на `sites`). Це суперечить вже РЕАЛІЗОВАНІЙ схемі
-- Sites-конструктора (0058_sites_builder.sql) і критичному правилу
-- PLATFORM.md/DATA_MODEL.md розділ 2.1: "sites" (моніторинг чужого
-- сайту) і "projects" (те, що хостить сам Qorax) — навмисно різні
-- сутності, ніколи не змішуються. Сторінки, які перекладає цей
-- модуль, живуть у `project_pages` (project_id), не в `sites`.
-- Тому обидві таблиці нижче посилаються на `projects.id`, НЕ на
-- `sites.id` — виправлення чернетки під реальну схему, не помилка.

-- ------------------------------------------------------------
-- project_languages — підключені мови проекту (перейменовано з
-- "site_languages" чернетки з тієї ж причини — project_id, не site_id)
-- ------------------------------------------------------------

create table project_languages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  locale text not null,              -- 'en', 'de', 'fr'...
  is_default boolean not null default false,
  url_prefix text,                   -- '/en', '/de' (null для дефолтної мови)
  created_at timestamptz not null default now(),
  unique (project_id, locale)
);

comment on table project_languages is 'Підключені мови Sites-проекту. project_id (не site_id, на відміну від чернетки MODULE_ROADMAP.md розділ 5) — узгоджено з реальною схемою Sites-конструктора, де сторінки належать projects, не sites.';

create index idx_project_languages_project on project_languages(project_id);

-- ------------------------------------------------------------
-- page_translations
-- ------------------------------------------------------------

create table page_translations (
  id uuid primary key default gen_random_uuid(),
  project_page_id uuid not null references project_pages(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  locale text not null,
  title text,
  description text,
  og_title text,
  og_description text,
  content jsonb,                     -- перекладені блоки (та сама структура, що project_pages.content)
  image_alt_overrides jsonb,          -- {"img_id": "перекладений alt"}
  status text not null default 'draft', -- draft | reviewed | published
  translated_by text not null default 'ai', -- ai | manual
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_page_id, locale),
  constraint page_translations_status_check check (status in ('draft', 'reviewed', 'published')),
  constraint page_translations_translated_by_check check (translated_by in ('ai', 'manual'))
);

comment on table page_translations is 'Переклади сторінок Sites-конструктора. project_page_id — NOT NULL (на відміну від nullable у чернетці MODULE_ROADMAP.md розділ 5) — MVP Translator існує ЛИШЕ для project_pages, переклад довільних зовнішніх сторінок поза MVP, тож послаблювати обмеження до nullable сенсу не було. project_id продубльовано з project_page_id для прямого RLS-приєднання без зайвого JOIN через project_pages на кожен запит.';

create index idx_page_translations_project on page_translations(project_id);
create index idx_page_translations_page on page_translations(project_page_id);

create trigger trg_page_translations_updated_at
  before update on page_translations
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Реєстрація в platform_modules — той самий патерн, що інші модулі.
-- href '/dashboard/translator' вільний (на відміну від 'sites', тут
-- не було наперед зарезервованого запису в 0039 — Translator не
-- входив у першу хвилю платформи).
-- ------------------------------------------------------------

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('translator', 'Translator', 'Мультимовність і SEO-адаптація для сторінок Sites', 'Languages', '/dashboard/translator', 'coming_soon', 110)
on conflict (key) do nothing;

-- ============================================================
-- RLS — за шаблоном project_pages_*_own_org з 0058 (приєднання через
-- project_id, той самий organization-рівня патерн)
-- ============================================================

alter table project_languages enable row level security;
alter table page_translations enable row level security;

create policy "project_languages_select_own_org" on project_languages
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "project_languages_insert_own_org" on project_languages
  for insert with check (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "project_languages_delete_own_org" on project_languages
  for delete using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );

create policy "page_translations_select_own_org" on page_translations
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "page_translations_insert_own_org" on page_translations
  for insert with check (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "page_translations_update_own_org" on page_translations
  for update using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "page_translations_delete_own_org" on page_translations
  for delete using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );
