-- 0034_team_invites.sql
-- Мульти-користувачі / ролі в організації: запрошення тимейтів.
-- Виконувати ПІСЛЯ 0033_extend_member_role_enum.sql (в окремій транзакції,
-- інакше Postgres кине "unsafe use of new value" на 'editor'/'viewer').
--
-- Доступно з Growth+ плану (перевіряється на рівні API/UI, не в БД —
-- зміна плану не повинна миттєво ламати вже запрошених учасників).

-- ------------------------------------------------------------
-- organization_invites — запрошення, що очікують прийняття
-- ------------------------------------------------------------

create type invite_status as enum ('pending', 'accepted', 'revoked', 'expired');

create table organization_invites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role member_role not null default 'editor',
  invited_by uuid not null references profiles(id) on delete cascade,
  token uuid not null default gen_random_uuid(), -- унікальний токен для посилання-запрошення
  status invite_status not null default 'pending',
  expires_at timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  -- Один активний (pending) інвайт на email в межах організації —
  -- запобігає дублюванню при повторному натисканні "Запросити".
  -- Часткова (partial) constraint неможлива через UNIQUE, тому
  -- перевірку "тільки один pending" робимо на рівні застосунку
  -- (fixRequestHandler-подібний handler перевіряє перед insert).
  constraint uq_org_invite_email unique (organization_id, email)
);

comment on table organization_invites is 'Запрошення тимейтів в організацію. Приймається через /invite/:token — при реєстрації або вході існуючим акаунтом користувач приєднується до organization_id замість створення власної організації.';

create index idx_org_invites_token on organization_invites(token);
create index idx_org_invites_email on organization_invites(email);
create index idx_org_invites_org on organization_invites(organization_id);

-- ------------------------------------------------------------
-- RLS: власники/адміни бачать і створюють запрошення для своєї
-- організації. Прийняття запрошення (update status) робиться виключно
-- через service_role (worker endpoint), бо на момент прийняття у
-- користувача може ще не бути organization_id в user_organization_ids().
-- ------------------------------------------------------------

alter table organization_invites enable row level security;

create policy "Owners/admins can view own organization invites"
  on organization_invites for select
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
    or is_platform_admin()
  );

create policy "Owners/admins can create invites for own organization"
  on organization_invites for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Owners/admins can revoke own organization invites"
  on organization_invites for update
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ------------------------------------------------------------
-- RLS на organization_members: дозволяємо owner/admin видаляти учасників
-- (видалення з команди) і оновлювати роль. Раніше на цій таблиці була
-- лише SELECT-політика.
-- ------------------------------------------------------------

create policy "Owners/admins can update member roles"
  on organization_members for update
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "Owners/admins can remove members"
  on organization_members for delete
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
    -- Власника (owner) видалити не можна навіть іншому owner/admin —
    -- перевіряється додатково на рівні API (RLS сам це не блокує,
    -- бо тут немає доступу до OLD.role в USING).
  );

-- ------------------------------------------------------------
-- Оновлюємо handle_new_user(): якщо на email нового користувача є
-- pending-запрошення — приєднуємо його до тієї організації замість
-- створення нової. Приймається ПЕРШЕ (найстаріше) pending-запрошення,
-- якщо їх раптом декілька з різних організацій.
-- ------------------------------------------------------------

create or replace function handle_new_user()
returns trigger as $$
declare
  new_org_id    uuid;
  trial_plan_id uuid;
  pending_invite record;
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
    -- Приєднуємось до організації, що запросила — власну не створюємо
    insert into public.organization_members (organization_id, user_id, role)
    values (pending_invite.organization_id, new.id, pending_invite.role);

    update public.organization_invites
    set status = 'accepted', accepted_at = now()
    where id = pending_invite.id;

    return new;
  end if;

  -- Немає запрошення — звичайна реєстрація, створюємо власну організацію
  insert into public.organizations (name, org_type, site_limit)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'client',
    1
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

-- ------------------------------------------------------------
-- Ужорсточення RLS для sites: viewer має бачити все, але не може
-- створювати/змінювати/видаляти сайти. Раніше insert/update/delete
-- перевіряли лише членство в організації (organization_id in
-- user_organization_ids()), без урахування ролі — будь-хто, включно з
-- viewer, технічно міг напряму через Supabase client додати чи видалити
-- сайт. SELECT-політику не чіпаємо — перегляд лишається доступним усім
-- ролям.
-- ------------------------------------------------------------

drop policy if exists "Members can insert sites for own organization" on sites;
drop policy if exists "Members can update own sites" on sites;
drop policy if exists "Members can delete own sites" on sites;

create policy "Editors+ can insert sites for own organization"
  on sites for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "Editors+ can update own sites"
  on sites for update
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "Editors+ can delete own sites"
  on sites for delete
  using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );
