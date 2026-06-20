-- ============================================================
-- QORAX — Патч для "осиротевших" аккаунтов (без organization)
-- ============================================================
-- ВАЖНО: сначала выполни supabase/migrations/0012_fix_signup_insert_policies.sql,
-- иначе новые регистрации будут продолжать падать.
--
-- Этот скрипт находит всех пользователей, у которых есть profile,
-- но нет organization_members (т.е. они попали в "вилку" бага RLS:
-- зарегистрировались, но organization не создалась), и чинит их —
-- создаёт organization + делает их owner.
--
-- Безопасно запускать повторно: пользователи, у которых organization
-- уже есть, пропускаются (where not exists).
-- ============================================================

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

-- Проверка результата — должно быть 0 строк после успешного фикса
select u.email, p.full_name
from auth.users u
join profiles p on p.id = u.id
where not exists (
  select 1 from organization_members om where om.user_id = u.id
);
