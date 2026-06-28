-- Migration 0023: Fix upsert constraints

-- 1. sitemap_audits — додаємо unique constraint на site_id
--    (зараз upsertRow("site_id") падає бо немає constraint)
--    Спочатку видаляємо дублікати якщо є
delete from sitemap_audits a
using sitemap_audits b
where a.id > b.id and a.site_id = b.site_id;

-- Тепер додаємо unique index
create unique index if not exists idx_sitemap_audits_site_id
  on sitemap_audits(site_id);

-- 2. page_seo_audits — перевіряємо чи є unique на site_id
delete from page_seo_audits a
using page_seo_audits b
where a.id > b.id and a.site_id = b.site_id;

create unique index if not exists idx_page_seo_audits_site_id
  on page_seo_audits(site_id);

-- 3. subscriptions — додаємо unconditional unique index на organization_id
--    щоб upsert працював незалежно від status
--    (існуючий idx включає WHERE тому upsert його не бачить)
--    Спочатку прибираємо дублікати залишаючи найновіший
delete from subscriptions a
using subscriptions b
where a.organization_id = b.organization_id
  and a.created_at < b.created_at;

create unique index if not exists idx_subscriptions_org_id_unconditional
  on subscriptions(organization_id);

-- 4. gsc_metrics — fix NULLS NOT DISTINCT для upsert по (site_id, date, page_url, query)
drop index if exists idx_gsc_metrics_unique;

create unique index if not exists idx_gsc_metrics_unique
  on gsc_metrics(site_id, date, page_url, query)
  nulls not distinct;

-- 5. gsc_connections — unique по site_id для upsert  
create unique index if not exists idx_gsc_connections_site_id
  on gsc_connections(site_id);
