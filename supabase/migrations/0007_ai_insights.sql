-- ============================================================
-- QORAX — Migration 0007: AI Insights & Revenue Impact
-- ============================================================
-- Все таблицы этого блока — результат вызовов Gemini/Groq API.
-- Храним результат, чтобы не дёргать AI повторно на каждый показ дашборда
-- (экономим бесплатный лимит запросов в день).
-- ============================================================

create type insight_severity as enum ('critical', 'warning', 'info');

-- ------------------------------------------------------------
-- ai_insights — объяснение проблемы простым языком + revenue impact
-- ------------------------------------------------------------

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  -- к какой именно проверке относится инсайт (полиморфная ссылка через тип+id, без foreign key
  -- так как source может быть из разных таблиц мониторинга)
  source_table text not null, -- например 'speed_checks', 'broken_links', 'ssl_certificates'
  source_id uuid,
  severity insight_severity not null default 'info',
  problem_summary text not null, -- "Ваш сайт грузится 4.2 секунды"
  plain_explanation text not null, -- AI текст простым языком, без техн. жаргона
  estimated_monthly_loss_usd numeric(10, 2), -- Revenue Impact: "~$200/мес"
  recommendation text not null, -- что конкретно сделать
  is_resolved boolean not null default false,
  generated_at timestamptz not null default now()
);

comment on table ai_insights is 'AI-сгенерированные объяснения проблем + Revenue Impact в $. Привязка к источнику через source_table/source_id (полиморфная, без FK).';

create index idx_ai_insights_site on ai_insights(site_id);
create index idx_ai_insights_active on ai_insights(site_id) where is_resolved = false;

-- ------------------------------------------------------------
-- ai_content_generations — AI генерация текста / структуры страниц (Agency план)
-- ------------------------------------------------------------

create type content_generation_type as enum ('page_copy', 'seo_structure', 'meta_tags');

create table ai_content_generations (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  generation_type content_generation_type not null,
  prompt_context text not null, -- что попросил пользователь / какая страница
  generated_content text not null,
  used boolean not null default false, -- отмечает, скопировал ли пользователь результат
  created_at timestamptz not null default now()
);

comment on table ai_content_generations is 'История AI-генерации контента и SEO-структур. Только Agency план.';

create index idx_ai_content_site on ai_content_generations(site_id);

-- ------------------------------------------------------------
-- ai_usage_log — учёт расхода бесплатного лимита AI API (1500 запросов/день Gemini)
-- ------------------------------------------------------------

create table ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('gemini', 'groq')),
  request_type text not null, -- 'explain_insight', 'revenue_impact', 'content_generation' и т.д.
  site_id uuid references sites(id) on delete set null,
  tokens_used integer,
  created_at timestamptz not null default now()
);

comment on table ai_usage_log is 'Лог использования AI API для контроля бесплатного дневного лимита и принятия решения когда переходить на платный tier.';

create index idx_ai_usage_log_date on ai_usage_log(created_at);
