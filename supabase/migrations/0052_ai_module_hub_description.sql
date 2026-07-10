-- 0052_ai_module_hub_description.sql
-- Уточнення label/description ключа platform_modules 'ai' після
-- того, як з'явилась перша реально робоча вкладка хаба (Workspace,
-- EXECUTION_PLAN.md). Старий опис "AI-асистент для тексту, SEO та
-- контенту" (0039_platform_foundation.sql) описував функціонал, який
-- тепер живе на /dashboard/content (0050_content_module_route_fix.sql)
-- — цей текст більше не відповідає тому, що реально на /dashboard/ai.
--
-- href/status/sort_order НЕ змінюються (href вже правильний з 0039,
-- status — рішення Артема через /dashboard/admin: тільки одна з
-- шести вкладок хаба поки реально працює).

update platform_modules
set
  label = 'Qorax AI',
  description = 'Єдиний AI-хаб: чат, агенти, файли, пам''ять, задачі й автоматизації'
where key = 'ai';
