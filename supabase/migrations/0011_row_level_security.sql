-- ============================================================
-- QORAX — Migration 0011: Row Level Security (RLS)
-- ============================================================
-- КРИТИЧНО: без этих политик любой авторизованный пользователь через
-- Supabase client API может прочитать/изменить данные ЛЮБОЙ организации,
-- не только свою. Включаем RLS на всех таблицах с данными клиентов.
--
-- Логика доступа:
-- - Пользователь видит только то, что принадлежит организациям,
--   в которых он состоит (через organization_members).
-- - platform_role = 'admin' (владелец Qorax) видит всё — для админ-панели.
-- - Сервисные операции (cron workers, webhooks) используют service_role key,
--   который ОБХОДИТ RLS полностью — это нормально и ожидаемо для backend-задач.
-- ============================================================

-- ------------------------------------------------------------
-- Вспомогательная функция: является ли текущий пользователь admin платформы
-- ------------------------------------------------------------

create or replace function is_platform_admin()
returns boolean as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and platform_role = 'admin'
  );
$$ language sql security definer stable;

-- ------------------------------------------------------------
-- Вспомогательная функция: список organization_id текущего пользователя
-- ------------------------------------------------------------

create or replace function user_organization_ids()
returns setof uuid as $$
  select organization_id from organization_members
  where user_id = auth.uid();
$$ language sql security definer stable;

-- ============================================================
-- profiles
-- ============================================================

alter table profiles enable row level security;

create policy "Users can view own profile"
  on profiles for select
  using (id = auth.uid() or is_platform_admin());

create policy "Users can update own profile"
  on profiles for update
  using (id = auth.uid());

-- ============================================================
-- organizations
-- ============================================================

alter table organizations enable row level security;

create policy "Members can view own organization"
  on organizations for select
  using (id in (select user_organization_ids()) or is_platform_admin());

create policy "Owners can update own organization"
  on organizations for update
  using (
    id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role = 'owner'
    )
  );

-- ============================================================
-- organization_members
-- ============================================================

alter table organization_members enable row level security;

create policy "Members can view their organization roster"
  on organization_members for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

-- ============================================================
-- subscriptions
-- ============================================================

alter table subscriptions enable row level security;

create policy "Members can view own subscription"
  on subscriptions for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

-- Insert/update подписок делается ТОЛЬКО через service_role (Stripe webhooks),
-- поэтому INSERT/UPDATE policy для обычных пользователей не создаём намеренно.

-- ============================================================
-- sites
-- ============================================================

alter table sites enable row level security;

create policy "Members can view own sites"
  on sites for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

create policy "Members can insert sites for own organization"
  on sites for insert
  with check (organization_id in (select user_organization_ids()));

create policy "Members can update own sites"
  on sites for update
  using (organization_id in (select user_organization_ids()));

create policy "Members can delete own sites"
  on sites for delete
  using (organization_id in (select user_organization_ids()));

-- ============================================================
-- competitor_sites (доступ через родительский site_id)
-- ============================================================

alter table competitor_sites enable row level security;

create policy "Members can view own competitor sites"
  on competitor_sites for select
  using (
    site_id in (
      select id from sites where organization_id in (select user_organization_ids())
    ) or is_platform_admin()
  );

create policy "Members can manage own competitor sites"
  on competitor_sites for all
  using (
    site_id in (
      select id from sites where organization_id in (select user_organization_ids())
    )
  );

-- ============================================================
-- Все таблицы мониторинга (read-only для клиентов, пишет только service_role)
-- ============================================================
-- Паттерн одинаковый для: uptime_checks, uptime_incidents, speed_checks,
-- core_web_vitals_checks, ssl_certificates, domain_registrations, broken_links,
-- console_errors, mobile_checks, page_seo_audits, duplicate_pages, sitemap_audits,
-- gsc_metrics, ai_insights, form_checks

alter table uptime_checks enable row level security;
create policy "Members can view own uptime checks"
  on uptime_checks for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table uptime_incidents enable row level security;
create policy "Members can view own uptime incidents"
  on uptime_incidents for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table speed_checks enable row level security;
create policy "Members can view own speed checks"
  on speed_checks for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table core_web_vitals_checks enable row level security;
create policy "Members can view own cwv checks"
  on core_web_vitals_checks for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table ssl_certificates enable row level security;
create policy "Members can view own ssl certificates"
  on ssl_certificates for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table domain_registrations enable row level security;
create policy "Members can view own domain registrations"
  on domain_registrations for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table broken_links enable row level security;
create policy "Members can view own broken links"
  on broken_links for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table console_errors enable row level security;
create policy "Members can view own console errors"
  on console_errors for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table mobile_checks enable row level security;
create policy "Members can view own mobile checks"
  on mobile_checks for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table page_seo_audits enable row level security;
create policy "Members can view own page seo audits"
  on page_seo_audits for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table duplicate_pages enable row level security;
create policy "Members can view own duplicate pages"
  on duplicate_pages for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table sitemap_audits enable row level security;
create policy "Members can view own sitemap audits"
  on sitemap_audits for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table gsc_connections enable row level security;
create policy "Members can view own gsc connections"
  on gsc_connections for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table gsc_metrics enable row level security;
create policy "Members can view own gsc metrics"
  on gsc_metrics for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table ai_insights enable row level security;
create policy "Members can view own ai insights"
  on ai_insights for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table ai_content_generations enable row level security;
create policy "Members can view own ai content generations"
  on ai_content_generations for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

alter table form_checks enable row level security;
create policy "Members can view own form checks"
  on form_checks for select
  using (site_id in (select id from sites where organization_id in (select user_organization_ids())) or is_platform_admin());

-- ============================================================
-- notification_settings
-- ============================================================

alter table notification_settings enable row level security;

create policy "Members can view own notification settings"
  on notification_settings for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

create policy "Owners can update own notification settings"
  on notification_settings for all
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ============================================================
-- alerts
-- ============================================================

alter table alerts enable row level security;

create policy "Members can view own alerts"
  on alerts for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

-- ============================================================
-- reports
-- ============================================================

alter table reports enable row level security;

create policy "Members can view own reports"
  on reports for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

-- ============================================================
-- audit_purchases — особый случай: доступ по email до регистрации
-- ============================================================
-- RLS здесь НЕ включаем для select по email, так как покупка может быть
-- анонимной (до регистрации). Чтение/запись audit_purchases происходит
-- только через backend (service_role) — пользователь никогда не обращается
-- к этой таблице напрямую через Supabase client.

alter table audit_purchases enable row level security;
-- Без policy = по умолчанию доступ запрещён всем кроме service_role. Это и есть нужное поведение.

-- ============================================================
-- free_audit_leads — то же самое, доступ только через backend
-- ============================================================

alter table free_audit_leads enable row level security;
-- Без policy = доступ только через service_role (backend), что и требуется.
