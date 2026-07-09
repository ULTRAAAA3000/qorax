-- 0048_cro_module.sql
-- CRO-модуль (MODULE_ROADMAP.md, розділ 9; EXECUTION_PLAN.md Фаза 2.6) —
-- четвертий і останній модуль хвилі 2 без прийняття рішення про
-- Sites-конструктор (Артем прийняв рішення: CRO зараз, Sites потім).
--
-- Найризикованіший модуль хвилі: cro_events — єдина таблиця, що росте
-- пропорційно трафіку клієнтських сайтів, а не діям користувачів Qorax
-- (на відміну від crm_notes, social_posts тощо). Тому, на відміну від
-- CRM/Social/Academy, тут з САМОГО ПОЧАТКУ (не постфактум):
--   1. Агресивний rate-limit на POST /api/cro/track (rateLimit.ts,
--      той самий механізм, що /api/audit)
--   2. TTL-архівація сирих подій — cron run-cro-aggregate згортає
--      cro_events у cro_daily_stats і видаляє сирі рядки старші 30 днів
--   3. Обмеження розміру одного batch-запиту на клієнті (снипет)
--
-- Схема — та сама, що в MODULE_ROADMAP.md розділ 9 Крок 1, БЕЗ ЗМІН у
-- назвах колонок (сумісність з чернеткою), плюс індекси для
-- продуктивності агрегації.

-- ------------------------------------------------------------
-- cro_snippets — реєстрація сайту в CRO (генерує snippet_key для
-- клієнтського тега, окремо від sites.id щоб не світити внутрішній
-- UUID організації в публічному JS на сторінці клієнта)
-- ------------------------------------------------------------

create table cro_snippets (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  snippet_key text not null default replace(gen_random_uuid()::text, '-', ''),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (site_id),
  unique (snippet_key)
);

comment on table cro_snippets is 'Реєстрація сайту в CRO. snippet_key — публічний ідентифікатор для клієнтського тега (POST /api/cro/track?key=...), окремий від site_id, щоб не розкривати внутрішній UUID організації в публічному JS на сторінці клієнта.';

create index idx_cro_snippets_site on cro_snippets(site_id);

-- ------------------------------------------------------------
-- cro_events — сирі події, найгарячіша таблиця системи
-- ------------------------------------------------------------

create table cro_events (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  event_type text not null,
  element_selector text,
  session_id text not null,
  occurred_at timestamptz not null default now(),
  constraint cro_events_type_check check (event_type in ('pageview', 'cta_click', 'form_start', 'form_submit', 'scroll_depth'))
);

comment on table cro_events is 'Сирі поведінкові події з клієнтського сніпета. Найбільша за обсягом таблиця системи — видаляється cron-ом run-cro-aggregate після агрегації в cro_daily_stats (зберігаємо сирі події лише 30 днів, не безстроково).';

-- Композитний індекс під запит агрегації (site_id + occurred_at) і
-- під видалення старих рядків. НЕ партиціонування (roadmap згадує
-- як варіант) — свідомо простіше рішення для MVP: TTL-видалення
-- через cron достатньо, поки обсяг не виправдовує складність
-- партиціонування по датах.
create index idx_cro_events_site_occurred on cro_events(site_id, occurred_at);
create index idx_cro_events_session on cro_events(session_id);

-- ------------------------------------------------------------
-- cro_daily_stats — денна агрегація (те, що реально показує UI)
-- ------------------------------------------------------------

create table cro_daily_stats (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  date date not null,
  visitors integer not null default 0,
  cta_clicks integer not null default 0,
  form_starts integer not null default 0,
  form_submits integer not null default 0,
  conversion_rate numeric,
  unique (site_id, page_url, date)
);

comment on table cro_daily_stats is 'Денна агрегація cro_events по сторінці. conversion_rate = form_submits/visitors*100, рахується в cron при агрегації.';

create index idx_cro_daily_stats_site_date on cro_daily_stats(site_id, date);

-- ------------------------------------------------------------
-- cro_ab_tests — A/B-тести (схема готова наперед, roadmap Крок 5:
-- "AI-рекомендації і A/B-тести — друга ітерація, MVP може жити без
-- них" — таблицю створюємо зараз аби не переносити міграцію пізніше,
-- але worker-логіки запуску тестів у цьому проході НЕМАЄ)
-- ------------------------------------------------------------

create table cro_ab_tests (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  variant_a jsonb not null,
  variant_b jsonb not null,
  status text not null default 'running',
  winner text,
  created_at timestamptz not null default now(),
  constraint cro_ab_tests_status_check check (status in ('running', 'completed', 'stopped')),
  constraint cro_ab_tests_winner_check check (winner is null or winner in ('a', 'b'))
);

comment on table cro_ab_tests is 'A/B-тести. Схема готова, worker-логіка запуску/визначення переможця — НЕ реалізована в MVP (roadmap Крок 5 явно дозволяє це відкласти).';

create index idx_cro_ab_tests_site on cro_ab_tests(site_id);

-- ------------------------------------------------------------
-- Реєстрація в platform_modules
-- ------------------------------------------------------------

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('cro', 'CRO', 'Воронка конверсії: перегляди → CTA → форма → відправка', 'Target', '/dashboard/cro', 'coming_soon', 100)
on conflict (key) do nothing;

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4 / 0043_crm_module.sql
-- ============================================================

alter table cro_snippets enable row level security;
alter table cro_events enable row level security;
alter table cro_daily_stats enable row level security;
alter table cro_ab_tests enable row level security;

-- cro_snippets: select/insert/update — editor+ через sites.organization_id
-- (немає прямого organization_id, приєднуємось через sites)

create policy "cro_snippets_select_own_org" on cro_snippets
  for select using (
    is_platform_admin() or
    site_id in (select id from sites where organization_id in (select user_organization_ids()))
  );

create policy "cro_snippets_insert_own_org" on cro_snippets
  for insert with check (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "cro_snippets_update_own_org" on cro_snippets
  for update using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

-- cro_events: тільки select для власників сайту (запис — виключно через
-- POST /api/cro/track з service role, публічний ендпоінт без юзерського
-- JWT — немає сенсу в insert policy для авторизованих юзерів)

create policy "cro_events_select_own_org" on cro_events
  for select using (
    is_platform_admin() or
    site_id in (select id from sites where organization_id in (select user_organization_ids()))
  );

-- cro_daily_stats: тільки select, наповнюється лише cron-ом (service role)

create policy "cro_daily_stats_select_own_org" on cro_daily_stats
  for select using (
    is_platform_admin() or
    site_id in (select id from sites where organization_id in (select user_organization_ids()))
  );

-- cro_ab_tests: select/insert/update — editor+ (той самий патерн, що cro_snippets).
-- INSERT дозволено на рівні RLS вже зараз, хоча worker-ендпоінта створення
-- тесту в MVP немає (roadmap Крок 5) — це не суперечність: RLS визначає
-- МОЖЛИВІСТЬ дії, worker визначає ЩО реально доступне через API. Коли
-- з'явиться ендпоінт створення A/B-тесту, RLS вже готовий, міграцію
-- переробляти не треба.

create policy "cro_ab_tests_select_own_org" on cro_ab_tests
  for select using (
    is_platform_admin() or
    site_id in (select id from sites where organization_id in (select user_organization_ids()))
  );

create policy "cro_ab_tests_insert_own_org" on cro_ab_tests
  for insert with check (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "cro_ab_tests_update_own_org" on cro_ab_tests
  for update using (
    site_id in (
      select s.id from sites s
      join organization_members om on om.organization_id = s.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );
