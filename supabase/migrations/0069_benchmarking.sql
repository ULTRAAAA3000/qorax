-- ============================================================
-- QORAX — Migration 0069: Benchmarking
-- ============================================================
-- MODULE_ROADMAP.md, "Четверта хвиля", розділ 15 "Benchmarking —
-- порівняння з ринком".
--
-- НАЙЧУТЛИВІШИЙ модуль технічно: збирає АНОНІМІЗОВАНУ статистику
-- по ВСІХ організаціях платформи для розрахунку процентилів.
-- Знеособлення відбувається в момент ЗАПИСУ в benchmark_snapshots
-- (worker формує рядок без organization_id) — не в момент читання,
-- так простіше гарантувати, що персональні дані фізично не
-- потрапляють у цю таблицю.
--
-- ВІДОМЕ ОБМЕЖЕННЯ (задокументовано в roadmap, свідомо прийнято
-- Артемом при старті цього напряму): percent_rank() відносно малої
-- бази (кілька десятків організацій на industry/country/business_size)
-- дає малоінформативні проценти. Продуктово це не блокер запуску —
-- дані накопичуються з часом, і чим більше клієнтів, тим точніше.
-- Юридичний аспект (згода в Terms of Service на участь в анонімізованій
-- агрегації) — ОКРЕМА, ще не зроблена задача, не входить в цей прохід.
-- ============================================================

-- ── organizations: поля для групування бенчмарків ──────────────────────
-- Без industry/country/business_size percent_rank() неможливо рахувати
-- в межах релевантної групи (порівнювати solo-блог з agency-клієнтом
-- безглуздо). business_size рахується автоматично тригером нижче за
-- кількістю сайтів організації, industry/country — вручну користувачем
-- (заповнюється в /dashboard/settings, окремий UI, не входить в цей прохід —
-- поки що nullable, рядки без цих полів просто не потрапляють у знімки).

alter table organizations add column if not exists industry text;
alter table organizations add column if not exists country text;
alter table organizations add column if not exists business_size text; -- 'solo' | 'small' | 'medium', рахується тригером нижче

comment on column organizations.industry is 'Ніша бізнесу для групування Benchmarking (MODULE_ROADMAP.md розділ 15). Заповнюється користувачем вручну, поки без окремого UI в цьому проході — nullable.';
comment on column organizations.country is 'Країна для групування Benchmarking. Заповнюється користувачем вручну.';
comment on column organizations.business_size is 'solo (1 сайт) | small (2-3) | medium (4+) — рахується автоматично тригером trg_update_business_size при insert/delete у sites.';

-- ── business_size авто-розрахунок ──────────────────────────────────────
-- Навмисно тригер, а не рахунок "на льоту" при кожному зверненні —
-- benchmarkAggregator.ts (нічний cron) читає organizations.business_size
-- напряму без додаткового count(*) по sites на кожну організацію платформи.

create or replace function update_organization_business_size() returns trigger as $$
declare
  target_org_id uuid;
  site_count integer;
begin
  target_org_id := coalesce(new.organization_id, old.organization_id);

  select count(*) into site_count from sites where organization_id = target_org_id;

  update organizations
  set business_size = case
    when site_count <= 1 then 'solo'
    when site_count <= 3 then 'small'
    else 'medium'
  end
  where id = target_org_id;

  return coalesce(new, old);
end;
$$ language plpgsql security definer set search_path = public;

create trigger trg_update_business_size
  after insert or delete on sites
  for each row execute function update_organization_business_size();

-- ── benchmark_snapshots ──────────────────────────────────────────────
-- Знеособлені знімки метрик по організаціях. НЕМАЄ organization_id —
-- це навмисно (див. коментар на початку файлу).

create table benchmark_snapshots (
  id uuid primary key default gen_random_uuid(),
  industry text,
  country text,
  business_size text,
  metric text not null,        -- 'speed_ms' | 'conversion_rate' | 'article_length'
  value real not null,
  captured_at timestamptz not null default now()
);

comment on table benchmark_snapshots is
  'Знеособлені знімки метрик для Benchmarking (MODULE_ROADMAP.md розділ 15). Записується виключно worker''ом (benchmarkAggregator.ts, нічний cron) з уже наявних таблиць модулів (speed_checks, cro_daily_stats, ai_generations) — не новий збір даних, переиспользование. Свідомо без organization_id — знеособлення в момент запису, не читання.';

create index benchmark_snapshots_lookup_idx on benchmark_snapshots(industry, metric, captured_at);
create index benchmark_snapshots_country_idx on benchmark_snapshots(country, metric, captured_at);
create index benchmark_snapshots_size_idx on benchmark_snapshots(business_size, metric, captured_at);

-- RLS: benchmark_snapshots не містить organization_id, тож "власного"
-- рядка немає в принципі — читання тільки агреговане (percent_rank()
-- в benchmarkHandler.ts через service role), пряме читання таблиці
-- з клієнта не потрібне жодній ролі окрім platform_admin (діагностика).

alter table benchmark_snapshots enable row level security;

create policy "benchmark_snapshots_select_admin_only" on benchmark_snapshots
  for select using (is_platform_admin());

-- ── Реєстрація модуля в platform_modules ──────────────────────────────
-- sort_order 120 — свідомо після 110 (там уже колізія translator/commerce,
-- задокументована в EXECUTION_PLAN.md, не чіпаємо в цій міграції).

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('benchmark', 'Benchmarking', 'Порівняння метрик вашого бізнесу з ринком (швидкість, конверсія, контент)', 'BarChart2', '/dashboard/benchmark', 'coming_soon', 120)
on conflict (key) do nothing;
