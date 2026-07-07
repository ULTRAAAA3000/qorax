-- ============================================================
-- QORAX — Migration 0039: Platform foundation (projects + modules)
-- ============================================================
-- Контекст: Qorax перестаёт быть только monitoring-сервисом и
-- становится платформой с несколькими модулями (Audit, Sites-конструктор,
-- AI, Content, Rank, Analytics...). Эта миграция вводит архитектуру
-- ПОВЕРХ существующего кода, ничего не ломая:
--
-- 1) sites / uptime_checks / competitor_sites и весь текущий monitoring
--    НЕ ТРОГАЕМ. Это становится модулем "Qorax Audit" как есть.
--
-- 2) projects — новая сущность для будущих модулей, которые реально
--    создают/хостят контент (конструктор сайтов, в перспективе —
--    контент-план, AI-генерация целых страниц и т.д.). Это НЕ то же
--    самое, что sites: sites мониторит ЧУЖОЙ существующий сайт,
--    projects — это то, что создаёт и хостит сама платформа.
--    Пока конструктор не реализован, таблица просто существует
--    и ничем не используется — задел на будущее без риска для текущих
--    фич.
--
-- 3) platform_modules — реестр модулей платформы. Управляет тем, что
--    показывается в sidebar (см. dashboard layout) и что считается
--    "включённым" в принципе. status:
--      'live'         — модуль реально работает и виден всем
--      'coming_soon'  — виден в меню как анонс, но недоступен
--      'hidden'       — не показывается вообще (в разработке)
--
-- 4) organization_module_access — точечный оверрайд доступа к модулю
--    для конкретной организации (бета-тестеры, ранний доступ),
--    независимо от глобального platform_modules.status.
-- ============================================================

-- ------------------------------------------------------------
-- projects — центральная сущность для будущих продуктов платформы
-- ------------------------------------------------------------

create type project_status as enum ('draft', 'published', 'archived');

create table projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  -- домен, на котором будет опубликован проект (когда появится конструктор/деплой)
  domain text,
  status project_status not null default 'draft',
  -- свободная JSON-структура под будущие модули (SEO-настройки, контент,
  -- AI-метаданные и т.д.) — не проектируем заранее жёсткую схему того,
  -- чего ещё нет, чтобы не блокировать реальный дизайн конструктора позже
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table projects is
  'Центральная сущность будущих продуктов платформы (Qorax Sites, Content и т.д.). НЕ используется текущим monitoring-модулем — тот работает через таблицу sites как и раньше.';

create index idx_projects_organization on projects(organization_id);

create trigger trg_projects_updated_at
  before update on projects
  for each row execute function set_updated_at();

alter table projects enable row level security;

-- Доступ к проекту = быть участником организации, которой он принадлежит
create policy "projects_select_own_org" on projects
  for select using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

create policy "projects_insert_own_org" on projects
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "projects_update_own_org" on projects
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "projects_delete_own_org" on projects
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ------------------------------------------------------------
-- platform_modules — реестр модулей платформы (для sidebar/навигации)
-- ------------------------------------------------------------

create type module_status as enum ('live', 'coming_soon', 'hidden');

create table platform_modules (
  -- короткий slug, стабильный идентификатор модуля в коде (не меняется)
  key text primary key,
  label text not null,
  description text,
  -- иконка как строковый идентификатор (имя lucide-иконки), рендерится в коде
  icon text,
  -- путь в dashboard, куда ведёт пункт меню
  href text not null,
  status module_status not null default 'hidden',
  -- порядок отображения в sidebar
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table platform_modules is
  'Реестр модулей платформы для sidebar. status управляет видимостью: live = доступен всем, coming_soon = анонс в меню, hidden = не показывается.';

create trigger trg_platform_modules_updated_at
  before update on platform_modules
  for each row execute function set_updated_at();

-- Читать список модулей может любой авторизованный пользователь
-- (нужно для рендера sidebar), изменять — только через service role (админка)
alter table platform_modules enable row level security;

create policy "platform_modules_select_all" on platform_modules
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');

-- ------------------------------------------------------------
-- organization_module_access — точечный ранний доступ к модулю
-- ------------------------------------------------------------

create table organization_module_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  module_key text not null references platform_modules(key) on delete cascade,
  -- true = включить модуль этой организации, даже если он ещё coming_soon/hidden глобально
  -- false = явно выключить, даже если модуль live глобально (напр. заблокировать доступ)
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, module_key)
);

comment on table organization_module_access is
  'Точечный оверрайд доступа к модулю для конкретной организации (бета-тестеры, ранний доступ), независимо от глобального platform_modules.status.';

create index idx_org_module_access_org on organization_module_access(organization_id);

alter table organization_module_access enable row level security;

create policy "org_module_access_select_own_org" on organization_module_access
  for select using (
    organization_id in (
      select organization_id from organization_members where user_id = auth.uid()
    )
  );

-- ------------------------------------------------------------
-- Начальные данные: Audit — это текущий monitoring, уже live.
-- Остальные модули из product vision — видны в меню как "скоро".
-- ------------------------------------------------------------

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('audit',      'Audit',      'Моніторинг, SEO та Core Web Vitals аудит сайтів', 'ShieldCheck', '/dashboard',           'live',        10),
  ('sites',      'Sites',      'Конструктор сайтів з SEO-first підходом',          'Layout',      '/dashboard/sites-builder', 'coming_soon', 20),
  ('ai',         'AI',         'AI-асистент для тексту, SEO та контенту',          'Sparkles',    '/dashboard/ai',        'coming_soon', 30),
  ('content',    'Content',    'AI-генерація SEO-статей та контент-планів',        'FileText',    '/dashboard/content',   'coming_soon', 40),
  ('rank',       'Rank',       'Моніторинг позицій у пошуку',                      'TrendingUp',  '/dashboard/rank',      'coming_soon', 50),
  ('analytics',  'Analytics',  'Єдина аналітика: трафік, конверсії, CWV',          'BarChart3',   '/dashboard/analytics', 'coming_soon', 60)
on conflict (key) do nothing;
