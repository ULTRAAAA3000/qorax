-- 0058_sites_builder.sql
-- Sites-конструктор (MODULE_ROADMAP.md, розділ 4; PLATFORM.md;
-- DATA_MODEL.md розділ 2.1; EXECUTION_PLAN.md Фаза 3.1). Артем
-- прийняв рішення робити його ПІСЛЯ хвилі 2 (CRM/Social/Academy/CRO)
-- і паралельно з хвилею 3 (Qorax AI хаб, окрема лінія розробки
-- Артема). Розблоковує Commerce і Translator.
--
-- КРИТИЧНЕ ПРАВИЛО з PLATFORM.md, яке ця міграція СВІДОМО дотримується:
-- "sites" (моніторинг чужого сайту, міграція 0003) і "projects" (те,
-- що хостить сам Qorax, міграція 0039) — навмисно різні сутності,
-- ніколи не змішувати. project_pages посилається на projects.id,
-- НЕ на sites.id. Один organization може мати одночасно sites-записи
-- (моніторинг) і projects-записи (конструктор) — не пов'язані одне з
-- одним технічно (DATA_MODEL.md розділ 2.1).
--
-- Таблиця projects (з полями domain, status, settings) і повний RLS
-- (select/insert/update/delete) вже існують з міграції 0039 — ця
-- міграція їх НЕ чіпає, тільки додає project_pages/project_templates
-- зверху, точно за MODULE_ROADMAP.md розділ 4 Крок 1.

-- ------------------------------------------------------------
-- project_pages — сторінки всередині проекту (блочний контент)
-- ------------------------------------------------------------

create table project_pages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  slug text not null,
  content jsonb not null default '{"blocks":[]}'::jsonb,
  seo_title text,
  seo_description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);

comment on table project_pages is 'Сторінки Sites-конструктора. content jsonb — блоки (hero/text/image/cta/faq), той самий підхід "content jsonb з blocks", що вже використаний в academy_lessons.content (0046) — узгоджений формат для будь-якого блочного контенту в проєкті, не новий винахід під кожен модуль.';

create index idx_project_pages_project on project_pages(project_id);

create trigger trg_project_pages_updated_at
  before update on project_pages
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- project_templates — каталог шаблонів для старту нового проекту
-- ------------------------------------------------------------

create table project_templates (
  id text primary key,
  name text not null,
  description text,
  preview_image_url text,
  default_pages jsonb not null,
  sort_order integer not null default 0
);

comment on table project_templates is 'Каталог шаблонів. id — текстовий slug (напр. "landing-basic"), не uuid — навмисно людський ідентифікатор, бо рядки вставляються вручну через SQL/seed, не через публічний API (той самий підхід, що academy_courses — контент наповнюється вручну).';

-- ------------------------------------------------------------
-- Реєстрація sites у platform_modules УЖЕ існує з 0039
-- ('/dashboard/sites-builder', coming_soon, sort_order 20) — ця
-- міграція її НЕ чіпає. Артем переведе в 'live' вручну через
-- /dashboard/admin, той самий процес, що для CRM/Social/Academy/CRO.
-- ------------------------------------------------------------

-- ============================================================
-- RLS — за шаблоном projects_*_own_org з 0039 (той самий organization-
-- рівня патерн, тільки приєднання через project_id замість прямого
-- organization_id — project_pages не має власного organization_id,
-- як cro_snippets не мав власного organization_id відносно sites)
-- ============================================================

alter table project_pages enable row level security;
alter table project_templates enable row level security;

create policy "project_pages_select_own_org" on project_pages
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "project_pages_insert_own_org" on project_pages
  for insert with check (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "project_pages_update_own_org" on project_pages
  for update using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "project_pages_delete_own_org" on project_pages
  for delete using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );

-- project_templates: каталог, select відкритий усім автентифікованим
-- (той самий підхід, що academy_courses — публічний каталог, не
-- приватні дані організації). INSERT/UPDATE/DELETE — тільки service
-- role (наповнення шаблонами вручну, немає публічного API створення
-- шаблону в MVP).

create policy "project_templates_select_authenticated" on project_templates
  for select using (auth.uid() is not null);
