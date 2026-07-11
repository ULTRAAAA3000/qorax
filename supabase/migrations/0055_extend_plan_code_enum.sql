-- 0055_extend_plan_code_enum.sql
-- Фаза 0.4 з EXECUTION_PLAN.md / PRICING.md розділ 4 — рішення
-- прийнято: додати 4-й тариф Enterprise у plans, а не робити
-- override через organization_module_access.
--
-- ALTER TYPE ... ADD VALUE ЗАВЖДИ в окремій міграції від тієї, де
-- нове значення одразу використовується (DATA_MODEL.md розділ 7,
-- правило вже задокументоване і тепер застосовується на практиці —
-- той самий патерн, що 0033_extend_member_role_enum.sql для
-- member_role). Postgres кидає "unsafe use of new value of enum
-- type" якщо використати ADD VALUE і сам enum в одній транзакції.

alter type plan_code add value if not exists 'enterprise';
