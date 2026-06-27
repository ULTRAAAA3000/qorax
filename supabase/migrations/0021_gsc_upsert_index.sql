-- Migration 0021: GSC upsert index fix
-- The existing unique index uses coalesce() which is not directly
-- compatible with Supabase upsert onConflict="site_id,date,page_url,query".
-- We drop the old functional index and add a partial/expression approach
-- that Supabase JS client can reference by column names.

-- Drop old functional unique index
drop index if exists idx_gsc_metrics_unique;

-- Add nullable-safe unique index using NULLS NOT DISTINCT (Postgres 15+)
-- Supabase Cloud runs Postgres 15, so this is safe.
create unique index idx_gsc_metrics_unique
  on gsc_metrics (site_id, date, page_url, query)
  nulls not distinct;

-- Also ensure gsc_connections has proper upsert support
-- (site_id is already unique via primary key constraint in schema,
--  but let's make sure the index exists for onConflict="site_id")
create unique index if not exists idx_gsc_connections_site_id
  on gsc_connections (site_id);
