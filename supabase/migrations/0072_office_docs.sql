-- ============================================================
-- QORAX — Migration 0072: Qorax Office — office_documents (MVP Docs)
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Office — окремий продукт екосистеми".
-- З явного пріоритету MVP самого Артема ("зручний редактор
-- документів" — перший пункт, "AI, що реально економить час" —
-- другий): починаємо з Docs, не Sheets/Slides/Whiteboard/PDF
-- Studio/Templates — ті лишаються майбутніми ітераціями.
--
-- content jsonb — той самий підхід "{blocks: [...]}", що вже
-- прийнятий по всій платформі для будь-якого блочного контенту
-- (project_pages 0058, academy_lessons 0046) — не новий формат під
-- Office. Блоки MVP: paragraph/heading/bullet_list/checklist —
-- свідомо вузький набір (немає таблиць/зображень/код-блоків/формул
-- зі списку Smart Blocks у плані) — розширення блоків не потребує
-- зміни схеми, лише коду рендерера.
-- ============================================================

create table office_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Без назви',
  content jsonb not null default '{"blocks":[]}'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table office_documents is
  'Документ Qorax Office (MVP Docs mode). content jsonb "{blocks:[...]}" — той самий формат, що project_pages.content/academy_lessons.content. MODULE_ROADMAP.md, розділ "Qorax Office".';

create index idx_office_documents_organization on office_documents(organization_id, updated_at desc);

alter table office_documents enable row level security;

-- Той самий organization-рівня патерн, що canvas_boards (0071) —
-- без розрізнення viewer/editor на MVP-етапі (той самий рівень
-- доступу, що Creator сам вимагає для дощок).
create policy "office_documents_all" on office_documents
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

-- ============================================================
-- НАВМИСНО без реєстрації в platform_modules: той самий принцип, що
-- canvas_boards (0071) — Qorax Office є окремим топ-левел продуктом
-- екосистеми (/office), не модулем усередині Dashboard-сайдбару.
-- ============================================================
