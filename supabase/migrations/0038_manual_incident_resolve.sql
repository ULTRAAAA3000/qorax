-- ============================================================
-- QORAX — Migration 0038: manual incident resolution flag
-- ============================================================
-- Дозволяє власнику сайту вручну закрити "застряглий" інцидент
-- (наприклад false-positive через тимчасовий збій воркера).
-- Прапорець resolved_manually відрізняє такі закриття від
-- автоматичного reconcileIncident в історії/статистиці uptime.

alter table uptime_incidents
  add column if not exists resolved_manually boolean not null default false;

comment on column uptime_incidents.resolved_manually is
  'true якщо інцидент закрито вручну власником сайту (кнопка "Резолвнути"), а не автоматично при відновленні uptime-перевірки.';
