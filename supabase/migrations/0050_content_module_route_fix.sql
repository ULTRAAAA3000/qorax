-- 0050_content_module_route_fix.sql
-- Виправлення невідповідності, знайденої і задокументованої в
-- 0049_qorax_ai_hub.sql / EXECUTION_PLAN.md ("КРИТИЧНО ВАЖЛИВЕ
-- ВІДКРИТТЯ"): код AiContentUI.tsx (генерація заголовків/meta/FAQ,
-- 0042_ai_content_module.sql) фізично жив на /dashboard/ai, хоча
-- ключ 'ai' з 0039_platform_foundation.sql з самого початку був
-- задуманий під повноцінний Qorax AI-хаб (0049_qorax_ai_hub.sql).
-- Ключ 'content' (href /dashboard/content) саме й призначався під
-- генерацію текстів, але сторінки не існувало.
--
-- Артем підтвердив варіант: перенести код на /dashboard/content,
-- звільнити /dashboard/ai під майбутній хаб. Код уже перенесено
-- (app/dashboard/ai/ -> app/dashboard/content/) в тому ж коміті.
-- Ця міграція лише узгоджує label/description ключа 'content' з
-- реальним функціоналом (старий опис "AI-генерація SEO-статей та
-- контент-планів" описував щось ширше за фактичну реалізацію —
-- заголовки/meta/FAQ, без повноцінних статей). href/status/sort_order
-- НЕ змінюються (href вже був правильний, status — рішення Артема
-- через /dashboard/admin, не міграції).
--
-- Ключ 'ai' НЕ чіпається текстом (його опис і так коректно описує
-- майбутній хаб) — просто фіксується коментарем, що з коду під ним
-- більше нічого не висить, шлях вільний для Qorax AI.

update platform_modules
set
  label = 'AI Content',
  description = 'Генерація заголовків, meta-описів, FAQ та вступних абзаців'
where key = 'content';
