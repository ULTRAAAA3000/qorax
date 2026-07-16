-- ============================================================
-- QORAX — Migration 0076: Qorax Office — office_sheets (MVP Sheets)
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Office" — пункт MVP-списку "прості
-- таблиці". Свідомо вузький перший крок: sparse-сховище клітинок
-- у нотації A1 (той самий принцип запису рідких даних, що вже
-- прийнятий для kg_edges/canvas_nodes — не резервувати місце під
-- порожні клітинки), прості формули (SUM/AVERAGE/COUNT) рахуються
-- на клієнті при рендерингу, не зберігаються обчисленими.
--
-- НЕ входить у цю міграцію (майбутні ітерації): діаграми, Dashboard,
-- форматування клітинок, кілька вкладок в одному файлі, .xlsx
-- імпорт/експорт (CSV — так, той самий рівень, що вже прийнятий як
-- "не намагатись одразу замінити Excel повністю", той самий принцип,
-- що і для Docs vs Word).
-- ============================================================

create table office_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Без назви',
  -- data.cells — sparse-мапа "A1"/"B12" -> рядкове значення (число чи
  -- формула зберігаються як текст, обчислення — на клієнті). columns/
  -- rows — розмір видимої сітки (фіксований для MVP, "додати рядок/
  -- колонку" розширює це число, не окрема функція БД).
  data jsonb not null default '{"columns": 12, "rows": 30, "cells": {}}'::jsonb,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table office_sheets is
  'Таблиця Qorax Office Sheets (MVP). data.cells — sparse-мапа A1-нотація -> текст/число/формула. MODULE_ROADMAP.md, розділ "Qorax Office".';

create index idx_office_sheets_organization on office_sheets(organization_id, updated_at desc);

alter table office_sheets enable row level security;

-- Той самий organization-рівня патерн, що office_documents (0072).
create policy "office_sheets_all" on office_sheets
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );
