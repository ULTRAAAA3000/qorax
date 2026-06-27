-- Migration 0022: Agency white-label support
-- Add url column to organizations for white-label PDF footer

alter table organizations
  add column if not exists url text;

-- Update org_type and site_limit when agency plan is purchased
-- (handled in LS webhook, but set defaults here for existing orgs)
-- No data migration needed — existing orgs keep their current values.
