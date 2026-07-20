-- ============================================================
-- QORAX — Migration 0081: Qorax Browser — Workspace Tabs
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Browser — окремий продукт екосистеми",
-- Workspace Tabs: "вкладки групуються в проєкти" — приклад з
-- документа: проєкт "Nike" містить 20 сайтів + 3 PDF + 2 Email + 5
-- документів в одному Workspace.
--
-- Реально: сайти вже групуються через browser_collections (0077,
-- Collections). Workspace Tabs у цій ітерації розширює ту саму
-- концепцію на ЩЕ ОДИН тип контенту — документи Qorax Office
-- (office_documents), єдиний реалістично доступний "інший тип
-- вмісту" на цей момент (Mail лише отримав CRM-контакти, не
-- "листи як об'єкти для збереження"; Creator дошки — окремий
-- продукт, не документ у сенсі цього роадмап-пункту).
--
-- Технічне рішення: ОКРЕМА зв'язуюча таблиця
-- browser_collection_items (many-to-many), НЕ додавання
-- collection_id напряму в office_documents — це створило б зворотну
-- залежність Office → Browser (Office не повинен знати про
-- існування Browser), тоді як зв'язуюча таблиця живе в просторі
-- Browser і посилається на office_documents ззовні, зберігаючи
-- односторонню залежність (той самий принцип розділення продуктів
-- екосистеми, що вже застосований в PRODUCT_VISION.md).
-- ============================================================

create table browser_collection_items (
  id uuid primary key default gen_random_uuid(),
  collection_id uuid not null references browser_collections(id) on delete cascade,
  item_type text not null default 'office_document' check (item_type in ('office_document')),
  office_document_id uuid references office_documents(id) on delete cascade,
  added_by uuid references profiles(id) on delete set null,
  added_at timestamptz not null default now(),
  -- item_type='office_document' вимагає заповненого office_document_id.
  -- Єдиний варіант item_type зараз, але перевірка одразу закладена
  -- як розширювана конструкція (майбутні типи — PDF/Email — додадуть
  -- власні nullable-колонки за тим самим принципом, не новий CHECK).
  constraint browser_collection_items_office_document_check
    check (item_type != 'office_document' or office_document_id is not null)
);

comment on table browser_collection_items is
  'Зв''язок колекції Browser (browser_collections) з елементами інших продуктів екосистеми — Workspace Tabs (MODULE_ROADMAP.md, "Qorax Browser"). Зараз лише office_documents; сайти лишаються в browser_history.collection_id (0077), не дублюються тут.';

create index idx_browser_collection_items_collection on browser_collection_items(collection_id);
create index idx_browser_collection_items_office_document on browser_collection_items(office_document_id) where office_document_id is not null;

alter table browser_collection_items enable row level security;

-- RLS через JOIN на browser_collections (яка вже має organization_id) —
-- той самий підхід, що інші зв'язуючі таблиці платформи (напр.
-- product_categories для Commerce).
create policy "browser_collection_items_all" on browser_collection_items
  for all using (
    collection_id in (
      select id from browser_collections
      where organization_id in (select user_organization_ids()) or is_platform_admin()
    )
  );
