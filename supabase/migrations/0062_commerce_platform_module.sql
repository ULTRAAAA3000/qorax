-- 0062_commerce_platform_module.sql
-- Реєстрація Commerce у platform_modules — той самий механізм, що
-- 0044_crm_platform_module.sql: з'являється в PlatformSidebar як
-- "Скоро" (coming_soon), Артем перемикає на 'live' вручну через
-- /dashboard/admin після перевірки.

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('commerce', 'Commerce', 'Інтернет-магазини на базі Sites-конструктора', 'ShoppingCart', '/dashboard/commerce', 'coming_soon', 110)
on conflict (key) do nothing;
