-- 0078_mail_core.sql
-- Qorax Mail — Шар 1: Inbox/Compose/Contacts/Files
-- (MODULE_ROADMAP.md, "Qorax Mail — окремий продукт екосистеми").
--
-- РІШЕННЯ, ПРИЙНЯТЕ ПЕРЕД ЦІЄЮ МІГРАЦІЄЮ (обидва питання документ
-- явно вимагав закрити до коду):
-- 1. Автентифікація: mail_accounts.organization_id NOT NULL — Mail
--    завжди прив'язаний до вже існуючої Qorax-організації, БЕЗ
--    паралельної системи реєстрації. /mail — окрема ТОЧКА ВХОДУ
--    (позиціонування), не окрема АВТЕНТИФІКАЦІЯ.
-- 2. Прийом пошти: варіант 3 з документа — OAuth-конектор до Gmail/
--    Outlook (як вже зроблено для GSC в Rank-модулі), НЕ власний
--    SMTP/IMAP сервер і НЕ сторонній inbound-провайдер. Найшвидший
--    шлях до MVP, нуль проблем з deliverability/спам-репутацією
--    (лист іде через інфраструктуру Google/Microsoft, не через IP
--    Qorax). MVP цієї міграції — тільки Gmail (provider='gmail'),
--    Outlook — той самий provider enum, наступна ітерація.
--
-- mail_contacts НЕ створюється окремою таблицею — за задумом
-- документа переюзовуємо вже наявну crm_contacts (учасник
-- листування = потенційний CRM-контакт). source='mail_thread' —
-- нове значення для вже текстового (не enum) поля crm_contacts.source.

create table mail_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  provider text not null, -- 'gmail' зараз; 'outlook' — майбутня ітерація (той самий provider enum)
  email_address text not null,
  encrypted_refresh_token text not null, -- tokenCrypto.ts (hex iv:ciphertext), GOOGLE_TOKEN_ENCRYPTION_KEY — той самий секрет, що GSC/GA4 (той самий OAuth-провайдер, Google)
  history_id text, -- Gmail API history.list checkpoint для інкрементального sync (не повний re-fetch щоразу)
  is_active boolean not null default true,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  constraint mail_accounts_provider_check check (provider in ('gmail', 'outlook')),
  unique (organization_id, email_address)
);

comment on table mail_accounts is 'Підключені поштові скриньки клієнта через OAuth (Gmail API). Qorax НЕ хостить пошту — читає/пише через API акаунта клієнта, як GSC-конектор у Rank-модулі.';

create index idx_mail_accounts_org on mail_accounts(organization_id);

create table mail_threads (
  id uuid primary key default gen_random_uuid(),
  mail_account_id uuid not null references mail_accounts(id) on delete cascade,
  provider_thread_id text not null, -- Gmail thread id — для дедуплікації при повторному sync
  subject text,
  participants text[],
  last_message_at timestamptz not null,
  is_read boolean not null default false,
  ai_category text, -- AI-сортування (Шар 3, майбутнє): 'client' | 'internal' | 'newsletter' | ...
  ai_priority text,  -- Priority Agent (Шар 3, майбутнє)
  created_at timestamptz not null default now(),
  unique (mail_account_id, provider_thread_id)
);

comment on table mail_threads is 'Email-треди. ai_category/ai_priority — поля-заділи під Шар 3 (AI-агенти), заповнюються NULL до тих пір, поки Mail Agent не реалізовано.';

create index idx_mail_threads_account on mail_threads(mail_account_id, last_message_at desc);

create table mail_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references mail_threads(id) on delete cascade,
  provider_message_id text not null, -- для дедуплікації при повторному sync
  direction text not null, -- 'inbound' | 'outbound'
  from_address text not null,
  to_addresses text[] not null,
  body_html text,
  body_text text,
  sent_at timestamptz not null,
  scheduled_send_at timestamptz, -- відкладена відправка (Compose, майбутнє — не MVP першого проходу)
  created_at timestamptz not null default now(),
  constraint mail_messages_direction_check check (direction in ('inbound', 'outbound')),
  unique (thread_id, provider_message_id)
);

create index idx_mail_messages_thread on mail_messages(thread_id, sent_at asc);

create table mail_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references mail_messages(id) on delete cascade,
  filename text not null,
  storage_path text not null, -- Cloudflare R2 (не Supabase Storage) — за задумом документа, консистентно з рештою платформи; сам R2 bucket і завантаження — не ця міграція, тільки схема
  content_type text,
  size_bytes integer,
  ai_tags text[], -- майбутнє AI-тегування вкладень, не MVP
  created_at timestamptz not null default now()
);

create index idx_mail_attachments_message on mail_attachments(message_id);

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4. Усі 4 таблиці —
-- транзитивно через mail_accounts.organization_id (окрім
-- mail_accounts самої, яка має organization_id напряму).
-- ============================================================

alter table mail_accounts enable row level security;
alter table mail_threads enable row level security;
alter table mail_messages enable row level security;
alter table mail_attachments enable row level security;

create policy "mail_accounts_select_own_org" on mail_accounts
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "mail_accounts_insert_own_org" on mail_accounts
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_accounts_update_own_org" on mail_accounts
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_accounts_delete_own_org" on mail_accounts
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "mail_threads_select_own_org" on mail_threads
  for select using (
    is_platform_admin() or
    mail_account_id in (
      select id from mail_accounts where organization_id in (select user_organization_ids())
    )
  );

create policy "mail_threads_update_own_org" on mail_threads
  for update using (
    mail_account_id in (
      select ma.id from mail_accounts ma
      join organization_members om on om.organization_id = ma.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "mail_messages_select_own_org" on mail_messages
  for select using (
    is_platform_admin() or
    thread_id in (
      select t.id from mail_threads t
      join mail_accounts ma on ma.id = t.mail_account_id
      where ma.organization_id in (select user_organization_ids())
    )
  );

create policy "mail_attachments_select_own_org" on mail_attachments
  for select using (
    is_platform_admin() or
    message_id in (
      select m.id from mail_messages m
      join mail_threads t on t.id = m.thread_id
      join mail_accounts ma on ma.id = t.mail_account_id
      where ma.organization_id in (select user_organization_ids())
    )
  );

-- ============================================================
-- Точка входу /mail — навмисно НЕ platform_modules рядок
-- (MODULE_ROADMAP.md прямим текстом: Mail не показується як
-- coming_soon/live модуль платформи, а самостійна точка входу,
-- вже реалізована як ProductComingSoon-заглушка в app/mail/page.tsx)
-- ============================================================
