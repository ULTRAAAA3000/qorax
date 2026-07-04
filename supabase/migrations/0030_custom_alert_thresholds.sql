-- ============================================================
-- QORAX — Migration 0030: Custom alert thresholds
-- ============================================================
-- Дозволяє власнику сайту задати власний поріг часу відповіді.
-- Якщо жива перевірка (кожні 5 хв) перевищує поріг — шлємо
-- "повільна відповідь" алерт (email/Telegram/Slack), окремо від
-- вже існуючої щоденної деградації швидкості (яка порівнює з
-- історичним середнім раз на добу).
--
-- response_time_alert_threshold_ms:
--   null   — вимкнено (за замовчуванням)
--   число  — поріг у мс; перевищення на живій перевірці (basicCheck)
--            надсилає алерт, не частіше одного разу на годину на сайт

alter table sites
  add column if not exists response_time_alert_threshold_ms integer;

comment on column sites.response_time_alert_threshold_ms is
  'Поріг часу відповіді (мс) для миттєвого алерту на кожній живій перевірці (кожні 5 хв). NULL = вимкнено. Відрізняється від speed_degradation_alerts, який порівнює з 7-денним середнім раз на добу.';

-- Лог відправлених алертів — щоб не спамити частіше разу на годину
create table if not exists response_time_alerts (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references sites(id) on delete cascade,
  response_ms integer not null,
  threshold_ms integer not null,
  alerted_at  timestamptz not null default now()
);

create index idx_response_time_alerts_site_date
  on response_time_alerts(site_id, alerted_at desc);

alter table response_time_alerts enable row level security;

create policy "service role only"
  on response_time_alerts
  using (false);

comment on table response_time_alerts is
  'Лог відправлених алертів перевищення custom response-time порогу — не частіше одного разу на годину на сайт';
