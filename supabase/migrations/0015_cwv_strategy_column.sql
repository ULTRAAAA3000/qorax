-- ============================================================
-- QORAX — Migration 0015: mobile/desktop strategy для Core Web Vitals
-- ============================================================
-- До цього моменту core_web_vitals_checks зберігала лише один прогон
-- PageSpeed Insights на перевірку (фактично — mobile, бо саме mobile
-- був хардкоднутий strategy в pageSpeed.ts). Mobile і desktop — це два
-- незалежних Lighthouse-прогони з різним throttling-профілем
-- (Google емулює повільний мобільний CPU/мережу для mobile), тому
-- значення можуть відрізнятись суттєво, і власнику сайту, який дивиться
-- дашборд з ПК, незрозуміло чому "швидкість" не співпадає з тим що він
-- бачить в браузері — desktop-показник потрібен окремо.
--
-- Рішення: один enum-стовпець strategy замість двох паралельних наборів
-- колонок (lcp_ms_mobile/lcp_ms_desktop і т.д.) — простіше для запитів
-- "дай останній desktop-прогон" і для побудови графіка одного типу.
-- ============================================================

create type pagespeed_strategy as enum ('mobile', 'desktop');

alter table core_web_vitals_checks
  add column strategy pagespeed_strategy not null default 'mobile';

-- Прибираємо default після backfill існуючих рядків (вище default
-- потрібен лише щоб alter table не впав на існуючих NOT NULL рядках) —
-- нові insert'и з worker/src/lib/monitoring.ts завжди передають strategy
-- явно, тож default більше не потрібен і може приховати помилку,
-- якщо колонку випадково забудуть передати.
alter table core_web_vitals_checks alter column strategy drop default;

-- Старий індекс (site_id, checked_at) лишається корисним для "останні N
-- записів незалежно від strategy", але для дашборду частіше потрібен
-- саме "останній desktop-прогон цього сайту" — додаємо складений індекс.
create index idx_cwv_checks_site_strategy_time
  on core_web_vitals_checks(site_id, strategy, checked_at desc);

comment on column core_web_vitals_checks.strategy is
  'mobile або desktop — який Lighthouse-throttling-профіль використано для цього прогону.';
