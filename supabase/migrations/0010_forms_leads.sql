-- ============================================================
-- QORAX — Migration 0010: Form Checks & Free Lead Magnets
-- ============================================================

-- ------------------------------------------------------------
-- form_checks — автоматическая проверка работы форм на сайте
-- ------------------------------------------------------------

create table form_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  form_identifier text, -- селектор/название формы, если на странице несколько
  submission_successful boolean,
  email_received boolean, -- проверка, что письмо с заявки реально дошло (через тестовый email)
  response_time_ms integer,
  error_details text,
  checked_at timestamptz not null default now()
);

comment on table form_checks is 'Автоматический тест форм: бот заполняет форму тестовыми данными и проверяет, что письмо дошло.';

create index idx_form_checks_site_time on form_checks(site_id, checked_at desc);

-- ------------------------------------------------------------
-- free_audit_leads — бесплатный аудит без регистрации (лид-магнит, ступень 1)
-- ------------------------------------------------------------
-- Отдельно от audit_purchases (платный $19): здесь хранятся лиды
-- с бесплатного разового аудита, для последующего email-маркетинга.

create table free_audit_leads (
  id uuid primary key default gen_random_uuid(),
  email text,
  site_url text not null,
  -- упрощённый результат: показываем 2-3 проблемы, остальное "скрыто" за платным аудитом
  preview_results jsonb not null default '{}',
  converted_to_purchase boolean not null default false,
  converted_to_subscription boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table free_audit_leads is 'Лиды с бесплатного аудита без регистрации. email может быть null если ввели только URL без email для отправки.';

create index idx_free_audit_leads_email on free_audit_leads(email);
create index idx_free_audit_leads_created on free_audit_leads(created_at desc);
