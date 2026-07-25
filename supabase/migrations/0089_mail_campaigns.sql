-- 0089_mail_campaigns.sql
-- Qorax Mail — Шар 2: Маркетинг (Campaigns / Automations / Templates)
-- (MODULE_ROADMAP.md, "Qorax Mail — окремий продукт екосистеми").
--
-- ПРИМІТКА: цю міграцію довелось писати ДВІЧІ — перша версія
-- (запланована як 0080) була втрачена разом з усією незакомміченою
-- робочою копією через скидання sandbox-контейнера під час сесії.
-- Урок з цього: комітити частіше, не тримати велику незакоммічену
-- роботу довго, особливо між написанням схеми і Worker-логіки.
--
-- Ключове перевикористання (за задумом документа):
-- - Отримувачі кампаній — ті самі crm_contacts, що Шар 1 (не нова
--   mail_contacts таблиця)
-- - mail_templates.content — той самий block-based jsonb формат, що
--   project_pages (Sites) і academy_lessons
-- - Черга відкладеної відправки — той самий патерн, що вже є в
--   socialHandler.ts (scheduled_at <= now(), перевіряється через
--   cron) — окремого файлу emailQueue.ts не існує в кодовій базі
--   (перевірено раніше — документ посилався на нього як на
--   концепцію, не реальний файл)

create table mail_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade, -- null = системний шаблон (майбутнє marketplace, Шар 4 — не заповнюється цим проходом)
  name text not null,
  category text not null, -- 'commercial' | 'invoice' | 'support' | 'onboarding' | 'custom'
  content jsonb not null default '{"blocks":[]}'::jsonb,
  is_marketplace boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint mail_templates_category_check check (category in ('commercial', 'invoice', 'support', 'onboarding', 'custom'))
);

comment on table mail_templates is 'Шаблони листів. content — той самий block-based jsonb формат, що project_pages (Sites-конструктор): {blocks:[{type,...}]}. organization_id NULL зарезервовано під майбутній marketplace (Шар 4), не заповнюється цим проходом.';

create index idx_mail_templates_org on mail_templates(organization_id) where organization_id is not null;

create trigger trg_mail_templates_updated_at
  before update on mail_templates
  for each row execute function set_updated_at();

create table mail_campaigns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  name text not null,
  template_id uuid references mail_templates(id) on delete set null,
  subject text not null,
  segment_filter jsonb, -- критерій вибірки з crm_contacts — MVP: null = усі контакти організації
  status text not null default 'draft', -- draft | scheduled | sending | sent
  scheduled_at timestamptz,
  created_at timestamptz not null default now(),
  constraint mail_campaigns_status_check check (status in ('draft', 'scheduled', 'sending', 'sent'))
);

comment on table mail_campaigns is 'Email-кампанії (розсилки). mail_account_id — з якої скриньки відправляти (той самий Gmail-акаунт, що Inbox у Шарі 1, не окрема SMTP-інфраструктура для маркетингу).';

create index idx_mail_campaigns_org on mail_campaigns(organization_id, created_at desc);
create index idx_mail_campaigns_due on mail_campaigns(scheduled_at) where status = 'scheduled';

create table mail_campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references mail_campaigns(id) on delete cascade,
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  sent_at timestamptz,
  opened_at timestamptz,   -- заділ на майбутнє (tracking pixel) — не MVP цього проходу
  clicked_at timestamptz,  -- заділ на майбутнє (link tracking) — не MVP цього проходу
  unsubscribed_at timestamptz,
  bounced boolean not null default false,
  error_message text,
  unique (campaign_id, contact_id)
);

comment on table mail_campaign_sends is 'Один рядок на отримувача кампанії. opened_at/clicked_at — поля-заділи, MVP не реалізує tracking pixel/link rewriting.';

create index idx_mail_campaign_sends_campaign on mail_campaign_sends(campaign_id);
create index idx_mail_campaign_sends_pending on mail_campaign_sends(campaign_id) where sent_at is null;

create table mail_automations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  name text not null,
  trigger_event text not null, -- 'new_contact' зараз; 'no_reply_5d' | 'deal_won' — майбутні тригери
  steps jsonb not null, -- [{delay_days: 0, template_id: "..."}, ...]
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint mail_automations_trigger_check check (trigger_event in ('new_contact', 'no_reply_5d', 'deal_won'))
);

comment on table mail_automations is 'Автоматичні серії листів за подією. MVP реалізує тільки trigger_event=new_contact (спрацьовує при появі нового crm_contacts). no_reply_5d/deal_won — схема готова, обробники — наступна ітерація.';

create index idx_mail_automations_org on mail_automations(organization_id) where is_active = true;

create table mail_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null references mail_automations(id) on delete cascade,
  contact_id uuid not null references crm_contacts(id) on delete cascade,
  current_step integer not null default 0,
  next_send_at timestamptz not null,
  completed_at timestamptz,
  unique (automation_id, contact_id)
);

comment on table mail_automation_runs is 'Стан проходження одного контакту через кроки автоматизації — один запис = один контакт у одній серії.';

create index idx_mail_automation_runs_due on mail_automation_runs(next_send_at) where completed_at is null;

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4
-- ============================================================

alter table mail_templates enable row level security;
alter table mail_campaigns enable row level security;
alter table mail_campaign_sends enable row level security;
alter table mail_automations enable row level security;
alter table mail_automation_runs enable row level security;

create policy "mail_templates_select_own_org" on mail_templates
  for select using (
    organization_id is null or
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "mail_templates_insert_own_org" on mail_templates
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_templates_update_own_org" on mail_templates
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_templates_delete_own_org" on mail_templates
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "mail_campaigns_select_own_org" on mail_campaigns
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "mail_campaigns_insert_own_org" on mail_campaigns
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_campaigns_update_own_org" on mail_campaigns
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_campaigns_delete_own_org" on mail_campaigns
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "mail_campaign_sends_select_own_org" on mail_campaign_sends
  for select using (
    is_platform_admin() or
    campaign_id in (
      select id from mail_campaigns where organization_id in (select user_organization_ids())
    )
  );

create policy "mail_automations_select_own_org" on mail_automations
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "mail_automations_insert_own_org" on mail_automations
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_automations_update_own_org" on mail_automations
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_automation_runs_select_own_org" on mail_automation_runs
  for select using (
    is_platform_admin() or
    automation_id in (
      select id from mail_automations where organization_id in (select user_organization_ids())
    )
  );
