-- 0060_agents_seo_rank_seed.sql
-- Продовження 0057_agents_seed.sql: додає 'seo' і 'rank' в довідник
-- agents, синхронно з реалізацією їхньої worker-логіки
-- (handleRunSeoAgentRequest / handleRunRankAgentRequest в
-- agentHandler.ts) — той самий принцип, що зафіксований у коментарі
-- 0057: запис в agents з'являється РАЗОМ з робочим кодом агента, не
-- наперед порожньою заглушкою.
--
-- credit_cost_per_run = 0 для обох — на відміну від 'content' (1
-- credit за Gemini-виклик), SEO і Rank агенти НЕ генерують новий
-- AI-контент. Вони агрегують дані, які вже зібрані фоновими
-- процесами платформи (ai_insights — фоновий аудит; gsc_metrics —
-- GSC sync), тому новий Gemini-виклик і списання credit не потрібні.

insert into agents (id, name, description, underlying_module, credit_cost_per_run, is_active)
values
(
  'seo',
  'SEO-агент',
  'Збирає активні проблеми з фонового аудиту сайту (швидкість, SSL, biті посилання, Core Web Vitals) в один підсумок з орієнтовним впливом на дохід',
  'audit',
  0,
  true
),
(
  'rank',
  'Rank-агент',
  'Порівнює поточні позиції відстежуваних пошукових запитів із позиціями тиждень тому і показує, що покращилось чи погіршилось',
  'rank',
  0,
  true
)
on conflict (id) do nothing;
