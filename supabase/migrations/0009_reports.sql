-- ============================================================
-- QORAX — Migration 0009: Reports (monthly PDF, white-label)
-- ============================================================

create type report_type as enum ('monthly_summary', 'one_time_audit');
create type report_status as enum ('generating', 'ready', 'failed');

create table reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  report_type report_type not null,
  status report_status not null default 'generating',
  period_start date,
  period_end date,
  pdf_url text,
  -- snapshot ключевых метрик на момент генерации, чтобы отчёт не "плыл" если данные изменятся позже
  summary_data jsonb not null default '{}',
  is_white_labeled boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table reports is 'Сгенерированные PDF-отчёты. one_time_audit — для $19 разового аудита (organization_id может быть null до регистрации), monthly_summary — для подписчиков.';

create index idx_reports_organization on reports(organization_id);
create index idx_reports_site on reports(site_id);
