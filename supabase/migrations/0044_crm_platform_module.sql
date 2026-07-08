-- 0044_crm_platform_module.sql
-- Реєстрація CRM у platform_modules (PLATFORM.md) — з'являється в
-- PlatformSidebar як "Скоро" (coming_soon), поки Артем не переведе
-- в 'live' вручну через /dashboard/admin після перевірки (той самий
-- механізм, що для інших модулів — див. 0039_platform_foundation.sql).

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('crm', 'CRM', 'Ліди, угоди та канбан-воронка продажів', 'Users', '/dashboard/crm', 'coming_soon', 70)
on conflict (key) do nothing;
