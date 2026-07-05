-- ============================================================
-- QORAX — Migration 0037: onboarding checklist
-- ============================================================
-- Чекліст з 3 кроків для нових організацій (додати сайт, дочекатись
-- першої перевірки, email-алерт готовий). Сам прогрес обчислюється
-- на льоту з існуючих таблиць (sites, uptime_checks,
-- notification_settings) — тут зберігаємо тільки чи юзер сховав
-- чекліст вручну.

alter table organizations
  add column if not exists onboarding_dismissed boolean not null default false;

comment on column organizations.onboarding_dismissed is
  'Юзер вручну приховав onboarding-чекліст на дашборді. Прогрес самих кроків обчислюється динамічно, тут лише прапорець "не показувати".';
