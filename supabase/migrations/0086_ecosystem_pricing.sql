-- ============================================================
-- QORAX — Migration 0086: Екосистемні тарифи (5 продуктів × 4
-- рівні) + фундамент Qorax One
-- ============================================================
-- Артем (липень 2026, PRICING.md Частина A) — повна заміна старої
-- лінійки Business ($49/$99/$199/$499) на нову структуру: кожен з
-- п'яти продуктів (Business/Mail/Creator/Office/Browser) має власні
-- Free/Starter/Pro/Agency тарифи ($0/$12.99/$24.99/$59.99), плюс
-- окрема надбудова Qorax One.
--
-- РІШЕННЯ (узгоджено з Артемом): старі 6 значень enum plan_code
-- (starter/growth/agency/trial/free/enterprise) НЕ перейменовуються
-- і не видаляються — лишаються в enum без використання після
-- міграції існуючих клієнтів. Причина: PostgreSQL enum-значення не
-- можна видалити без перестворення типу (усі FK на plans.code через
-- ...), а 16+ worker-хендлерів (crmHandler/socialHandler/
-- lemonSqueezyWebhook/тощо) з жорстко закодованими старими кодами
-- переписуються ОКРЕМИМ наступним проходом — вони не мають зламатись
-- ще до того, як будуть готові читати нові коди.
--
-- Нові коди — формат {product}_{tier}: business_free,
-- business_starter, business_pro, business_agency, mail_free, ...
-- (20 нових рядків, 5 продуктів × 4 рівні).
--
-- ПОСТГРЕС ОБМЕЖЕННЯ: нове enum-значення не можна використати в тій
-- самій транзакції, де воно створене (той самий патерн, що вже
-- задокументовано в 0018_trial_and_free_plan.sql). ЗАПУСКАТИ ТРИ
-- ОКРЕМІ ЗАПИТИ В SQL EDITOR:
--   Запит 1: ALTER TYPE (20 нових значень plan_code) + нова колонка
--            plans.product + новий enum product_key
--   Запит 2: INSERT 20 нових рядків у plans + зміна constraint
--            subscriptions (одна підписка на organization+product,
--            не на organization) + нова таблиця qorax_one_subscriptions
--   Запит 3: оновлення handle_new_user() — нова організація одразу
--            отримує business_free (не trial/legacy free)
-- ============================================================

-- ═══ ЗАПИТ 1 ═══ (виконати окремо, потім Run знову для запиту 2)

create type product_key as enum ('business', 'mail', 'creator', 'office', 'browser');

-- ВІДОМА НЕВІДПОВІДНІСТЬ (свідомо не виправляється цим проходом):
-- ai_product_toggles.product (0082) — це `text` з CHECK-обмеженням
-- на ті самі 5 значень, не цей enum. Два різні представлення того
-- самого поняття "продукт" у схемі. Не уніфіковано зараз, бо
-- ai_product_toggles.product вже використовується в
-- worker/src/lib/aiCredits.ts через PostgREST text-порівняння
-- (product=eq.${product}) — зміна типу на enum вимагає окремої
-- перевірки сумісності PostgREST-запитів і не є метою цієї міграції.

alter table plans add column if not exists product product_key;
comment on column plans.product is
  'NULL для старих (legacy) рядків starter/growth/agency/trial/free/enterprise — вони product-agnostic (фактично завжди означали Business). Нові рядки (0086+) завжди мають product заповнений.';

alter type plan_code add value if not exists 'business_free';
alter type plan_code add value if not exists 'business_starter';
alter type plan_code add value if not exists 'business_pro';
alter type plan_code add value if not exists 'business_agency';
alter type plan_code add value if not exists 'mail_free';
alter type plan_code add value if not exists 'mail_starter';
alter type plan_code add value if not exists 'mail_pro';
alter type plan_code add value if not exists 'mail_agency';
alter type plan_code add value if not exists 'creator_free';
alter type plan_code add value if not exists 'creator_starter';
alter type plan_code add value if not exists 'creator_pro';
alter type plan_code add value if not exists 'creator_agency';
alter type plan_code add value if not exists 'office_free';
alter type plan_code add value if not exists 'office_starter';
alter type plan_code add value if not exists 'office_pro';
alter type plan_code add value if not exists 'office_agency';
alter type plan_code add value if not exists 'browser_free';
alter type plan_code add value if not exists 'browser_starter';
alter type plan_code add value if not exists 'browser_pro';
alter type plan_code add value if not exists 'browser_agency';

