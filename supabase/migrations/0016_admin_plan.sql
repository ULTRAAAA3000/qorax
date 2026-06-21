-- ============================================================
-- QORAX — Migration 0016: Admin plan + admin account helpers
-- ============================================================
-- PostgreSQL не позволяет использовать новое enum-значение в той же
-- транзакции где оно создано (ошибка: "unsafe use of new value").
-- ЗАПУСКАТЬ В ДВА ОТДЕЛЬНЫХ ЗАПРОСА В SQL EDITOR:
--   1) Сначала только ALTER TYPE (блок ниже до разделителя)
--   2) Потом всё остальное (после разделителя)
-- ============================================================

-- ═══ ЗАПРОС 1 ═══ (выполни отдельно, потом жми Run снова для запроса 2)
alter type plan_code add value if not exists 'admin';


-- ═══ ЗАПРОС 2 ═══ (выполни после того как запрос 1 завершился успешно)

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

create or replace function upgrade_to_admin(admin_email text)
returns text as $$
declare
  v_user_id      uuid;
  v_org_id       uuid;
  v_admin_plan   uuid;
  v_existing_sub uuid;
begin
  select id into v_user_id
  from auth.users
  where email = admin_email
  limit 1;

  if v_user_id is null then
    return 'ERROR: пользователь ' || admin_email || ' не найден. Создайте его в Auth Dashboard.';
  end if;

  update profiles set platform_role = 'admin' where id = v_user_id;

  select om.organization_id into v_org_id
  from organization_members om
  where om.user_id = v_user_id
  limit 1;

  if v_org_id is null then
    return 'ERROR: organization не найдена для ' || admin_email;
  end if;

  update organizations
  set org_type = 'agency', site_limit = 999999, updated_at = now()
  where id = v_org_id;

  select id into v_admin_plan from plans where code = 'admin' limit 1;

  select id into v_existing_sub
  from subscriptions where organization_id = v_org_id limit 1;

  if v_existing_sub is not null then
    update subscriptions
    set plan_id = v_admin_plan, status = 'active', updated_at = now()
    where id = v_existing_sub;
  else
    insert into subscriptions (organization_id, plan_id, status)
    values (v_org_id, v_admin_plan, 'active');
  end if;

  return 'OK: ' || admin_email || ' повышен до admin. org_id=' || v_org_id;
end;
$$ language plpgsql security definer;
