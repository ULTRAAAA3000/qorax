-- ============================================================
-- QORAX — Migration 0004: Monitoring — Uptime, Speed, Core Web Vitals
-- ============================================================
-- Каждый тип проверки — своя таблица с временным рядом результатов.
-- Это позволяет Cloudflare Cron Workers писать независимо друг от друга
-- и строить графики "скорость во времени" без сложных джойнов.
-- ============================================================

create type uptime_status as enum ('up', 'down', 'degraded');

-- ------------------------------------------------------------
-- uptime_checks — результат каждой проверки доступности сайта
-- ------------------------------------------------------------

create table uptime_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  status uptime_status not null,
  http_status_code integer,
  response_time_ms integer,
  error_message text,
  checked_at timestamptz not null default now()
);

comment on table uptime_checks is 'Результат каждой проверки uptime. Высокая частота записи (раз в 1-5 мин на сайт) — без updated_at, только append.';

-- Партиционирование по времени пригодится при росте, но на старте достаточно индекса
create index idx_uptime_checks_site_time on uptime_checks(site_id, checked_at desc);

-- ------------------------------------------------------------
-- uptime_incidents — агрегированные инциденты (период падения сайта)
-- ------------------------------------------------------------
-- Отдельно от uptime_checks: инцидент = "сайт упал в 14:32, восстановился в 14:38".
-- Нужно для алертов (не слать алерт на каждую проверку, а один раз при начале инцидента)
-- и для отчётов ("3 инцидента за месяц, общий downtime 12 минут").

create table uptime_incidents (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  started_at timestamptz not null default now(),
  resolved_at timestamptz,
  duration_seconds integer, -- заполняется при resolve
  alert_sent boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table uptime_incidents is 'Период недоступности сайта. started_at без resolved_at = инцидент ещё открыт (сайт сейчас лежит).';

create index idx_uptime_incidents_site on uptime_incidents(site_id);
create index idx_uptime_incidents_open on uptime_incidents(site_id) where resolved_at is null;

-- ------------------------------------------------------------
-- speed_checks — скорость загрузки во времени (для графика)
-- ------------------------------------------------------------

create table speed_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  load_time_ms integer not null,
  page_size_kb integer,
  requests_count integer,
  checked_at timestamptz not null default now()
);

comment on table speed_checks is 'Скорость загрузки главной страницы. Источник: собственный замер (fetch timing) либо PageSpeed Insights API.';

create index idx_speed_checks_site_time on speed_checks(site_id, checked_at desc);

-- ------------------------------------------------------------
-- core_web_vitals_checks — метрики Google (LCP, FID/INP, CLS)
-- ------------------------------------------------------------

create table core_web_vitals_checks (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  lcp_ms integer, -- Largest Contentful Paint
  inp_ms integer, -- Interaction to Next Paint (заменил FID в 2024)
  cls_score numeric(5, 3), -- Cumulative Layout Shift
  performance_score integer, -- общий Lighthouse score 0-100
  raw_response jsonb, -- полный ответ PageSpeed Insights API на случай если нужны доп. метрики позже
  checked_at timestamptz not null default now()
);

comment on table core_web_vitals_checks is 'Метрики из Google PageSpeed Insights API (бесплатный). Только Growth/Agency план.';

create index idx_cwv_checks_site_time on core_web_vitals_checks(site_id, checked_at desc);