-- site_limit має сенс лише для Business (кількість сайтів під
-- моніторингом) — для Mail/Creator/Office/Browser це поле не
-- застосовне взагалі (їхні ліміти — mailbox_limit/project_limit/
-- document_limit/saved_pages_limit, усі в features jsonb). Було
-- `not null` під стару модель "один продукт = завжди Business";
-- послаблюємо до nullable замість вигаданого фіктивного значення.
alter table plans alter column site_limit drop not null;


-- ═══ ЗАПИТ 2 ═══ (виконати після запиту 1)

-- ─── Business (заміна старої лінійки $49/$99/$199/$499) ────────
-- features jsonb навмисно НЕ повторює старі флаги 1:1 (uptime_monitoring
-- тощо) — ті прив'язані до старої лінійки й переписуються разом з
-- 16 worker-хендлерами в наступному проході. Тут — нові ключі, що
-- відповідають PRICING.md Частина A дослівно (site_limit/project_limit/
-- monitoring_interval_minutes/rank_keywords_limit/analytics_history_days/
-- ai_requests_limit), плюс булеві прапори для якісних фіч.
insert into plans (code, product, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'business_free', 'business', 'Business Free', 0.00, 1, null,
  '{
    "project_limit": 1,
    "monitoring_interval_minutes": 1440,
    "rank_keywords_limit": 20,
    "analytics_history_days": 30,
    "ai_requests_limit": 20,
    "telegram_bot": true,
    "basic_reports": true,
    "pdf_reports": false,
    "integrations": false,
    "automations": false,
    "white_label": false,
    "api_access": false,
    "ai_copilot": false,
    "telegram_ai_assistant": false,
    "team_seats": 1
  }'::jsonb
),
(
  'business_starter', 'business', 'Business Starter', 12.99, 10, null,
  '{
    "project_limit": 50,
    "monitoring_interval_minutes": 30,
    "rank_keywords_limit": 500,
    "analytics_history_days": 180,
    "ai_requests_limit": 500,
    "telegram_bot": true,
    "basic_reports": true,
    "pdf_reports": true,
    "integrations": true,
    "automations": true,
    "white_label": false,
    "api_access": false,
    "ai_copilot": false,
    "telegram_ai_assistant": false,
    "team_seats": 1
  }'::jsonb
),
(
  'business_pro', 'business', 'Business Pro', 24.99, 100, null,
  '{
    "project_limit": -1,
    "monitoring_interval_minutes": 5,
    "rank_keywords_limit": 5000,
    "analytics_history_days": 730,
    "ai_requests_limit": 5000,
    "telegram_bot": true,
    "basic_reports": true,
    "pdf_reports": true,
    "integrations": true,
    "automations": true,
    "white_label": true,
    "api_access": true,
    "ai_copilot": true,
    "telegram_ai_assistant": true,
    "team_seats": 5
  }'::jsonb
),
(
  'business_agency', 'business', 'Business Agency', 59.99, -1, 0,
  '{
    "project_limit": -1,
    "monitoring_interval_minutes": 1,
    "rank_keywords_limit": -1,
    "analytics_history_days": -1,
    "ai_requests_limit": 25000,
    "telegram_bot": true,
    "basic_reports": true,
    "pdf_reports": true,
    "integrations": true,
    "automations": true,
    "white_label": true,
    "api_access": true,
    "ai_copilot": true,
    "telegram_ai_assistant": true,
    "team_seats": 25,
    "priority_compute": true,
    "priority_support": true
  }'::jsonb
);

-- ─── Mail ────────────────────────────────────────────────────
insert into plans (code, product, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'mail_free', 'mail', 'Mail Free', 0.00, null, null,
  '{"mailbox_limit": 1, "ai_requests_limit": 20, "basic_templates": true, "simple_rules": true, "auto_reply": false, "scheduler": false, "shared_inboxes": false, "broadcasts": false, "team_seats": 1}'::jsonb
),
(
  'mail_starter', 'mail', 'Mail Starter', 12.99, null, null,
  '{"mailbox_limit": 5, "ai_requests_limit": 500, "basic_templates": true, "simple_rules": true, "auto_reply": true, "scheduler": true, "shared_inboxes": false, "broadcasts": false, "team_seats": 1}'::jsonb
),
(
  'mail_pro', 'mail', 'Mail Pro', 24.99, null, null,
  '{"mailbox_limit": -1, "ai_requests_limit": 5000, "basic_templates": true, "simple_rules": true, "auto_reply": true, "scheduler": true, "shared_inboxes": true, "broadcasts": true, "team_seats": 5}'::jsonb
),
(
  'mail_agency', 'mail', 'Mail Agency', 59.99, null, null,
  '{"mailbox_limit": -1, "ai_requests_limit": 25000, "basic_templates": true, "simple_rules": true, "auto_reply": true, "scheduler": true, "shared_inboxes": true, "broadcasts": true, "team_seats": 25}'::jsonb
);

