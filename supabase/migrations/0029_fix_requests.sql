-- 0029_fix_requests.sql
-- Тикет-система "Замовити виправлення" — заявки клієнтів на платне/безкоштовне
-- виправлення проблем студією Qorax (не маркетплейс фрілансерів, а прямі
-- заявки власнику студії — email + Telegram сповіщення, обробка вручну).

create type fix_request_status as enum ('new', 'in_progress', 'done', 'declined');

create table fix_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid not null references sites(id) on delete cascade,
  -- Якщо заявка створена з конкретного AI Insight — прив'язуємо (nullable,
  -- бо є і загальна кнопка "Потрібна допомога з цим сайтом" без insight'у)
  insight_id uuid references ai_insights(id) on delete set null,
  requested_by uuid not null references profiles(id) on delete cascade,
  -- Що саме просить клієнт: копія problem_summary/recommendation з інсайту,
  -- або вільний текст якщо заявка загальна
  problem_description text not null,
  -- Платформа сайту — критично для власника студії щоб одразу зрозуміти
  -- чи береться він за це (WordPress легко, конструктори типу Tilda/Wix важче)
  site_platform text, -- 'wordpress' | 'tilda' | 'wix' | 'custom' | 'other' | null (невідомо)
  -- Чи це безкоштовна заявка (в межах ліміту плану) чи платна
  is_free boolean not null default true,
  status fix_request_status not null default 'new',
  admin_notes text, -- нотатки власника студії, не видно клієнту
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table fix_requests is 'Заявки клієнтів на виправлення проблем силами студії Qorax. Growth+ план, 1 безкоштовна заявка/місяць на організацію, далі — платно за домовленістю.';

create index idx_fix_requests_org on fix_requests(organization_id);
create index idx_fix_requests_site on fix_requests(site_id);
create index idx_fix_requests_status on fix_requests(status) where status in ('new', 'in_progress');
create index idx_fix_requests_created on fix_requests(created_at);

-- Для швидкого підрахунку "скільки безкоштовних заявок вже використано цього місяця"
create index idx_fix_requests_org_free_month on fix_requests(organization_id, created_at) where is_free = true;

create trigger set_fix_requests_updated_at
  before update on fix_requests
  for each row
  execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS: клієнт бачить і створює заявки лише для своєї організації.
-- Оновлення статусу/нотаток — тільки через service_role (admin worker
-- endpoint), тому UPDATE policy для звичайних користувачів не додаємо.
-- ------------------------------------------------------------

alter table fix_requests enable row level security;

create policy "Members can view own fix requests"
  on fix_requests for select
  using (organization_id in (select user_organization_ids()) or is_platform_admin());

create policy "Members can create fix requests for own organization"
  on fix_requests for insert
  with check (organization_id in (select user_organization_ids()));
