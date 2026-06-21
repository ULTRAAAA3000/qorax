-- ============================================================
-- QORAX — Migration 0014: Создание organization через триггер на auth.users
-- ============================================================
-- НАСТОЯЩАЯ ПРИЧИНА бага из 0011/0012: signUp() в auth-actions.ts создаёт
-- organization через обычный (anon) клиент СРАЗУ после auth.signUp().
-- Если в Supabase Auth включено "Confirm email" — auth.signUp() создаёт
-- пользователя, но НЕ открывает сессию (data.session = null), хотя
-- data.user не null. Код проверял только data.user, поэтому редирект на
-- /dashboard происходил всегда — но insert в organizations выполнялся
-- БЕЗ auth.uid() (он null без сессии), и RLS-политика
-- "auth.uid() is not null" из 0012 его молча блокировала.
--
-- Поэтому ручное создание через anon-клиента в принципе ненадёжно —
-- оно зависит от того, есть ли в моменте сессия. Правильное решение:
-- создавать organization + organization_member в том же триггере
-- handle_new_user(), который уже создаёт profile — он security definer
-- и выполняется на уровне БД при INSERT в auth.users, не зависит от
-- наличия клиентской сессии и не подчиняется RLS обычных таблиц.
--
-- auth-actions.ts больше НЕ должен делать insert в organizations/
-- organization_members вручную после signUp() — это теперь делает БД.
-- ============================================================

create or replace function handle_new_user()
returns trigger as $$
declare
  new_org_id uuid;
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');

  insert into public.organizations (name, org_type, site_limit)
  values (
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    'client',
    1
  )
  returning id into new_org_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_org_id, new.id, 'owner');

  return new;
end;
$$ language plpgsql security definer;

-- Триггер trg_on_auth_user_created из 0001 уже указывает на эту функцию,
-- пересоздавать его не нужно — меняется только тело функции (create or replace).

-- ------------------------------------------------------------
-- Повторный прогон починки "осиротевших" аккаунтов — на случай если
-- между прогоном 0013 и применением этой миграции успел зарегистрироваться
-- кто-то ещё через старый (сломанный) клиентский путь.
-- Безопасно запускать повторно: where not exists пропускает тех, у кого
-- organization уже есть.
-- ------------------------------------------------------------

do $$
declare
  orphan record;
  new_org_id uuid;
begin
  for orphan in
    select u.id as user_id, u.email, p.full_name
    from auth.users u
    join profiles p on p.id = u.id
    where not exists (
      select 1 from organization_members om where om.user_id = u.id
    )
  loop
    insert into organizations (name, org_type, site_limit)
    values (
      coalesce(orphan.full_name, split_part(orphan.email, '@', 1)),
      'client',
      1
    )
    returning id into new_org_id;

    insert into organization_members (organization_id, user_id, role)
    values (new_org_id, orphan.user_id, 'owner');

    raise notice 'Fixed orphaned user: % (org_id: %)', orphan.email, new_org_id;
  end loop;
end $$;
