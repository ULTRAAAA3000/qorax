-- ============================================================
-- QORAX — Migration 0071: Qorax Creator — canvas_boards, canvas_nodes
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Creator — візуальна платформа створення"
-- (розділ поза чергою хвиль). Перший шматок, що йде в код — MVP
-- Website Mode (порядок реалізації з плану: Website Mode → KG
-- Visualization → Live Objects → Components/Brand Kit → Smart
-- Components → AI Creator → ... → Multiplayer/Marketplace останніми).
--
-- Ця міграція НАВМИСНО не включає:
-- - canvas_edges — Website Mode не потребує зв'язків між вузлами
--   (одна дошка = одна вбудована сторінка Sites-редактора). Edges
--   стають потрібні з Diagram Mode (KG Visualization) — наступний
--   крок за планом, не цей.
-- - bound_ref_table/bound_ref_id/field_bindings (Smart Components) —
--   явно описано в плані як окрема, пізніша ітерація ("генуїнно
--   нова ідея, не перевикористання"), не MVP Website Mode.
-- - creator_components/creator_brand_kits — залежать від AI Creator
--   і Components-бібліотеки, обидва пізніші кроки за планом.
--
-- node_type='embedded_editor' — єдиний тип вузла, потрібний для
-- Website Mode: показує вже існуючий Sites-редактор
-- (project_pages) у рамці на canvas, не новий редактор. ref_table/
-- ref_id — та сама м'яка прив'язка, що вже прийнята для
-- kg_nodes (0065) — тут вказує на projects.id, коли
-- node_type='embedded_editor'.
-- ============================================================

create table canvas_boards (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Без назви',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table canvas_boards is
  'Дошка Qorax Creator — одне полотно з набором canvas_nodes. MVP: Website Mode, один embedded_editor вузол на дошку, але схема не обмежує кількість вузлів на майбутнє (Diagram/Presentation/інші режими додадуть більше node_type без зміни цієї таблиці).';

create index idx_canvas_boards_organization on canvas_boards(organization_id);

create table canvas_nodes (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references canvas_boards(id) on delete cascade,
  node_type text not null,      -- 'embedded_editor' (MVP) | 'text' | 'shape' | 'component' | 'live_embed' | ... (майбутні режими)
  position_x real not null default 0,
  position_y real not null default 0,
  width real not null default 480,
  height real not null default 360,
  data jsonb not null default '{}'::jsonb, -- довільні дані вузла, специфічні для node_type (для embedded_editor — не потрібно, project_id читається з ref_id)
  ref_table text,                -- 'projects' для embedded_editor (Sites-конструктор), null для типів без прив'язки до реального запису
  ref_id uuid,                   -- id рядка в ref_table
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table canvas_nodes is
  'Вузол на дошці Creator. ref_table/ref_id — м''яка прив''язка до реального запису платформи (той самий підхід, що kg_nodes.ref_table/ref_id, 0065) — для embedded_editor вказує на projects(id), Sites-редактор рендериться в рамці за цим project_id, не копіюється чи не переписується.';

create index idx_canvas_nodes_board on canvas_nodes(board_id);
create index idx_canvas_nodes_ref on canvas_nodes(ref_table, ref_id) where ref_table is not null and ref_id is not null;

alter table canvas_boards enable row level security;
alter table canvas_nodes enable row level security;

-- Той самий organization-рівня патерн, що вже використаний по всій
-- платформі (kg_nodes 0065, ai_predictions 0066) — select/insert/
-- update/delete для будь-кого з organization_members, без розрізнення
-- viewer/editor на цьому етапі (MVP: якщо бачиш дошку — можеш її
-- редагувати, той самий рівень доступу, що Sites-конструктор сам по
-- собі вимагає для project_pages).
create policy "canvas_boards_all" on canvas_boards
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

create policy "canvas_nodes_all" on canvas_nodes
  for all using (
    board_id in (
      select id from canvas_boards
      where organization_id in (select user_organization_ids())
    )
    or is_platform_admin()
  );

-- ============================================================
-- НАВМИСНО без реєстрації в platform_modules: Qorax Creator —
-- окремий топ-левел продукт екосистеми (/creator), той самий рівень,
-- що сам Dashboard і майбутній Mail, НЕ модуль у Dashboard-сайдбарі
-- серед CRM/Commerce/Team Workspace. platform_modules — реєстр саме
-- для плиток усередині Dashboard-каркасу (getPlatformModules.ts,
-- PlatformSidebar), Creator туди свідомо не додається.
-- ============================================================
