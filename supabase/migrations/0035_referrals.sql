-- 0035_referrals.sql
-- Реферальна система для фрілансер-партнерств: власна атрибуція в Qorax
-- (реф-посилання ведуть на наш сайт, весь трекінг у нашій БД), виплати
-- поки що ручні (переказом), автоматизація через LemonSqueezy/Wise —
-- окреме завдання на майбутнє, коли обсяг виправдає.
--
-- Механіка: кожна організація має унікальний referral_code. Новий
-- користувач, що прийшов за посиланням /r/:code, зберігає код в cookie;
-- при реєстрації організація-новачок отримує referred_by_org_id.
-- Коли реферал платить (LemonSqueezy subscription_payment_success)
-- протягом REFERRAL_ATTRIBUTION_WINDOW_DAYS (30) від моменту реєстрації —
-- нараховуємо комісію партнеру. Це вікно навмисно тільки для першого
-- платежу (не recurring на весь час підписки).

-- ------------------------------------------------------------
-- organizations: реферальний код + хто привів цю організацію
-- ------------------------------------------------------------

alter table organizations
  add column if not exists referral_code text,
  add column if not exists referred_by_org_id uuid references organizations(id) on delete set null,
  add column if not exists referred_at timestamptz;

comment on column organizations.referral_code is 'Унікальний короткий код для реферального посилання /r/:code. Генерується при створенні організації.';
comment on column organizations.referred_by_org_id is 'Хто привів цю організацію (якщо реєстрація відбулась за реф-посиланням). NULL = органічна реєстрація.';
comment on column organizations.referred_at is 'Момент реєстрації через реф-посилання — точка відліку для 30-денного вікна атрибуції комісії.';

-- Унікальність коду (без урахування регістру не потрібна — генеруємо
-- завжди в нижньому регістрі)
create unique index if not exists idx_organizations_referral_code on organizations(referral_code) where referral_code is not null;
create index if not exists idx_organizations_referred_by on organizations(referred_by_org_id) where referred_by_org_id is not null;

-- Генеруємо referral_code для вже існуючих організацій (8 символів,
-- base36 від частини UUID — коротко, читабельно, url-safe)
update organizations
set referral_code = lower(substring(replace(id::text, '-', '') from 1 for 8))
where referral_code is null;

-- ------------------------------------------------------------
-- referral_commissions — нарахування комісій за конкретні платежі
-- ------------------------------------------------------------

create type referral_commission_status as enum ('pending', 'eligible', 'paid', 'voided');

create table referral_commissions (
  id uuid primary key default gen_random_uuid(),
  -- Хто отримує комісію (партнер)
  referrer_org_id uuid not null references organizations(id) on delete cascade,
  -- За чий платіж нарахована комісія
  referred_org_id uuid not null references organizations(id) on delete cascade,
  -- LemonSqueezy ідентифікатори для трасування/уникнення дублів при
  -- повторній доставці webhook
  ls_subscription_invoice_id text not null,
  ls_subscription_id text,
  -- Сума платежу клієнта і розрахована комісія (у USD, як і LS total_usd)
  payment_amount_usd numeric(10,2) not null,
  commission_rate numeric(4,3) not null, -- напр. 0.25 = 25%
  commission_amount_usd numeric(10,2) not null,
  status referral_commission_status not null default 'pending',
  -- Нотатки адміністратора (наприклад "переказано на картку 12.07")
  admin_notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  -- Один запис комісії на один інвойс — захист від подвійного нарахування
  -- при повторній доставці webhook (LS ретраїть при не-200 відповіді)
  constraint uq_referral_commission_invoice unique (ls_subscription_invoice_id)
);

comment on table referral_commissions is 'Нарахування комісій партнерам за платежі приведених ними клієнтів. Виплата поки ручна (переказом) — статус paid проставляється вручну адміністратором.';

create index idx_referral_commissions_referrer on referral_commissions(referrer_org_id);
create index idx_referral_commissions_status on referral_commissions(status) where status in ('pending', 'eligible');

-- ------------------------------------------------------------
-- RLS: організація бачить лише свої нараховані комісії (де вона
-- referrer). Створення/оновлення — виключно через service_role
-- (webhook handler + admin panel), звичайним користувачам insert/update
-- не потрібен.
-- ------------------------------------------------------------

alter table referral_commissions enable row level security;

create policy "Members can view own referral commissions"
  on referral_commissions for select
  using (
    referrer_org_id in (select user_organization_ids())
    or is_platform_admin()
  );

-- ------------------------------------------------------------
-- Оновлюємо handle_new_user(): генеруємо referral_code для нової
-- організації одразу при створенні, і якщо реєстрація прийшла через
-- реф-посилання (referral_code переданий у user_metadata при signUp) —
-- проставляємо referred_by_org_id/referred_at.
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger as $$
declare
  new_org_id        uuid;
  trial_plan_id     uuid;
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

  select id into trial_plan_id from public.plans where code = 'trial' limit 1;

  if trial_plan_id is not null then
    insert into public.subscriptions (
      organization_id,
      plan_id,
      status,
      trial_ends_at
    )
    values (
      new_org_id,
      trial_plan_id,
      'trialing',
      now() + interval '14 days'
    );
  end if;

  return new;
end;
$$ language plpgsql security definer;
