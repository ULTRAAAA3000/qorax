-- 0057_agents_seed.sql
-- Заповнення глобального довідника agents (0049_qorax_ai_hub.sql,
-- таблиця agents порожня — лише структура). Без цього agentHandler.ts
-- впаде на foreign key violation при insert в agent_subscriptions
-- (agent_id references agents(id)).
--
-- П'ятий UI-крок хвилі 3: реалізовано лише агент 'content' (рішення
-- Артема — 1-2 агенти за сесію, повноцінні дії). Решта id з
-- коментаря в 0049 ('seo' | 'translator' | 'analytics' | 'rank' |
-- 'cro' | 'commerce' | 'social' | 'crm' | 'support') НЕ додаються
-- сюди — додавати запис в agents варто одночасно з реалізацією
-- worker-логіки для нього, а не наперед порожніми заглушками.

insert into agents (id, name, description, underlying_module, credit_cost_per_run, is_active)
values (
  'content',
  'Content-агент',
  'Знаходить сторінки з проблемами SEO (title/meta description) і генерує готові пропозиції для заміни',
  'content',
  1, -- 1 ai_credit за кожну згенеровану сторінку (agentHandler.ts списує по факту успішних генерацій)
  true
)
on conflict (id) do nothing;
