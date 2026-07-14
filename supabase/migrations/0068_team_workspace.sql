-- 0068_team_workspace.sql
-- Team Workspace (концептуальний документ "AI Business Operating
-- System" — п'ять напрямків: AI OS, Team Workspace, Knowledge Graph,
-- Benchmarking, Predictive AI). Це MVP-фундамент для Team Workspace:
-- задачі команди (людям, не AI), коментарі до різних сутностей,
-- activity feed. Approval Flow і повний Workspace Dashboard —
-- наступні кроки поверх цього фундаменту, не ця міграція.
--
-- НАВМИСНО НЕ зроблено (рішення, не недогляд):
-- - Нові ролі (Manager/SEO Specialist/Content Manager/Developer/
--   Sales з концептуального документа) — SECURITY.md явно фіксує
--   4 ролі (owner/admin/editor/viewer) як достатні, розширення
--   переліку ролей — окреме архітектурне рішення, не приймається
--   мовчки цією міграцією
-- - Окремий рівень Workspace між organization і project/site —
--   DATA_MODEL.md розділ 2 явно це відхилив ("нікому не потрібно
--   кілька робочих просторів всередині однієї організації" на
--   поточному етапі). "Team Workspace" тут — назва ФУНКЦІОНАЛЬНОСТІ
--   (спільний робочий стіл команди), не нова сутність в ієрархії
--   organization → sites/projects.

-- ------------------------------------------------------------
-- team_tasks — задачі команди (людям). ОКРЕМА таблиця від ai_tasks
-- (0049_qorax_ai_hub.sql) — та прив'язана до agent_id/agent_run_id,
-- це для AI-агентів; team_tasks — для людей, з призначенням
-- конкретному учаснику організації.
-- ------------------------------------------------------------

create table team_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo', -- todo | in_progress | done
  assignee_id uuid references profiles(id) on delete set null,
  created_by uuid references profiles(id) on delete set null,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_tasks_status_check check (status in ('todo', 'in_progress', 'done'))
);

comment on table team_tasks is 'Задачі команди — призначаються конкретному учаснику organization_members. Окремо від ai_tasks (agent-задачі) навмисно: різна природа (людина виконує вручну, не agent_run).';

create index idx_team_tasks_org on team_tasks(organization_id, created_at desc);
create index idx_team_tasks_assignee on team_tasks(assignee_id) where assignee_id is not null;

create trigger trg_team_tasks_updated_at
  before update on team_tasks
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- team_comments — коментарі до різних сутностей (сторінок, звітів,
-- лідів, товарів, статей — за задумом концептуального документа).
-- Поліморфна прив'язка через target_table/target_id (той самий
-- патерн, що вже є в agent_action_log/security_audit_log — не
-- окрема таблиця коментарів на кожен тип сутності).
-- ------------------------------------------------------------

create table team_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  author_id uuid references profiles(id) on delete set null,
  target_table text not null, -- 'project_pages' | 'crm_deals' | 'products' | 'team_tasks' | ...
  target_id uuid not null,
  body text not null,
  created_at timestamptz not null default now()
);

comment on table team_comments is 'Коментарі до довільної сутності через target_table/target_id (поліморфний зв`язок, не FK — сутностей забагато для окремої таблиці коментарів на кожну). Немає FK-обмеження на target_id навмисно: цілісність перевіряється на рівні застосунку (Worker), не Postgres constraint, як і в agent_action_log.';

create index idx_team_comments_target on team_comments(target_table, target_id, created_at desc);
create index idx_team_comments_org on team_comments(organization_id);

-- ------------------------------------------------------------
-- activity_feed — стрічка дій команди ("Ганна змінила Title",
-- "AI оновив статтю"). НЕ те саме, що security_audit_log
-- (0053_security_audit_log.sql) — той приватний лог для
-- owner/admin (чутливі дії: зміна ролей, видалення), цей —
-- публічний для ВСІХ членів команди фід звичайних робочих дій.
-- Різні цілі, різні RLS-політики нижче.
-- ------------------------------------------------------------

create table activity_feed (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_id uuid references profiles(id) on delete set null, -- null = дія AI-агента, не людини
  actor_label text, -- 'AI' | ім'я агента — заповнюється, коли actor_id null, щоб фід читався без JOIN на agents
  action_type text not null, -- 'task_created' | 'task_completed' | 'comment_added' | 'page_updated' | 'lead_accepted' | ...
  target_table text,
  target_id uuid,
  summary text not null, -- готовий людський текст ("змінила Title сторінки Головна"), не збирається на льоту з action_type
  created_at timestamptz not null default now()
);

comment on table activity_feed is 'Публічний (для всіх членів організації) фід дій — на відміну від security_audit_log (тільки owner/admin, чутливі дії). summary — вже готовий текст, не шаблон + параметри: простіше для MVP, ціна — не можна змінити мову фіда заднім числом без нового запису.';

create index idx_activity_feed_org on activity_feed(organization_id, created_at desc);

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4
-- ============================================================

alter table team_tasks enable row level security;
alter table team_comments enable row level security;
alter table activity_feed enable row level security;

create policy "team_tasks_select_own_org" on team_tasks
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "team_tasks_insert_own_org" on team_tasks
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "team_tasks_update_own_org" on team_tasks
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "team_tasks_delete_own_org" on team_tasks
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- team_comments: читання всім членам організації; коментувати може
-- editor+ (viewer може тільки читати, не коментувати — узгоджено з
-- SECURITY.md розділ 2 "editor редагує, viewer тільки перегляд").
-- Немає update/delete policy — коментарі незмінні після створення
-- (та сама логіка, що crm_notes: історія має лишатись незмінною).

create policy "team_comments_select_own_org" on team_comments
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "team_comments_insert_own_org" on team_comments
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

-- activity_feed: тільки читання для всіх членів організації.
-- INSERT — виключно service role (Worker пише при кожній дії),
-- немає policy для authenticated — та сама логіка, що cro_events.

create policy "activity_feed_select_own_org" on activity_feed
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

-- ============================================================
-- Реєстрація в platform_modules
-- ============================================================

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('team', 'Team Workspace', 'Спільні задачі, коментарі та стрічка дій команди', 'Users2', '/dashboard/team', 'coming_soon', 100)
on conflict (key) do nothing;
