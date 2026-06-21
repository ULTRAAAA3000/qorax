-- ============================================================
-- QORAX — Migration 0016: Admin plan + admin account helpers
-- ============================================================
-- Добавляем специальный "admin" план для владельца платформы:
-- - plan_code расширяем новым значением 'admin'
-- - план имеет site_limit = 999999 (практически безлимитный),
--   все фичи включены
-- - helper-функция upgrade_to_admin() для ручного присвоения
--   платформенному администратору нужного плана и org_type
--
-- Использование после создания аккаунта через Supabase Auth Dashboard:
--   select upgrade_to_admin('admin@qorax.dev');
-- ============================================================

-- Расширяем enum plan_code новым значением
alter type plan_code add value if not exists 'admin';

-- Добавляем admin-план в справочник тарифов
insert into plans (code, name, price_usd, site_limit, extra_site_price_usd, features)
values (
  'admin',
  'Admin (Internal)',
  0.00,
  999999,
  null,
  '{
    "uptime_monitoring": true,
    "speed_tracking": true,
    "ssl_domain_alerts": true,
    "broken_links": true,
    "ai_explain_simple": true,
    "monthly_pdf_report": true,
    "email_alerts": true,
    "core_web_vitals": true,
    "meta_schema_checker": true,
    "gsc_integration": true,
    "sitemap_robots_analysis": true,
    "duplicate_pages": true,
    "ai_revenue_impact": true,
    "competitor_monitoring": -1,
    "telegram_alerts": true,
    "live_dashboard": true,
    "white_label": true,
    "ai_content_generation": true,
    "admin_panel": true
  }'::jsonb
)
on conflict (code) do nothing;

-- ============================================================
-- Функция upgrade_to_admin(email) — вызывать вручную один раз
-- после создания аккаунта в Supabase Auth Dashboard.
--
-- Что делает:
--   1. Ставит platform_role = 'admin' в profiles
--   2. Меняет org_type → 'agency', site_limit → 999999 в organizations
--   3. Создаёт или обновляет subscription с admin-планом
-- ============================================================
create or replace function upgrade_to_admin(admin_email text)
returns text as $$
declare
  v_user_id      uuid;
  v_org_id       uuid;
  v_admin_plan   uuid;
  v_existing_sub uuid;
begin
  -- Ищем пользователя по email
  select id into v_user_id
  from auth.users
  where email = admin_email
  limit 1;

  if v_user_id is null then
    return 'ERROR: пользователь с email ' || admin_email || ' не найден. Создайте его сначала в Supabase Auth Dashboard.';
  end if;

  -- Ставим platform_role = 'admin'
  update profiles
  set platform_role = 'admin'
  where id = v_user_id;

  -- Находим organization пользователя
  select om.organization_id into v_org_id
  from organization_members om
  where om.user_id = v_user_id
  limit 1;

  if v_org_id is null then
    return 'ERROR: organization не найдена для ' || admin_email || '. Убедитесь, что триггер handle_new_user отработал при регистрации.';
  end if;

  -- Апгрейдим organization до безлимитной
  update organizations
  set
    org_type   = 'agency',
    site_limit = 999999,
    name       = coalesce(name, 'Qorax Admin'),
    updated_at = now()
  where id = v_org_id;

  -- Получаем id admin-плана
  select id into v_admin_plan from plans where code = 'admin' limit 1;

  -- Создаём или обновляем подписку
  select id into v_existing_sub
  from subscriptions
  where organization_id = v_org_id
  limit 1;

  if v_existing_sub is not null then
    update subscriptions
    set
      plan_id    = v_admin_plan,
      status     = 'active',
      updated_at = now()
    where id = v_existing_sub;
  else
    insert into subscriptions (organization_id, plan_id, status)
    values (v_org_id, v_admin_plan, 'active');
  end if;

  return 'OK: ' || admin_email || ' успешно повышен до platform admin. org_id=' || v_org_id;
end;
$$ language plpgsql security definer;

comment on function upgrade_to_admin(text) is
  'Повышает пользователя до владельца платформы Qorax. Вызывать один раз: select upgrade_to_admin(''admin@qorax.dev'');';
