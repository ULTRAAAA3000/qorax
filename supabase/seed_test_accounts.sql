-- ============================================================
-- QORAX — Тестовые аккаунты для QA
-- ============================================================
-- ВАЖНО: сначала создай пользователей вручную в
-- Supabase Dashboard → Authentication → Users → Add user
-- (Email + Password, "Auto Confirm User" = ON), используя email'ы ниже.
-- Триггер handle_new_user сам создаст им profiles.
-- ПОСЛЕ ЭТОГО выполни этот скрипт в SQL Editor.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Супер-админ — platform_role = admin, видит всё,
--    плюс личная organization на тарифе Agency (макс. фичи для теста UI)
-- ------------------------------------------------------------

update profiles
set platform_role = 'admin', full_name = 'Qorax Admin'
where id = (select id from auth.users where email = 'admin@qorax.dev');

with org as (
  insert into organizations (name, org_type, white_label_enabled, site_limit)
  values ('Qorax Admin Org', 'agency', true, 5)
  returning id
)
insert into organization_members (organization_id, user_id, role)
select org.id, (select id from auth.users where email = 'admin@qorax.dev'), 'owner'
from org;

insert into subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
select
  (select om.organization_id from organization_members om
     join auth.users u on u.id = om.user_id where u.email = 'admin@qorax.dev'),
  (select id from plans where code = 'agency'),
  'active', now(), now() + interval '1 year';

-- ------------------------------------------------------------
-- 2. Starter тестовый аккаунт
-- ------------------------------------------------------------

update profiles set full_name = 'Test Starter'
where id = (select id from auth.users where email = 'starter@qorax.dev');

with org as (
  insert into organizations (name, org_type, site_limit)
  values ('Test Starter Org', 'client', 1)
  returning id
)
insert into organization_members (organization_id, user_id, role)
select org.id, (select id from auth.users where email = 'starter@qorax.dev'), 'owner'
from org;

insert into subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
select
  (select om.organization_id from organization_members om
     join auth.users u on u.id = om.user_id where u.email = 'starter@qorax.dev'),
  (select id from plans where code = 'starter'),
  'active', now(), now() + interval '1 year';

-- ------------------------------------------------------------
-- 3. Growth тестовый аккаунт
-- ------------------------------------------------------------

update profiles set full_name = 'Test Growth'
where id = (select id from auth.users where email = 'growth@qorax.dev');

with org as (
  insert into organizations (name, org_type, site_limit)
  values ('Test Growth Org', 'client', 1)
  returning id
)
insert into organization_members (organization_id, user_id, role)
select org.id, (select id from auth.users where email = 'growth@qorax.dev'), 'owner'
from org;

insert into subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
select
  (select om.organization_id from organization_members om
     join auth.users u on u.id = om.user_id where u.email = 'growth@qorax.dev'),
  (select id from plans where code = 'growth'),
  'active', now(), now() + interval '1 year';

-- ------------------------------------------------------------
-- 4. Agency тестовый аккаунт (НЕ супер-админ — обычный agency-клиент)
-- ------------------------------------------------------------

update profiles set full_name = 'Test Agency'
where id = (select id from auth.users where email = 'agency@qorax.dev');

with org as (
  insert into organizations (name, org_type, white_label_enabled, site_limit)
  values ('Test Agency Org', 'agency', true, 5)
  returning id
)
insert into organization_members (organization_id, user_id, role)
select org.id, (select id from auth.users where email = 'agency@qorax.dev'), 'owner'
from org;

insert into subscriptions (organization_id, plan_id, status, current_period_start, current_period_end)
select
  (select om.organization_id from organization_members om
     join auth.users u on u.id = om.user_id where u.email = 'agency@qorax.dev'),
  (select id from plans where code = 'agency'),
  'active', now(), now() + interval '1 year';

-- ------------------------------------------------------------
-- Проверка результата
-- ------------------------------------------------------------
select
  u.email,
  p.platform_role,
  o.name as organization,
  pl.code as plan,
  s.status
from auth.users u
join profiles p on p.id = u.id
left join organization_members om on om.user_id = u.id
left join organizations o on o.id = om.organization_id
left join subscriptions s on s.organization_id = o.id
left join plans pl on pl.id = s.plan_id
where u.email in ('admin@qorax.dev', 'starter@qorax.dev', 'growth@qorax.dev', 'agency@qorax.dev')
order by u.email;
