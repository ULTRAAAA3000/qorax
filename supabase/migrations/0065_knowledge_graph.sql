-- ============================================================
-- QORAX — Migration 0065: Knowledge Graph
-- ============================================================
-- MODULE_ROADMAP.md, "Четверта хвиля (довгострокове бачення)",
-- розділ 14 "Knowledge Graph". Перший шматок хвилі 4, що йде в
-- код — фундамент, без якого AI Chat (хвиля 3) знає тільки сирі
-- дані окремих модулів, а не зв'язки між ними.
--
-- Generic-модель (kg_nodes/kg_edges), а не окрема таблиця під
-- кожен тип зв'язку — навмисно: вузол графа може вказувати на
-- сторінку з Sites (project_pages), товар з Commerce, ліда з CRM,
-- ключове слово з Rank — таблиці різні, графу потрібен один
-- спільний тип вузла. ref_table/ref_id — "м'який" зв'язок (не
-- foreign key на конкретну таблицю), той самий підхід, що вже
-- використаний для activity_feed.target_type/target_id в описі
-- хвилі 4 (Team Workspace) — жодна нова конвенція для платформи.
-- ============================================================

create table kg_nodes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  node_type text not null,   -- 'service' | 'category' | 'page' | 'product' |
                              -- 'customer' | 'competitor' | 'keyword' | 'article' | 'lead'
  ref_table text,             -- 'project_pages' | 'crm_contacts' | 'rank_tracked_queries' | ...
  ref_id uuid,                -- id рядка в ref_table, якщо вузол відповідає реальному запису
  label text not null,
  created_at timestamptz not null default now()
);

comment on table kg_nodes is
  'Знайомі AI сутності бізнесу клієнта (сторінки, товари, ліди, ключові слова...) — вузли графа зв''язків. ref_table/ref_id — м''який зв''язок на реальний запис у відповідній таблиці модуля, node_type — тип для фільтрації при побудові контексту чату. MODULE_ROADMAP.md розділ 14.';

create index idx_kg_nodes_organization on kg_nodes(organization_id);
create index idx_kg_nodes_ref on kg_nodes(ref_table, ref_id) where ref_table is not null and ref_id is not null;
-- Один вузол графа на реальний запис — upsertNode() покладається на цей unique
-- constraint для ідемпотентності (повторний виклик при оновленні запису не
-- створює дубль вузла, тільки оновлює label).
create unique index idx_kg_nodes_unique_ref on kg_nodes(organization_id, ref_table, ref_id) where ref_table is not null and ref_id is not null;

create table kg_edges (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  from_node_id uuid not null references kg_nodes(id) on delete cascade,
  to_node_id uuid not null references kg_nodes(id) on delete cascade,
  relation text not null,     -- 'related_to' | 'targets_keyword' | 'mentions' | 'competes_with'
  weight real not null default 1.0, -- сила зв'язку, для майбутнього ранжування контексту
  created_at timestamptz not null default now(),
  unique (from_node_id, to_node_id, relation)
);

comment on table kg_edges is
  'Зв''язки між вузлами Knowledge Graph. MODULE_ROADMAP.md розділ 14.';

create index kg_edges_from_idx on kg_edges(from_node_id);
create index kg_edges_to_idx on kg_edges(to_node_id);
create index idx_kg_edges_organization on kg_edges(organization_id);

alter table kg_nodes enable row level security;
alter table kg_edges enable row level security;

-- Доступ — той самий патерн organization-рівня, що вже використаний
-- для crm_contacts/agents (перевірка через user_organization_ids()).
-- Запис у ці таблиці робить виключно worker (service role, обходить
-- RLS) — insert/delete-політики нижче на випадок майбутнього прямого
-- клієнтського доступу (напр. якщо колись з'явиться візуалізація
-- графа, що читає напряму через supabase-js), не для поточного шляху.

create policy "kg_nodes_select" on kg_nodes
  for select using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

create policy "kg_nodes_insert" on kg_nodes
  for insert with check (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );

create policy "kg_nodes_delete" on kg_nodes
  for delete using (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
    or is_platform_admin()
  );

create policy "kg_edges_select" on kg_edges
  for select using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

create policy "kg_edges_insert" on kg_edges
  for insert with check (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );

create policy "kg_edges_delete" on kg_edges
  for delete using (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
    or is_platform_admin()
  );
