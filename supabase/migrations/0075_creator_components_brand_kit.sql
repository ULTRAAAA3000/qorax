-- ============================================================
-- QORAX — Migration 0075: Qorax Creator — Components / Brand Kit
-- ============================================================
-- MODULE_ROADMAP.md, "Qorax Creator", "Порядок реалізації": Website
-- Mode → Diagram Mode → Live Objects (усі готові) → Components/
-- Brand Kit (ця міграція) → Smart Components → AI Creator → ...
--
-- Схема взята практично дослівно з плану (розділ "Components / Brand
-- Kit — перевикористання, не нова система дизайну") — план уже дав
-- готову структуру, це не нове проектування з нуля.
--
-- creator_components.content — той САМИЙ block-JSON формат, що
-- project_pages.content (0058_sites_builder.sql): один блок виду
-- { type, heading?, subheading?, body?, cta_text?, cta_href?,
-- image_url?, alt?, items? } — не масив блоків {blocks:[...]}, бо
-- компонент — це одна перевикористовувана одиниця, що вставляється
-- в чужу сторінку, не сторінка сама по собі. Той самий принцип, що
-- план описує явно: "один формат компонента, що працює однаково в
-- Website Mode, Email Mode, Presentation Mode" — якщо тут вигадати
-- новий формат, "компонент, що працює де завгодно" стане неправдою.
--
-- is_marketplace і organization_id nullable (системний компонент) —
-- з плану, СХЕМА готова під Marketplace одразу, але сам Marketplace
-- UI/логіка НЕ цей прохід (план явно відкладає Marketplace на пізніше
-- в тому самому розділі "Developer Mode, History, Multiplayer,
-- Marketplace").
-- ============================================================

create table creator_brand_kits (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  logo_url text,
  colors jsonb,          -- {"primary": "#...", "accent": "#..."} — бренд-кіт КЛІЄНТА Qorax, не плутати з DESIGN_SYSTEM.md (той — бренд-кіт самого продукту Qorax)
  fonts jsonb,
  tone_of_voice text,    -- майбутнє перевикористання Content Agent-ом (хвиля 1) при генерації текстів під бренд — інтеграція НЕ цей прохід, тільки поле для збереження
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id) -- один бренд-кіт на організацію в MVP (не кілька варіантів/версій)
);

comment on table creator_brand_kits is
  'Бренд-кіт клієнта Qorax (лого/кольори/шрифти/tone of voice) для Qorax Creator. Один на організацію в MVP.';

create table creator_components (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, -- null = системний/marketplace-компонент (МОЖЛИВІСТЬ схеми, сам Marketplace — не цей прохід)
  category text not null,   -- 'hero' | 'text' | 'image' | 'cta' | 'faq' | 'products' | ... (той самий набір, що BLOCK_TYPES у ProjectEditorUI.tsx — не новий список категорій)
  name text not null default 'Компонент',
  content jsonb not null,   -- той самий block-формат, що project_pages.content — один блок, не масив
  is_marketplace boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table creator_components is
  'Перевикористовувані блоки для Qorax Creator. content — той самий block-JSON формат, що project_pages.content (0058) — одна структура компонента працює однаково в Website/Email/Presentation Mode.';

create index idx_creator_components_org on creator_components(organization_id) where organization_id is not null;
create index idx_creator_components_category on creator_components(category);

alter table creator_brand_kits enable row level security;
alter table creator_components enable row level security;

-- Той самий organization-рівня патерн, що canvas_boards/ai_predictions —
-- будь-хто з organization_members бачить і редагує (MVP: немає
-- окремого розмежування viewer/editor для бренд-кіту й компонентів,
-- той самий рівень доступу, що Sites-конструктор сам по собі вимагає
-- для project_pages).
create policy "creator_brand_kits_all" on creator_brand_kits
  for all using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

-- Компоненти: organization-рівня для власних + системні
-- (organization_id is null) видимі ВСІМ автентифікованим
-- користувачам на select (майбутня бібліотека стартових
-- компонентів), але не на write — системні компоненти керуються
-- лише через is_platform_admin() (адмінська панель чи прямий SQL,
-- не звичайний UI організації).
create policy "creator_components_select" on creator_components
  for select using (
    organization_id is null
    or organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

create policy "creator_components_write" on creator_components
  for insert with check (
    organization_id in (select user_organization_ids())
  );

create policy "creator_components_update" on creator_components
  for update using (
    (organization_id is not null and organization_id in (select user_organization_ids()))
    or is_platform_admin()
  );

create policy "creator_components_delete" on creator_components
  for delete using (
    (organization_id is not null and organization_id in (select user_organization_ids()))
    or is_platform_admin()
  );