-- ─── Creator ─────────────────────────────────────────────────
insert into plans (code, product, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'creator_free', 'creator', 'Creator Free', 0.00, null, null,
  '{"project_limit": 3, "ai_requests_limit": 20, "basic_templates": true, "export_png_jpg": true, "export_svg_pdf": false, "brand_kit": false, "collaboration": false, "premium_assets": false, "team_seats": 1}'::jsonb
),
(
  'creator_starter', 'creator', 'Creator Starter', 12.99, null, null,
  '{"project_limit": 50, "ai_requests_limit": 500, "basic_templates": true, "export_png_jpg": true, "export_svg_pdf": true, "brand_kit": true, "collaboration": false, "premium_assets": false, "team_seats": 1}'::jsonb
),
(
  'creator_pro', 'creator', 'Creator Pro', 24.99, null, null,
  '{"project_limit": -1, "ai_requests_limit": 5000, "basic_templates": true, "export_png_jpg": true, "export_svg_pdf": true, "brand_kit": true, "collaboration": true, "premium_assets": true, "team_seats": 5}'::jsonb
),
(
  'creator_agency', 'creator', 'Creator Agency', 59.99, null, null,
  '{"project_limit": -1, "ai_requests_limit": 25000, "basic_templates": true, "export_png_jpg": true, "export_svg_pdf": true, "brand_kit": true, "collaboration": true, "premium_assets": true, "team_seats": 25}'::jsonb
);

-- ─── Office ──────────────────────────────────────────────────
insert into plans (code, product, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'office_free', 'office', 'Office Free', 0.00, null, null,
  '{"document_limit": 20, "ai_requests_limit": 20, "export_pdf": true, "unlimited_documents": false, "collaboration": false, "version_history": false, "company_templates": false, "advanced_export": false, "team_seats": 1}'::jsonb
),
(
  'office_starter', 'office', 'Office Starter', 12.99, null, null,
  '{"document_limit": -1, "ai_requests_limit": 500, "export_pdf": true, "unlimited_documents": true, "collaboration": true, "version_history": true, "company_templates": false, "advanced_export": false, "team_seats": 1}'::jsonb
),
(
  'office_pro', 'office', 'Office Pro', 24.99, null, null,
  '{"document_limit": -1, "ai_requests_limit": 5000, "export_pdf": true, "unlimited_documents": true, "collaboration": true, "version_history": true, "company_templates": true, "advanced_export": true, "team_seats": 5}'::jsonb
),
(
  'office_agency', 'office', 'Office Agency', 59.99, null, null,
  '{"document_limit": -1, "ai_requests_limit": 25000, "export_pdf": true, "unlimited_documents": true, "collaboration": true, "version_history": true, "company_templates": true, "advanced_export": true, "team_seats": 25}'::jsonb
);

-- ─── Browser ─────────────────────────────────────────────────
insert into plans (code, product, name, price_usd, site_limit, extra_site_price_usd, features) values
(
  'browser_free', 'browser', 'Browser Free', 0.00, null, null,
  '{"saved_pages_limit": 100, "ai_requests_limit": 20, "ai_sidebar": true, "seo_analysis": true, "unlimited_collections": false, "advanced_seo_analysis": false, "sync": false, "shared_workspaces": false, "team_seats": 1}'::jsonb
),
(
  'browser_starter', 'browser', 'Browser Starter', 12.99, null, null,
  '{"saved_pages_limit": -1, "ai_requests_limit": 500, "ai_sidebar": true, "seo_analysis": true, "unlimited_collections": true, "advanced_seo_analysis": true, "sync": true, "shared_workspaces": false, "team_seats": 1}'::jsonb
),
(
  'browser_pro', 'browser', 'Browser Pro', 24.99, null, null,
  '{"saved_pages_limit": -1, "ai_requests_limit": 5000, "ai_sidebar": true, "seo_analysis": true, "unlimited_collections": true, "advanced_seo_analysis": true, "sync": true, "shared_workspaces": true, "team_seats": 5}'::jsonb
),
(
  'browser_agency', 'browser', 'Browser Agency', 59.99, null, null,
  '{"saved_pages_limit": -1, "ai_requests_limit": 25000, "ai_sidebar": true, "seo_analysis": true, "unlimited_collections": true, "advanced_seo_analysis": true, "sync": true, "shared_workspaces": true, "team_seats": 25}'::jsonb
);

