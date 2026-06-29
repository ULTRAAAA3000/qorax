-- ============================================================
-- QORAX — Migration 0024: speed_degradation_alerts
-- Таблиця для відстеження вже відправлених алертів деградації
-- швидкості — щоб не спамити клієнта кожен день одним і тим же.
-- ============================================================

create table if not exists speed_degradation_alerts (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  speed_ms    integer not null,
  avg_ms      integer not null,
  alerted_at  timestamptz not null default now()
);

create index idx_speed_degradation_alerts_site_date
  on speed_degradation_alerts(site_id, alerted_at desc);

-- RLS
alter table speed_degradation_alerts enable row level security;

-- Тільки service role може читати/писати (воркер)
create policy "service role only"
  on speed_degradation_alerts
  using (false);

comment on table speed_degradation_alerts is
  'Лог відправлених алертів деградації швидкості — один алерт на сайт на добу';
