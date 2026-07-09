-- 0046_academy_module.sql
-- Academy-модуль (MODULE_ROADMAP.md, розділ 10 "друга хвиля";
-- EXECUTION_PLAN.md Фаза 2.5). Третій модуль хвилі 2 після CRM і
-- Social — так само без жорсткої залежності від Sites/project_pages
-- (на відміну від CRO, який прив'язаний до site_id і потребує
-- клієнтського JS-сніпета на сторінках — обрано пізніше через вищий
-- технічний ризик, EXECUTION_PLAN.md).
--
-- На відміну від CRM/Social (organization-рівня дані), Academy має
-- ДВА рівні: контент курсів (глобальний, не належить organization —
-- один каталог курсів для всіх клієнтів Qorax) і прогрес користувача
-- (профіль-рівня, не organization-рівня — профіль може складатись з
-- кількох organization, але проходить курси як людина, не як компанія;
-- це узгоджується з тим, що profiles — окрема сутність від
-- organizations в DATA_MODEL.md).
--
-- Схема — точна копія MODULE_ROADMAP.md розділ 10 Крок 1, без змін
-- (найпростіший модуль з усієї хвилі 2 — контент, не логіка).

-- ------------------------------------------------------------
-- academy_courses / academy_lessons — контент, наповнюється вручну
-- (через SQL чи майбутню адмін-панель), не через публічний API
-- ------------------------------------------------------------

create table academy_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  description text,
  is_premium boolean not null default false,
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

comment on table academy_courses is 'Каталог курсів Academy. Глобальний контент (не належить organization) — один каталог для всіх клієнтів. Наповнюється вручну через SQL/адмін, немає публічного insert API в MVP.';

create table academy_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references academy_courses(id) on delete cascade,
  title text not null,
  slug text not null,
  content jsonb,
  order_index integer not null default 0,
  unique (course_id, slug)
);

comment on table academy_lessons is 'Уроки курсу. content jsonb — блоки тексту/відео-посилань/чек-листів, формат довільний на розсуд контенту (UI рендерить по типу блоку).';

create index idx_academy_lessons_course on academy_lessons(course_id);

-- ------------------------------------------------------------
-- academy_progress / academy_certificates — профіль-рівня
-- ------------------------------------------------------------

create table academy_progress (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  lesson_id uuid not null references academy_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  unique (profile_id, lesson_id)
);

comment on table academy_progress is 'Прогрес користувача по уроках. organization_id зберігається для RLS-фільтрації (той самий підхід простоти, що інші organization-рівня таблиці), хоча логічно прогрес належить profile_id, не організації — профіль може змінити організацію, прогрес лишається його.';

create index idx_academy_progress_profile on academy_progress(profile_id);
create index idx_academy_progress_lesson on academy_progress(lesson_id);

create table academy_certificates (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  course_id uuid not null references academy_courses(id) on delete cascade,
  issued_at timestamptz not null default now(),
  certificate_url text,
  unique (profile_id, course_id)
);

comment on table academy_certificates is 'Видається автоматично, коли profile_id проходить усі уроки course_id — перевірка в handleAcademyProgress, без окремого cron (roadmap Крок 2).';

create index idx_academy_certificates_profile on academy_certificates(profile_id);

-- ------------------------------------------------------------
-- Реєстрація в platform_modules
-- ------------------------------------------------------------

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('academy', 'Academy', 'Курси та навчальні матеріали з SEO і роботи з платформою', 'GraduationCap', '/dashboard/academy', 'coming_soon', 90)
on conflict (key) do nothing;

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4 / 0043_crm_module.sql
-- ============================================================

alter table academy_courses enable row level security;
alter table academy_lessons enable row level security;
alter table academy_progress enable row level security;
alter table academy_certificates enable row level security;

-- academy_courses / academy_lessons: SELECT відкритий для всіх
-- автентифікованих (це каталог курсів, не приватні дані організації;
-- premium-гейтинг перевіряється на рівні UI/worker при відкритті
-- уроку, не на рівні RLS select курсів/уроків — щоб показувати
-- premium-курси в каталозі як "закриті", а не ховати їх повністю).
-- INSERT/UPDATE/DELETE — тільки service role (наповнення контентом
-- вручну, немає публічного API для створення курсів у MVP).

create policy "academy_courses_select_authenticated" on academy_courses
  for select using (auth.uid() is not null);

create policy "academy_lessons_select_authenticated" on academy_lessons
  for select using (auth.uid() is not null);

-- academy_progress: кожен бачить і пише лише свій прогрес

create policy "academy_progress_select_own" on academy_progress
  for select using (profile_id = auth.uid() or is_platform_admin());

create policy "academy_progress_insert_own" on academy_progress
  for insert with check (profile_id = auth.uid());

-- academy_certificates: кожен бачить лише свої сертифікати.
-- INSERT — тільки service role (видається worker-ом при завершенні
-- курсу, не користувачем напряму — інакше можна "видати собі"
-- сертифікат без проходження уроків)

create policy "academy_certificates_select_own" on academy_certificates
  for select using (profile_id = auth.uid() or is_platform_admin());
