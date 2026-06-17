-- ============================================================
-- QORAX — Migration 0001: Core accounts (organizations, profiles)
-- ============================================================
-- Логика:
-- - auth.users (встроенная таблица Supabase Auth) хранит email/пароль/сессии.
-- - profiles — расширение пользователя (1:1 с auth.users), хранит имя, язык интерфейса.
-- - organizations — аккаунт верхнего уровня, к которому привязаны сайты и подписка.
--   Один user может состоять в одной organization (на старте — просто владелец).
--   org_type = 'client' (Starter/Growth, 1 сайт) или 'agency' (Agency, до 5 сайтов).
-- - organization_members — связь user <-> organization с ролью внутри неё
--   (на старте у client всегда один owner, но таблица сразу готова под команды агентств).
-- ============================================================

-- Расширение для генерации UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- ENUM типы
-- ------------------------------------------------------------

create type organization_type as enum ('client', 'agency');

create type member_role as enum ('owner', 'admin', 'member');

create type platform_role as enum ('user', 'admin');
-- platform_role = 'admin' — это ТЫ, владелец Qorax, видит всех клиентов.
-- Не путать с member_role, которая про роль внутри ОДНОЙ организации.

-- ------------------------------------------------------------
-- profiles — расширение auth.users
-- ------------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  locale text not null default 'uk' check (locale in ('uk', 'en')),
  platform_role platform_role not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table profiles is 'Расширение auth.users: имя, язык интерфейса, системная роль (admin = владелец Qorax)';

-- ------------------------------------------------------------
-- organizations — аккаунт клиента или агентства
-- ------------------------------------------------------------

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  org_type organization_type not null default 'client',
  -- белый лейбл для агентств: свой логотип/имя на отчётах
  white_label_enabled boolean not null default false,
  white_label_logo_url text,
  white_label_company_name text,
  -- лимит сайтов зависит от тарифа, но храним явно для быстрой проверки без джойна на subscriptions
  site_limit integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table organizations is 'Аккаунт верхнего уровня. client = 1 сайт (Starter/Growth), agency = до 5 сайтов + white-label';

-- ------------------------------------------------------------
-- organization_members — связь пользователей с организацией
-- ------------------------------------------------------------

create table organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  role member_role not null default 'owner',
  invited_email text,
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

comment on table organization_members is 'Кто состоит в организации и с какой ролью. На старте всегда один owner.';

create index idx_org_members_user on organization_members(user_id);
create index idx_org_members_org on organization_members(organization_id);

-- ------------------------------------------------------------
-- updated_at автообновление (триггер переиспользуем во всех таблицах)
-- ------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_profiles_updated_at
  before update on profiles
  for each row execute function set_updated_at();

create trigger trg_organizations_updated_at
  before update on organizations
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- Автосоздание profile при регистрации в auth.users
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
