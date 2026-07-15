-- ============================================================
-- QORAX — Migration 0077: Qorax Browser — Collections (третя ітерація)
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Browser — окремий продукт екосистеми",
-- Collections: "вбивця закладок" — проєкт (наприклад "Інтернет-
-- магазин одягу") групує конкурентів/референси/статті/ідеї в
-- одному місці замість розрізнених закладок.
--
-- MVP-обсяг цієї ітерації (продовження списку з browserHandler.ts:
-- MVP AI Sidebar → Site Inspector → Collections): лише групування
-- вже наявної browser_history в іменовані проєкти + нотатка до
-- кожного збереженого сайту. Smart Capture (виділення конкретного
-- контенту сторінки — hero/текст/товар → відправка в Creator/Office/
-- Mail) — НЕ ця ітерація, залежить від готовності API прийому даних
-- в інших продуктах, наступний крок за списком.
--
-- Технічне рішення: browser_collections — окрема таблиця "проєктів",
-- browser_history отримує nullable collection_id (FK, on delete
-- set null — видалення колекції не видаляє саму історію відвідувань,
-- лише прибирає групування) + nullable note (коментар користувача
-- до збереженого сайту, тому polю немає сенсу бути в самій колекції).
-- НЕ нова таблиця "collection_items" — це означало б дублювання
-- url/title/ai_summary, які вже є в browser_history.
-- ============================================================

create table browser_collections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null default 'Без назви',
  description text,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table browser_collections is
  'Колекція (проєкт) Qorax Browser — групує записи browser_history, напр. "Інтернет-магазин одягу: конкуренти + референси". MODULE_ROADMAP.md, розділ "Qorax Browser", Collections.';

create index idx_browser_collections_organization on browser_collections(organization_id, created_at desc);

alter table browser_collections enable row level security;

create policy "browser_collections_all" on browser_collections
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

-- browser_history: додаємо групування по колекції + нотатку.
-- on delete set null (не cascade) — видалення колекції не повинно
-- видаляти саму історію відвідувань, лише розгруповувати її назад
-- у "без колекції" (той самий стан, що й до цієї міграції).

alter table browser_history add column if not exists collection_id uuid references browser_collections(id) on delete set null;
alter table browser_history add column if not exists note text;

comment on column browser_history.collection_id is 'Колекція (проєкт), до якої збережено цей запис. NULL — запис лише в загальній історії, не доданий до жодної колекції.';
comment on column browser_history.note is 'Нотатка користувача до збереженого сайту в межах колекції (напр. чому цей референс цікавий).';

create index idx_browser_history_collection on browser_history(collection_id) where collection_id is not null;

-- ============================================================
-- НАВМИСНО без реєстрації в platform_modules: той самий принцип, що
-- 0074/0075/0076 — Qorax Browser є окремим топ-левел продуктом
-- екосистеми, не модулем усередині Dashboard-сайдбару.
-- ============================================================