-- ─── Constraint: одна активна підписка на organization+product ──
-- Стара гарантія (0002) — "одна активна підписка на organization
-- ЦІЛОМ" — фізично несумісна з ідеєю, що одна organization тепер
-- може мати окремі підписки на Business, Mail, Creator одночасно
-- (кожен продукт монетизується незалежно). Замінюємо на композитний
-- unique index по (organization_id, product_of(plan_id)).
--
-- PostgreSQL не дозволяє unique index по виразу з підзапитом напряму
-- в частковому індексі так само просто, як по колонці — тому
-- зберігаємо product ПОРЯД у subscriptions як денормалізовану
-- колонку (синхронізовану тригером), а не через plans-джойн у
-- самому індексі. Це свідомий компроміс: невеликий бридж дублювання
-- заради простого й швидкого partial unique index.
alter table subscriptions add column if not exists product product_key;

-- Backfill для вже існуючих рядків — тригер нижче спрацьовує лише
-- на НОВИХ insert/update, історичні рядки (легасі-підписки на
-- starter/growth/agency/тощо) інакше лишились би з product=NULL
-- назавжди, хоча plans.product для них теж NULL (legacy-плани без
-- product) — тому цей backfill фактично no-op для існуючих
-- легасі-підписок (усі вже мають product=NULL і після backfill),
-- але стає значущим одразу, як тільки якась організація перейде на
-- новий {product}_{tier} план.
update subscriptions s
set product = p.product
from plans p
where s.plan_id = p.id;

create or replace function sync_subscription_product()
returns trigger as $$
begin
  select product into new.product from plans where id = new.plan_id;
  return new;
end;
$$ language plpgsql;

create trigger trg_subscriptions_sync_product
  before insert or update of plan_id on subscriptions
  for each row execute function sync_subscription_product();

-- Старий частковий unique index (одна підписка на organization
-- ЦІЛОМ) видаляємо — конфліктує з ідеєю мульти-продуктових підписок.
drop index if exists idx_subscriptions_one_active_per_org;

-- Новий: одна активна підписка на organization+product. Для
-- легасі-підписок (product IS NULL, старі starter/growth/agency/
-- trial/free/enterprise рядки) індекс все одно захищає — NULL
-- трактується як "усі NULL відрізняються" в стандартному unique
-- index PostgreSQL, тому легасі-організації з product=NULL НЕ
-- отримують гарантію унікальності через цей індекс. Це прийнятно:
-- легасі-підписки й так обмежені старою логікою одна-на-organization
-- на рівні коду (worker перевіряє наявність активної підписки перед
-- створенням нової), доки не мігровані на нові product-aware коди.
create unique index idx_subscriptions_one_active_per_org_product
  on subscriptions(organization_id, product)
  where status in ('trialing', 'active', 'past_due') and product is not null;

comment on column subscriptions.product is
  'Денормалізовано з plans.product через тригер sync_subscription_product — потрібно для partial unique index (одна активна підписка на organization+product). NULL для легасі-підписок (плани без product).';

-- ─── Qorax One — окрема сутність, не рядок у plans ──────────────
-- Свідомо ОКРЕМА таблиця, не ще один "продукт" у enum product_key:
-- Qorax One не прив'язаний до одного продукту, а замінює/поглинає
-- підписки одразу на всі п'ять. Один активний Qorax One на
-- organization дає доступ до всіх п'яти продуктів на відповідному
-- рівні (One Starter = Starter-рівень у кожному продукті, і т.д.) —
-- перевірка доступу (worker) має спершу дивитись, чи є активний
-- qorax_one_subscriptions рядок, і якщо так — використовувати ЙОГО
-- tier замість шукати окрему subscriptions на конкретний продукт.
create type qorax_one_tier as enum ('one_starter', 'one_pro', 'one_agency');

