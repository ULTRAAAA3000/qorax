-- ============================================================
-- QORAX — Migration 0040: admin write access to platform_modules
-- ============================================================
-- Migration 0039 дала platform_modules тільки select-політику (потрібну
-- для рендеру sidebar). Admin-панель (/dashboard/admin) потребує можливості
-- редагувати статус модуля (live/coming_soon/hidden) та керувати
-- organization_module_access без прямого SQL в Supabase — цю потребу
-- закриває ця міграція, використовуючи вже наявний helper is_platform_admin()
-- з міграції 0011 (той самий патерн, що і решта admin-функціоналу:
-- change-plan, ручні тригери тощо).
-- ============================================================

create policy "platform_modules_admin_insert" on platform_modules
  for insert with check (is_platform_admin());

create policy "platform_modules_admin_update" on platform_modules
  for update using (is_platform_admin());

create policy "platform_modules_admin_delete" on platform_modules
  for delete using (is_platform_admin());

-- organization_module_access: admin керує раннім доступом до модулів
-- для конкретних організацій (бета-тестери)

create policy "org_module_access_admin_insert" on organization_module_access
  for insert with check (is_platform_admin());

create policy "org_module_access_admin_update" on organization_module_access
  for update using (is_platform_admin());

create policy "org_module_access_admin_delete" on organization_module_access
  for delete using (is_platform_admin());
