-- ============================================================
-- QORAX — Migration 0042: AI/Content module — generations + credits
-- ============================================================
-- Другий модуль з product vision, побудований за MODULE_ROADMAP.md
-- (розділ 2). Gemini вже інтегрований і використовується в
-- aiInsights.ts (пояснення проблем аудиту) та chatHandler.ts
-- (Qoraxus AI-чат) — цей модуль додає нові промпти поверх тієї ж
-- інфраструктури виклику Gemini, а не нову AI-інтеграцію.
--
-- Product vision розділяє це на два продукти (Qorax AI і Qorax
-- Content), але технічно це один модуль: однакова інфраструктура
-- виклику AI, різниця лише в промптах і UI.
-- ============================================================

create table ai_generations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete set null,
  kind text not null,               -- 'title' | 'meta_description' | 'faq' | 'article_intro'
  prompt_input jsonb not null,      -- що ввів користувач (тема, ключові слова, тон)
  output text not null,
  created_at timestamptz not null default now()
);

comment on table ai_generations is
  'Історія AI-генерацій контенту (модуль AI/Content). site_id опційний — генерація може бути не прив''язана до конкретного сайту (напр. загальна стаття).';

create index idx_ai_generations_org on ai_generations(organization_id, created_at desc);
create index idx_ai_generations_site on ai_generations(site_id) where site_id is not null;

create table ai_credits (
  organization_id uuid primary key references organizations(id) on delete cascade,
  credits_remaining integer not null default 0,
  credits_reset_at timestamptz,     -- коли останній раз (або наступного разу) скидаються кредити
  updated_at timestamptz not null default now()
);

comment on table ai_credits is
  'Ліміт AI-генерацій на організацію. Скидається щомісяця відповідно до тарифу (окремий cron, аналогічний trial-expiry). Окрема монетизація з product vision ("AI Credits"). ВІДОМЕ ОБМЕЖЕННЯ: наразі немає автоматичної видачі стартових кредитів при реєстрації/оплаті — рядок для організації створюється вручну (insert або через майбутню admin-панель). Без рядка в цій таблиці generate endpoint поверне "Кредити вичерпано" (credits_remaining default 0), що безпечно, але означає, що для реального тестування потрібен ручний insert.';

create trigger trg_ai_credits_updated_at
  before update on ai_credits
  for each row execute function set_updated_at();

-- ------------------------------------------------------------
-- RLS — той самий патерн через user_organization_ids(), що і
-- rank_tracked_queries (міграція 0041) та решта org-scoped таблиць
-- ------------------------------------------------------------

alter table ai_generations enable row level security;

create policy "ai_generations_select" on ai_generations
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

-- INSERT робить тільки service role (worker, після списання credit) —
-- клієнт не повинен мати змогу вставити запис напряму, обходячи
-- перевірку кредитів
create policy "ai_generations_admin_all" on ai_generations
  for all using (is_platform_admin());

alter table ai_credits enable row level security;

create policy "ai_credits_select" on ai_credits
  for select using (
    organization_id in (select user_organization_ids()) or is_platform_admin()
  );

-- Списання/скидання кредитів робить тільки service role (worker) або
-- platform admin (ручне коригування) — не сам користувач
create policy "ai_credits_admin_all" on ai_credits
  for all using (is_platform_admin());
