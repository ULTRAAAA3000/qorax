-- 0053_security_audit_log.sql
-- Фаза 0.5 з EXECUTION_PLAN.md / SECURITY.md розділ 8. Закриває
-- прогалину: видалення ресурсів і зміна ролей не логувались ніде,
-- крім самого факту зміни в таблиці (без історії). Пріоритет цього
-- TODO зростав з наближенням до Commerce (гроші клієнта) — таблиця
-- створюється зараз, ДО того, як Commerce почне писати перші
-- замовлення, за рекомендацією SECURITY.md.

create table security_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references organizations(id) on delete set null,
  actor_user_id uuid references profiles(id) on delete set null,
  action_type text not null, -- 'member_role_changed' | 'member_removed' | 'order_deleted' | 'organization_deleted' | ...
  target_table text,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

comment on table security_audit_log is 'Зведений лог чутливих дій (SECURITY.md розділ 8). organization_id — on delete SET NULL, не CASCADE: якщо організацію видалено, лог про ЇЇ видалення має пережити сам факт видалення (інакше при видаленні організації одразу зникає доказ, що воно взагалі відбулось). Те саме для actor_user_id — лог не повинен зникати, якщо користувача згодом видалили.';

create index idx_security_audit_log_organization on security_audit_log(organization_id, created_at desc);
create index idx_security_audit_log_actor on security_audit_log(actor_user_id) where actor_user_id is not null;

-- ============================================================
-- RLS — тільки SELECT для owner/admin своєї організації + platform
-- admin. INSERT — виключно service role (Worker), немає policy для
-- authenticated (відсутність policy для дії = заборонено для всіх,
-- крім service role, той самий патерн, що cro_events у 0048).
-- ============================================================

alter table security_audit_log enable row level security;

create policy "security_audit_log_select_own_org" on security_audit_log
  for select using (
    is_platform_admin() or
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
