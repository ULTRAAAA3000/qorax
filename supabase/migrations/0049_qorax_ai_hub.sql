-- 0049_qorax_ai_hub.sql
-- Qorax AI — єдиний AI-хаб платформи (MODULE_ROADMAP.md, розділ
-- "Третя хвиля"; EXECUTION_PLAN.md, наступний крок після завершення
-- хвилі 2 і паралельного Docs). У цій міграції — ЛИШЕ схема БД
-- (8 таблиц), БЕЗ worker-логіки і UI — свідомо узгоджено з Артемом:
-- спершу фундамент, окремими проходами далі Chat / Agents / Workspace
-- / Memory / Tasks / Automations (кожна вкладка — власний крок, а не
-- один величезний коміт на всі шість одразу).
--
-- ВАЖЛИВЕ УТОЧНЕННЯ по platform_modules (виявлено під час цієї
-- міграції, НЕ виправляється тут): ключ 'ai' вже існує з 0039
-- ('AI-асистент для тексту, SEO та контенту', href '/dashboard/ai') —
-- саме він з самого початку задуманий під ПОВНОЦІННИЙ Qorax AI-хаб,
-- а не під генерацію контенту. Є ОКРЕМИЙ ключ 'content' (href
-- '/dashboard/content') саме для генерації текстів — проте фізично
-- сторінки /dashboard/content не існує, а код AiContentUI.tsx
-- (генерація заголовків/meta/FAQ, 0042_ai_content_module.sql) зараз
-- живе саме на /dashboard/ai. Тобто існуюча реалізація фактично
-- зайняла не той ключ/маршрут, під який задумувалась з 0039. Ця
-- міграція НЕ переносить AiContentUI і НЕ чіпає INSERT platform_
-- modules (ключ 'ai' вже є, чіпати його insert'ом немає сенсу) —
-- рішення "коли й як розвести /dashboard/ai (майбутній хаб) і
-- /dashboard/content (генерація)" явно ВІДКЛАДЕНО Артемом до сесії
-- з UI цього модуля, задокументовано в EXECUTION_PLAN.md.
--
-- ВАЖЛИВО про кредити: agents.credit_cost_per_run і
-- agent_runs.credits_spent НЕ заводять другу систему лімітів —
-- переюзовують існуючу таблицю ai_credits (0042_ai_content_module.sql,
-- organization_id -> credits_remaining). Списання при запуску агента —
-- завдання worker-логіки (наступний крок, не цієї міграції), тут
-- лише зафіксовано архітектурне рішення коментарем, щоб не
-- винайти окрему таблицю кредитів під час реалізації Agents/Automations.

-- ------------------------------------------------------------
-- agents — глобальний довідник (НЕ organization-scoped)
-- ------------------------------------------------------------

create table agents (
  id text primary key,                -- 'seo' | 'content' | 'translator' | 'analytics' |
                                       -- 'rank' | 'cro' | 'commerce' | 'social' | 'crm' | 'support'
                                       -- (власний namespace агентів, НЕ platform_modules.key —
                                       -- напр. агент 'content' це не те саме, що ключ 'content'
                                       -- у platform_modules, хоч назви й збігаються)
  name text not null,
  description text not null,
  underlying_module text,             -- посилається на platform_modules.key змістовно, без FK
                                       -- (агент може існувати до того, як відповідний модуль live)
  credit_cost_per_run integer not null default 0,
  is_active boolean not null default true
);

comment on table agents is 'Глобальний довідник AI-агентів (не прив''язаний до organization). credit_cost_per_run списується з існуючої ai_credits (0042_ai_content_module.sql) при запуску — окремої таблиці кредитів немає.';

-- ------------------------------------------------------------
-- agent_subscriptions
-- ------------------------------------------------------------

create table agent_subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  schedule_cron text,
  is_enabled boolean not null default true,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, agent_id, site_id)
);

comment on table agent_subscriptions is 'Автоматизації (вкладка Automations = це ж саме, що agent_subscriptions, за задумом roadmap). site_id nullable — агент може працювати на рівні всієї організації, не одного сайту.';

create index idx_agent_subscriptions_org on agent_subscriptions(organization_id);
create index idx_agent_subscriptions_agent on agent_subscriptions(agent_id);
create index idx_agent_subscriptions_due on agent_subscriptions(schedule_cron) where is_enabled = true and schedule_cron is not null;

-- ------------------------------------------------------------
-- agent_runs
-- ------------------------------------------------------------

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_subscription_id uuid not null references agent_subscriptions(id) on delete cascade,
  organization_id uuid not null references organizations(id) on delete cascade,
  status text not null default 'running', -- running | done | failed
  credits_spent integer not null default 0,
  summary text,
  raw_output jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

comment on table agent_runs is 'Історія запусків агентів. organization_id продубльовано з agent_subscription_id навмисно (той самий патерн, що crm_reminders в 0043) — спрощує RLS і майбутній cron-обробник без зайвого JOIN.';

create index idx_agent_runs_subscription on agent_runs(agent_subscription_id, started_at desc);
create index idx_agent_runs_org on agent_runs(organization_id, started_at desc);
create index idx_agent_runs_status on agent_runs(status) where status = 'running';

-- ------------------------------------------------------------
-- agent_action_log
-- ------------------------------------------------------------

create table agent_action_log (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent_runs(id) on delete cascade,
  action_type text not null,          -- напр. 'created_deal' | 'updated_meta' | 'sent_alert'
  target_table text,
  target_id uuid,
  created_at timestamptz not null default now()
);

comment on table agent_action_log is 'Детальний лог дій, виконаних агентом в межах одного run — для прозорості "що саме AI змінив" в Workspace/історії дій.';

create index idx_agent_action_log_run on agent_action_log(agent_run_id, created_at);

-- ------------------------------------------------------------
-- ai_chat_threads — замінює й розширює Qoraxus
-- ------------------------------------------------------------

create table ai_chat_threads (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade, -- null = чат рівня всієї організації
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table ai_chat_threads is 'site_id nullable: null = головний чат Qorax AI (контекст = вся організація), заповнено = контекстний чат сайту (те, чим зараз є QoraxusChat.tsx/chatHandler.ts). Перенесення Qoraxus у цю таблицю — окремий майбутній крок (worker+UI), не ця міграція.';

create index idx_ai_chat_threads_org on ai_chat_threads(organization_id, updated_at desc);
create index idx_ai_chat_threads_site on ai_chat_threads(site_id) where site_id is not null;

create trigger trg_ai_chat_threads_updated_at
  before update on ai_chat_threads
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- ai_chat_messages
-- ------------------------------------------------------------

create table ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references ai_chat_threads(id) on delete cascade,
  role text not null,                 -- 'user' | 'model'
  content text not null,
  created_at timestamptz not null default now(),
  constraint ai_chat_messages_role_check check (role in ('user', 'model'))
);

comment on table ai_chat_messages is 'Повідомлення в межах треду. role обмежено CHECK-констрейнтом (user/model), той самий підхід надійності на рівні БД, що crm_notes exactly_one_parent в 0043.';

create index idx_ai_chat_messages_thread on ai_chat_messages(thread_id, created_at);

-- ------------------------------------------------------------
-- ai_memory — одна строка на organization
-- ------------------------------------------------------------

create table ai_memory (
  organization_id uuid primary key references organizations(id) on delete cascade,
  business_summary text,              -- чим займається бізнес клієнта
  tone_preference text,                -- стиль спілкування, який AI має тримати
  competitors jsonb,                   -- список конкурентів, про яких AI вже знає
  goals text,
  updated_at timestamptz not null default now()
);

comment on table ai_memory is 'Вкладка Memory — що AI запам''ятав про бізнес користувача. Одна строка на organization (primary key = organization_id, як ai_credits в 0042).';

create trigger trg_ai_memory_updated_at
  before update on ai_memory
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- ai_files — вкладка Workspace (файли)
-- ------------------------------------------------------------

create table ai_files (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  thread_id uuid references ai_chat_threads(id) on delete set null,
  file_name text not null,
  file_type text not null,             -- 'pdf' | 'csv' | 'image' | 'docx'
  storage_path text not null,          -- шлях у Supabase Storage
  extracted_summary text,
  created_at timestamptz not null default now()
);

comment on table ai_files is 'Завантажені документи для AI-аналізу (вкладка Workspace). storage_path — шлях у Supabase Storage bucket, сам bucket і upload-flow — завдання окремого worker-кроку, не цієї міграції.';

create index idx_ai_files_org on ai_files(organization_id, created_at desc);
create index idx_ai_files_thread on ai_files(thread_id) where thread_id is not null;

-- ------------------------------------------------------------
-- ai_tasks — вкладка Tasks
-- ------------------------------------------------------------

create table ai_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  agent_id text references agents(id) on delete set null,
  description text not null,
  status text not null default 'pending', -- pending | in_progress | done | failed
  agent_run_id uuid references agent_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint ai_tasks_status_check check (status in ('pending', 'in_progress', 'done', 'failed'))
);

comment on table ai_tasks is 'Черга задач (вкладка Tasks) — і ручних, і сформованих AI/агентами. agent_run_id заповнюється, коли задача виконана конкретним запуском агента.';

create index idx_ai_tasks_org on ai_tasks(organization_id, created_at desc);
create index idx_ai_tasks_status on ai_tasks(status) where status in ('pending', 'in_progress');

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4 (пишеться одразу зі схемою,
-- не окремим проходом — той самий підхід, що всі модулі хвилі 2)
-- ============================================================

alter table agents enable row level security;
alter table agent_subscriptions enable row level security;
alter table agent_runs enable row level security;
alter table agent_action_log enable row level security;
alter table ai_chat_threads enable row level security;
alter table ai_chat_messages enable row level security;
alter table ai_memory enable row level security;
alter table ai_files enable row level security;
alter table ai_tasks enable row level security;

-- agents: глобальний довідник — читають усі автентифіковані, пишуть
-- лише service role (Worker) або platform admin. Без insert/update/
-- delete policy для звичайних юзерів — RLS без policy на дію = дія
-- заборонена для всіх, окрім service role, що й потрібно (новий
-- агент додається вручну міграцією чи адмін-панеллю, не юзером).

create policy "agents_select_all_authenticated" on agents
  for select using (auth.uid() is not null or is_platform_admin());

-- agent_subscriptions: прямий organization_id, той самий шаблон, що crm_deals

create policy "agent_subscriptions_select_own_org" on agent_subscriptions
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "agent_subscriptions_insert_own_org" on agent_subscriptions
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "agent_subscriptions_update_own_org" on agent_subscriptions
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "agent_subscriptions_delete_own_org" on agent_subscriptions
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- agent_runs: прямий organization_id — тільки select для юзерів
-- (запуски створює/оновлює лише worker через service role, не
-- прямий insert від юзера — так само, як crm_notes без update/delete)

create policy "agent_runs_select_own_org" on agent_runs
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

-- agent_action_log: транзитивно через agent_runs -> organization_id

create policy "agent_action_log_select_own_org" on agent_action_log
  for select using (
    is_platform_admin() or
    agent_run_id in (
      select id from agent_runs where organization_id in (select user_organization_ids())
    )
  );

-- ai_chat_threads: прямий organization_id, повний CRUD для editor+

create policy "ai_chat_threads_select_own_org" on ai_chat_threads
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "ai_chat_threads_insert_own_org" on ai_chat_threads
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "ai_chat_threads_update_own_org" on ai_chat_threads
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "ai_chat_threads_delete_own_org" on ai_chat_threads
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

-- ai_chat_messages: транзитивно через ai_chat_threads

create policy "ai_chat_messages_select_own_org" on ai_chat_messages
  for select using (
    is_platform_admin() or
    thread_id in (
      select id from ai_chat_threads where organization_id in (select user_organization_ids())
    )
  );

create policy "ai_chat_messages_insert_own_org" on ai_chat_messages
  for insert with check (
    thread_id in (
      select t.id from ai_chat_threads t
      join organization_members om on om.organization_id = t.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

-- Повідомлення не редагуються і не видаляються через API (історія
-- чату незмінна) — той самий підхід, що crm_notes в 0043.

-- ai_memory: прямий primary key = organization_id

create policy "ai_memory_select_own_org" on ai_memory
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "ai_memory_insert_own_org" on ai_memory
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "ai_memory_update_own_org" on ai_memory
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

-- ai_files: прямий organization_id

create policy "ai_files_select_own_org" on ai_files
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "ai_files_insert_own_org" on ai_files
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "ai_files_delete_own_org" on ai_files
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

-- ai_tasks: прямий organization_id, повний CRUD для editor+

create policy "ai_tasks_select_own_org" on ai_tasks
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "ai_tasks_insert_own_org" on ai_tasks
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "ai_tasks_update_own_org" on ai_tasks
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "ai_tasks_delete_own_org" on ai_tasks
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- ------------------------------------------------------------
-- platform_modules: НЕ чіпаємо в цій міграції
-- ------------------------------------------------------------
-- Ключ 'ai' вже існує з 0039_platform_foundation.sql (href
-- '/dashboard/ai', status 'coming_soon') — саме він призначений під
-- цей хаб. Коли з'явиться UI цього модуля (наступний крок), можливо
-- знадобиться лише UPDATE label/description/href для ключа 'ai' —
-- не новий INSERT. Див. коментар на початку файлу.
