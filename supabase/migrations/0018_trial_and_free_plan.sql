-- ============================================================
-- QORAX — Migration 0018: Trial + Free plan
-- ============================================================
-- Добавляем два новых плана: `trial` (14 дней) и `free` (навсегда, урезанный).
--
-- Логика:
--   Регистрация → автоматически `trial` на 14 дней (полный Starter)
--   Конец триала → автоматически `free` (uptime раз в 30 мин, нет AI/SSL/скорости)
--   Апгрейд → `starter`/`growth`/`agency` через Stripe
--
-- ВАЖНО — PostgreSQL не даёт использовать новое enum-значение
-- в той же транзакции где оно создано.
-- ЗАПУСКАТЬ В ТРИ ОТДЕЛЬНЫХ ЗАПРОСА В SQL EDITOR:
--   Запрос 1: ALTER TYPE (оба add value)
--   Запрос 2: INSERT into plans + ALTER TABLE
--   Запрос 3: create or replace function handle_new_user() + cron helper
-- ============================================================

-- ═══ ЗАПРОС 1 ═══  (выполни отдельно, потом Run снова для запроса 2)
alter type plan_code add value if not exists 'trial';
alter type plan_code add value if not exists 'free';


-- ═══ ЗАПРОС 2 ═══  (выполни после запроса 1)

-- Добавляем колонку trial_ends_at в subscriptions
alter table subscriptions
  add column if not exists trial_ends_at timestamptz;

-- Бесплатный план — навсегда, очень урезанный
insert into plans (code, name, price_usd, site_limit, extra_site_price_usd, features)
values (
  'free',
  'Free',
  0.00,
  1,
  null,
  '{
    "uptime_monitoring": true,
    "uptime_interval_minutes": 30,
    "speed_tracking": false,
    "ssl_domain_alerts": false,
    "broken_links": false,
    "ai_explain_simple": false,
    "monthly_pdf_report": false,
    "email_alerts": true,
    "core_web_vitals": false,
    "meta_schema_checker": false,
    "gsc_integration": false,
    "sitemap_robots_analysis": false,
    "duplicate_pages": false,
    "ai_revenue_impact": false,
    "competitor_monitoring": 0,
    "telegram_alerts": false,
    "live_dashboard": false,
    "white_label": false,
    "ai_content_generation": false
  }'::jsonb
)
on conflict (code) do nothing;

-- Триальный план — 14 дней, полный Starter
insert into plans (code, name, price_usd, site_limit, extra_site_price_usd, features)
values (
  'trial',
  'Trial (14 днів)',
  0.00,
  1,
  null,
  '{
    "uptime_monitoring": true,
    "uptime_interval_minutes": 5,
    "speed_tracking": true,
    "ssl_domain_alerts": true,
    "broken_links": true,
    "ai_explain_simple": true,
    "monthly_pdf_report": true,
    "email_alerts": true,
    "core_web_vitals": false,
    "meta_schema_checker": false,
    "gsc_integration": false,
    "sitemap_robots_analysis": false,
    "duplicate_pages": false,
    "ai_revenue_impact": false,
    "competitor_monitoring": 0,
    "telegram_alerts": false,
    "live_dashboard": false,
    "white_label": false,
    "ai_content_generation": false
  }'::jsonb
)
on conflict (code) do nothing;


-- ═══ ЗАПРОС 3 ═══  (выполни после запроса 2)

-- Обновляем триггер создания пользователя:
-- теперь создаёт подписку `trial` на 14 дней автоматически
create or replace function handle_new_user()
returns trigger as $$
declare
  new_org_id   uuid;
  trial_plan_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');

  insert into public.organizations (name, org_type, site_limit)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'client',
    1
  )
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  -- Автоматически создаём trial-подписку на 14 дней
  select id into trial_plan_id from public.plans where code = 'trial' limit 1;

  if trial_plan_id is not null then
    insert into public.subscriptions (
      organization_id,
      plan_id,
      status,
      trial_ends_at
    )
    values (
      new_org_id,
      trial_plan_id,
      'trialing',
      now() + interval '14 days'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;

-- Хелпер: переводит истёкшие trial → free (вызывается из cron worker'а)
-- Возвращает количество переведённых организаций
create or replace function expire_trials()
returns integer as $$
declare
  v_free_plan_id uuid;
  v_count        integer := 0;
begin
  select id into v_free_plan_id from plans where code = 'free' limit 1;

  update subscriptions
  set
    plan_id   = v_free_plan_id,
    status    = 'canceled',
    updated_at = now()
  where
    status = 'trialing'
    and trial_ends_at < now()
    and plan_id in (select id from plans where code = 'trial');

  get diagnostics v_count = row_count;
  return v_count;
end;
$$ language plpgsql security definer;

-- Существующим организациям без подписки выдаём trial
-- (на случай если у кого-то уже есть аккаунт без subscription-строки)
do $$
declare
  org_rec       record;
  trial_plan_id uuid;
begin
  select id into trial_plan_id from plans where code = 'trial' limit 1;

  for org_rec in
    select o.id as org_id
    from organizations o
    where not exists (
      select 1 from subscriptions s where s.organization_id = o.id
    )
  loop
    insert into subscriptions (organization_id, plan_id, status, trial_ends_at)
    values (org_rec.org_id, trial_plan_id, 'trialing', now() + interval '14 days');

    raise notice 'Created trial subscription for org: %', org_rec.org_id;
  end loop;
end $$;
