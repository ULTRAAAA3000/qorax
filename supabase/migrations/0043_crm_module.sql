-- 0043_crm_module.sql
-- CRM-модуль (MODULE_ROADMAP.md, розділ 7 "друга хвиля"; EXECUTION_PLAN.md
-- Фаза 2.3). Обрано ПЕРШИМ модулем другої хвилі замість Translator —
-- Translator технічно залежить від project_pages, якої не існує
-- (DATA_MODEL.md, Sites-конструктор ще не реалізований по факту,
-- EXECUTION_PLAN.md Фаза 1). CRM — organization-рівня модуль
-- (DATA_MODEL.md розділ 2.1), не залежить від sites/projects жорстко.
--
-- ВАЖЛИВЕ УТОЧНЕННЯ відносно початкового опису в MODULE_ROADMAP.md:
-- "авто-створення crm_contacts при сабміті форми на сайті клієнта"
-- НЕ реалізовано в цій міграції. Перевірено: monitored_forms/
-- form_checks — це тільки конфігурація МОНІТОРИНГУ форми (бот
-- заповнює тестовими даними, перевіряє що лист дійшов) — там немає
-- жодних реальних даних відвідувачів сайту (ім'я/email реального
-- ліда). Автоматичний прийом реальних заявок з форм клієнта вимагає
-- окремого механізму (форма на сайті клієнта повинна кудись
-- надсилати POST — окремий публічний ендпоінт-приймач, якого зараз
-- немає) — це самостійна майбутня задача, не проста інтеграція з
-- наявним form-моніторингом, як спочатку здавалося в roadmap. MVP
-- цієї міграції: ручне управління контактами/угодами. source
-- лишається текстовим полем з майбутнім значенням 'site_form', щоб
-- не міняти схему, коли той механізм з'явиться.

-- ------------------------------------------------------------
-- crm_contacts
-- ------------------------------------------------------------

create table crm_contacts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  name text,
  email text,
  phone text,
  source text not null default 'manual', -- 'manual' | 'import' | 'site_form' (майбутнє, див. коментар вище)
  site_id uuid references sites(id) on delete set null, -- який сайт клієнта — джерело ліда, якщо відомо
  created_at timestamptz not null default now()
);

comment on table crm_contacts is 'Контакти CRM. source=site_form зарезервовано на майбутнє (окремий приймач заявок з форм сайту клієнта — не реалізовано, див. коментар на початку файлу).';

create index idx_crm_contacts_organization on crm_contacts(organization_id);
create index idx_crm_contacts_site on crm_contacts(site_id) where site_id is not null;

-- ------------------------------------------------------------
-- crm_deals
-- ------------------------------------------------------------

create table crm_deals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete set null,
  title text not null,
  stage text not null default 'new', -- new | contacted | qualified | won | lost
  value_cents integer,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table crm_deals is 'Угоди CRM — канбан-воронка (stage). value_cents/currency — орієнтовна сума угоди, не пов`язана з реальним білінгом Qorax (LemonSqueezy) — це гроші КЛІЄНТА Qorax від ЙОГО клієнта, суто інформаційне поле.';

create index idx_crm_deals_organization on crm_deals(organization_id);
create index idx_crm_deals_contact on crm_deals(contact_id) where contact_id is not null;

create trigger trg_crm_deals_updated_at
  before update on crm_deals
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- crm_notes
-- ------------------------------------------------------------

create table crm_notes (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id) on delete cascade,
  contact_id uuid references crm_contacts(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint crm_notes_exactly_one_parent check (
    (deal_id is not null and contact_id is null) or
    (deal_id is null and contact_id is not null)
  )
);

comment on table crm_notes is 'Нотатки — рівно одне з deal_id/contact_id заповнено (перевірено CHECK-обмеженням, а не тільки на рівні застосунку, як спочатку планувалось у MODULE_ROADMAP.md — Postgres дозволяє це зробити надійніше).';

create index idx_crm_notes_deal on crm_notes(deal_id) where deal_id is not null;
create index idx_crm_notes_contact on crm_notes(contact_id) where contact_id is not null;

-- ------------------------------------------------------------
-- crm_reminders
-- ------------------------------------------------------------

create table crm_reminders (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references crm_deals(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  remind_at timestamptz not null,
  message text not null,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table crm_reminders is 'Нагадування по угодах. organization_id продубльовано з deal_id навмисно (не тільки через JOIN) — спрощує RLS-політику і cron-запит run-crm-reminders (не треба JOIN crm_deals лише щоб дізнатись організацію).';

create index idx_crm_reminders_due on crm_reminders(remind_at) where is_done = false;
create index idx_crm_reminders_organization on crm_reminders(organization_id);

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4 (пишеться одразу зі схемою,
-- не окремим проходом — EXECUTION_PLAN.md Фаза 2, крок 1.5)
-- ============================================================

alter table crm_contacts enable row level security;
alter table crm_deals enable row level security;
alter table crm_notes enable row level security;
alter table crm_reminders enable row level security;

-- crm_contacts: select — будь-хто в організації; insert/update — editor+; delete — admin+

create policy "crm_contacts_select_own_org" on crm_contacts
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "crm_contacts_insert_own_org" on crm_contacts
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "crm_contacts_update_own_org" on crm_contacts
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "crm_contacts_delete_own_org" on crm_contacts
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- crm_deals: той самий шаблон

create policy "crm_deals_select_own_org" on crm_deals
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "crm_deals_insert_own_org" on crm_deals
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "crm_deals_update_own_org" on crm_deals
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "crm_deals_delete_own_org" on crm_deals
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- crm_notes: транзитивно через deal_id АБО contact_id (рівно одне заповнене)

create policy "crm_notes_select_own_org" on crm_notes
  for select using (
    is_platform_admin() or
    (deal_id in (select id from crm_deals where organization_id in (select user_organization_ids()))) or
    (contact_id in (select id from crm_contacts where organization_id in (select user_organization_ids())))
  );

create policy "crm_notes_insert_own_org" on crm_notes
  for insert with check (
    (deal_id in (
      select d.id from crm_deals d
      join organization_members om on om.organization_id = d.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )) or
    (contact_id in (
      select c.id from crm_contacts c
      join organization_members om on om.organization_id = c.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    ))
  );

-- Нотатки не редагуються і не видаляються через API в MVP (історія
-- має лишатись незмінною) — тому немає update/delete policy;
-- за замовчуванням RLS без policy на дію = дія заборонена для всіх
-- окрім service role (Worker), що й потрібно.

-- crm_reminders: organization_id напряму, той самий шаблон, що contacts/deals

create policy "crm_reminders_select_own_org" on crm_reminders
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "crm_reminders_insert_own_org" on crm_reminders
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "crm_reminders_update_own_org" on crm_reminders
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "crm_reminders_delete_own_org" on crm_reminders
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );
