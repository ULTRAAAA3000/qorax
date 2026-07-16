-- ============================================================
-- QORAX — Migration 0075: Qorax Office — office_slides (MVP Slides)
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Office" — пункт MVP-списку "презентації".
-- Найдешевший можливий шлях: КОЖЕН слайд — той самий block-формат,
-- що вже є в office_documents.content (0072) — paragraph/heading/
-- bullet_list/checklist. Презентація технічно "масив документів",
-- не новий формат контенту — переюзаний блочний редактор Docs,
-- обгорнутий у пагінацію по слайдах замість суцільного скролу.
--
-- НЕ входить у цю міграцію (майбутні ітерації): зображення на
-- слайдах, переходи/анімації, кастомні макети (два стовпці,
-- діаграми), Brand Kit-стилізація з довгострокового бачення
-- Creator, .pptx експорт.
-- ============================================================

create table office_slides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Без назви',
  -- slides — масив {id, blocks: [...]}, кожен елемент = один слайд,
  -- blocks — той самий тип блоків, що office_documents.content.blocks.
  slides jsonb not null default '[{"id":"s1","blocks":[]}]'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table office_slides is
  'Презентація Qorax Office Slides (MVP). slides — масив слайдів, кожен зі своїм blocks у тому самому форматі, що office_documents.content.blocks (0072). MODULE_ROADMAP.md, розділ "Qorax Office".';

create index idx_office_slides_organization on office_slides(organization_id, updated_at desc);

alter table office_slides enable row level security;

-- Той самий organization-рівня патерн, що office_documents (0072) і
-- office_sheets (0074).
create policy "office_slides_all" on office_slides
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );
