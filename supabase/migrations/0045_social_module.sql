-- 0045_social_module.sql
-- Social-модуль (MODULE_ROADMAP.md, розділ 8 "друга хвиля"; EXECUTION_PLAN.md
-- Фаза 2.4). Обрано ДРУГИМ модулем другої хвилі після CRM — так само
-- organization-рівня, не залежить від sites/projects жорстко (на відміну
-- від Translator/Commerce, які заблоковані відсутністю project_pages,
-- див. EXECUTION_PLAN.md Фаза 1).
--
-- MVP звужено до ТІЛЬКИ Telegram-каналу — точно за MODULE_ROADMAP.md
-- розділ 8, Крок 5 ("MVP звужується до Telegram-каналу тільки"). Схема
-- нижче — спрощена версія оригінальної схеми з roadmap (Крок 1):
-- прибрано platform text (завжди 'telegram' в MVP, немає сенсу в
-- окремій колонці, поки не додається друга платформа) і account_label
-- unique-обмеження спрощено до organization_id (одна організація — один
-- канал в MVP; кілька каналів на організацію — майбутнє розширення,
-- не заблоковане цією схемою, бо unique саме на organization_id, а не
-- на organization_id+platform як у чернетці roadmap).
--
-- ВАЖЛИВЕ УТОЧНЕННЯ щодо OAuth: на відміну від Instagram/Facebook/X,
-- Telegram Bot API не використовує OAuth-флоу. Клієнт створює власного
-- бота через @BotFather, додає його адміністратором свого каналу і
-- вставляє bot_token + chat_id вручну у форму Qorax. Це ПРИНЦИПОВО
-- ІНШИЙ токен, ніж наявний env.TELEGRAM_BOT_TOKEN (той — єдиний бот
-- Qorax для алертів власнику сайту про даунтайм, монтується з Worker
-- secrets, не зберігається в БД). Тут кожна організація зберігає СВІЙ
-- власний bot_token у social_connections (зашифрований, за патерном
-- encrypt()/decrypt() з gscHandler.ts — AES-GCM, той самий підхід, інший
-- ключ середовища SOCIAL_TOKEN_ENCRYPTION_KEY, щоб не змішувати з
-- Google OAuth-токенами).

-- ------------------------------------------------------------
-- social_connections
-- ------------------------------------------------------------

create table social_connections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  platform text not null default 'telegram', -- MVP: тільки 'telegram'. Instagram/Facebook/X — майбутні ітерації (MODULE_ROADMAP.md Крок 5)
  encrypted_bot_token text not null,
  telegram_chat_id text not null,           -- '@channel_username' або числовий chat_id каналу
  account_label text,                        -- людська назва каналу для UI, напр. "Основний канал"
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, platform)
);

comment on table social_connections is 'Підключення до соцмереж. MVP: тільки Telegram, bot_token належить клієнту (не env.TELEGRAM_BOT_TOKEN — той для алертів Qorax), шифрується AES-GCM за патерном gscHandler.ts, ключ SOCIAL_TOKEN_ENCRYPTION_KEY.';

create index idx_social_connections_organization on social_connections(organization_id);

-- ------------------------------------------------------------
-- social_posts
-- ------------------------------------------------------------

create table social_posts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  connection_id uuid references social_connections(id) on delete set null,
  content text not null,
  hashtags text[],
  scheduled_at timestamptz,
  published_at timestamptz,
  status text not null default 'draft', -- draft | scheduled | published | failed
  fail_reason text,                      -- заповнюється cron-ом при status='failed', для UI-діагностики
  ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  constraint social_posts_status_check check (status in ('draft', 'scheduled', 'published', 'failed'))
);

comment on table social_posts is 'Пости для соцмереж. image_urls з чернетки roadmap НЕ додано в MVP — Telegram sendMessage (текст) простіший за sendPhoto, зображення — майбутнє розширення разом з Instagram/Facebook (де вони обов`язкові, а не опційні).';

create index idx_social_posts_organization on social_posts(organization_id);
create index idx_social_posts_scheduled on social_posts(scheduled_at) where status = 'scheduled';

-- ------------------------------------------------------------
-- social_post_stats
-- ------------------------------------------------------------
-- Присутнє в чернетці roadmap (Крок 1) для лайків/коментів/охоплення.
-- Telegram Bot API не надає ці метрики без прав адміністратора каналу
-- на рівні API, яких у звичайного бота-учасника немає (потрібен
-- getChatMemberCount для розміру аудиторії, конкретно по посту —
-- немає стандартного ендпоінта). Таблицю СТВОРЮЄМО зараз (схема з
-- roadmap, без змін), щоб не переносити міграцію пізніше, коли
-- Instagram/Facebook додадуть реальні метрики — але run-social-stats
-- cron (Крок 2 нижче) в МVP її не наповнює для Telegram-постів.

create table social_post_stats (
  id uuid primary key default gen_random_uuid(),
  social_post_id uuid not null references social_posts(id) on delete cascade,
  likes integer,
  comments integer,
  shares integer,
  reach integer,
  fetched_at timestamptz not null default now()
);

comment on table social_post_stats is 'Статистика постів. У MVP (Telegram) НЕ наповнюється — Bot API не надає ці метрики без адмін-прав каналу. Таблиця готова наперед для Instagram/Facebook (майбутні ітерації), щоб не переносити міграцію.';

create index idx_social_post_stats_post on social_post_stats(social_post_id);

-- ------------------------------------------------------------
-- Реєстрація в platform_modules (той самий патерн, що 0044)
-- ------------------------------------------------------------

insert into platform_modules (key, label, description, icon, href, status, sort_order) values
  ('social', 'Social', 'Публікації в Telegram-канал з розкладом і AI-генерацією тексту', 'Send', '/dashboard/social', 'coming_soon', 80)
on conflict (key) do nothing;

-- ============================================================
-- RLS — за шаблоном SECURITY.md розділ 4 / 0043_crm_module.sql
-- (пишеться одразу зі схемою — EXECUTION_PLAN.md Фаза 2, крок 1.5)
-- ============================================================

alter table social_connections enable row level security;
alter table social_posts enable row level security;
alter table social_post_stats enable row level security;

-- social_connections: select — будь-хто в організації; insert/update/delete — admin+
-- (суворіше за CRM contacts editor+, бо тут зберігається чужий bot_token
-- — випадкове підключення "не того" каналу редактором має вищу ціну
-- помилки, ніж створення контакту)

create policy "social_connections_select_own_org" on social_connections
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "social_connections_insert_own_org" on social_connections
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "social_connections_update_own_org" on social_connections
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

create policy "social_connections_delete_own_org" on social_connections
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );

-- social_posts: select — будь-хто в організації; insert/update/delete — editor+
-- (той самий рівень, що CRM deals/contacts — створення й редагування
-- постів не вимагає такого ж рівня довіри, як підключення каналу)

create policy "social_posts_select_own_org" on social_posts
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

create policy "social_posts_insert_own_org" on social_posts
  for insert with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "social_posts_update_own_org" on social_posts
  for update using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

create policy "social_posts_delete_own_org" on social_posts
  for delete using (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin', 'editor')
    )
  );

-- social_post_stats: тільки select, транзитивно через social_posts —
-- наповнюється лише Worker-ом (service role), як crm_notes без
-- update/delete policy, і так само без insert policy для юзерів
-- (майбутній Instagram/Facebook cron пише через service role, не
-- через юзерський JWT)

create policy "social_post_stats_select_own_org" on social_post_stats
  for select using (
    is_platform_admin() or
    social_post_id in (select id from social_posts where organization_id in (select user_organization_ids()))
  );