create table qorax_one_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  tier qorax_one_tier not null,
  status subscription_status not null default 'incomplete',
  ls_subscription_id text unique,
  ls_customer_id text,
  ls_variant_id text,
  ls_customer_portal_url text,
  ai_requests_limit integer not null,
  ai_requests_used integer not null default 0,
  credits_reset_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table qorax_one_subscriptions is
  'Головна підписка екосистеми (PRICING.md Частина A) — дає доступ до всіх п''яти продуктів одразу на рівні tier, замінює окремі subscriptions на кожен продукт. ai_requests_limit/used — спільний AI Pool для всієї екосистеми (окремий від ai_credits, який лишається per-organization пулом для Business-специфічних AI-викликів до повного переходу).';

create unique index idx_qorax_one_one_active_per_org on qorax_one_subscriptions(organization_id)
  where status in ('trialing', 'active', 'past_due');

create index idx_qorax_one_ls_customer on qorax_one_subscriptions(ls_customer_id);

create trigger trg_qorax_one_updated_at
  before update on qorax_one_subscriptions
  for each row execute function set_updated_at();

alter table qorax_one_subscriptions enable row level security;

-- Лише SELECT — insert/update виконує ВИКЛЮЧНО LemonSqueezy webhook
-- через service-role (обходить RLS повністю), той самий підхід, що
-- subscriptions (0002) — організація ніколи не пише в цю таблицю
-- напряму з Dashboard, лише читає власний статус підписки.
create policy "qorax_one_select_own_org" on qorax_one_subscriptions
  for select using (organization_id in (select user_organization_ids()) or is_platform_admin());


-- ═══ ЗАПИТ 3 ═══ (виконати після запиту 2)

-- Нова організація одразу отримує business_free (не legacy trial/free)
-- — Free-тір тепер повноцінний постійний рівень, не 14-денний trial
-- перед примусовим downgrade. handle_new_user() востаннє
-- перевизначалась у 0035_referrals.sql (pending team invites +
-- referral code attribution) — ЦЯ версія копіює ВСЮ ту логіку
-- дослівно, змінюючи ЛИШЕ блок призначення підписки (trial →
-- business_free, без trial_ends_at). Попередня чернетка цієї міграції
-- помилково відкинула invite/referral-логіку, повністю переписавши
-- функцію з нуля за зразком застарілої 0018-версії — виправлено
-- перед комітом звіркою з 0035, останньою реальною версією.
create or replace function handle_new_user()
returns trigger as $$
declare
  new_org_id        uuid;
  free_plan_id      uuid;
  pending_invite    record;
  ref_code          text;
  referrer_org_id   uuid;
  new_referral_code text;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');

  -- Чи є pending-запрошення на цей email?
  select * into pending_invite
  from public.organization_invites
  where email = new.email
    and status = 'pending'
    and expires_at > now()
  order by created_at asc
  limit 1;

  if pending_invite.id is not null then
    -- Приєднуємось до організації, що запросила — власну не створюємо.
    -- Реферальна атрибуція тут не застосовується: людина приєднується
    -- до чужої організації як тимейт, а не створює власний платний акаунт.
    insert into public.organization_members (organization_id, user_id, role)
    values (pending_invite.organization_id, new.id, pending_invite.role);

    update public.organization_invites
    set status = 'accepted', accepted_at = now()
    where id = pending_invite.id;

    return new;
  end if;

  -- Реферальний код міг прийти через user_metadata при реєстрації
  -- (передається з cookie /r/:code на фронтенді в signUp options.data)
  ref_code := lower(trim(new.raw_user_meta_data->>'referral_code'));
  if ref_code is not null and ref_code != '' then
    select id into referrer_org_id
    from public.organizations
    where referral_code = ref_code
    limit 1;
  end if;

  -- Генеруємо унікальний referral_code для нової організації одразу
  new_referral_code := lower(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 8));

  -- Немає запрошення — звичайна реєстрація, створюємо власну організацію
  insert into public.organizations (name, org_type, site_limit, referral_code, referred_by_org_id, referred_at)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'client',
    1,
    new_referral_code,
    referrer_org_id,
    case when referrer_org_id is not null then now() else null end
  )
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  -- Одразу business_free, назавжди (не trial з примусовим downgrade,
  -- без trial_ends_at — Free-тір не спливає)
  select id into free_plan_id from public.plans where code = 'business_free' limit 1;

  if free_plan_id is not null then
    insert into public.subscriptions (organization_id, plan_id, status)
    values (new_org_id, free_plan_id, 'active');
  end if;

  return new;
end;
$$ language plpgsql security definer;
