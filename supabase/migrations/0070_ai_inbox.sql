-- ============================================================
-- QORAX — Migration 0070: AI Inbox
-- ============================================================
-- MODULE_ROADMAP.md, "Четверта хвиля (довгострокове бачення)",
-- розділ 12 "AI Operating System" — реалізовано перший (найдешевший)
-- шматок з "Крок 5" того розділу: AI Inbox, підключений до вже
-- наявних джерел виявлення проблем (Audit — aiInsights.ts/
-- checkSpeedDegradation, Rank — gscHandler.ts), без AI Goals/Planner
-- (друга ітерація, значно більший обсяг і ризик — Gemini має
-- адекватно розкладати довільну ціль на наявних агентів).
--
-- suggested_agent_id — на момент цієї міграції в довіднику agents
-- (0057/0060) реально є 'content'/'seo'/'rank' — інбокс використовує
-- лише 'seo' і 'rank' (джерела Audit/Rank), не 'cro' (агента ще
-- немає в довіднику).
-- ============================================================

create table ai_inbox_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  title text not null,                 -- "Оновити сторінку «Послуги»"
  reason text not null,                -- "Втрата позицій"
  source text not null,                -- 'rank' | 'audit' | 'cro' | 'ceo_agent'
  suggested_agent_id text references agents(id) on delete set null,
  status text not null default 'new',  -- new | accepted | dismissed
  created_at timestamptz not null default now()
);

comment on table ai_inbox_items is
  'Рекомендації AI, зібрані з різних джерел платформи в один список для AI Chat / dashboard/home. MODULE_ROADMAP.md розділ 12 (AI Operating System, хвиля 4). accept НЕ запускає агента автоматично в цій версії (немає єдиного runAgent(agentId) — окремі per-agent HTTP-хендлери в agentHandler.ts) — лише позначає статус, користувач переходить до потрібного модуля вручну.';

create index idx_ai_inbox_items_organization on ai_inbox_items(organization_id, status, created_at desc);
create index idx_ai_inbox_items_site on ai_inbox_items(site_id) where site_id is not null;

alter table ai_inbox_items enable row level security;

create policy "ai_inbox_items_select" on ai_inbox_items
  for select using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

-- insert — робить виключно worker (service role, обходить RLS) з
-- фонових детекторів; політика нижче — на випадок майбутнього
-- прямого клієнтського інсерту, не для поточного шляху.
create policy "ai_inbox_items_insert" on ai_inbox_items
  for insert with check (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );

-- update — accept/dismiss з UI, доступно editor+ (той самий рівень,
-- що потрібен для запуску агента, на який інбокс натякає)
create policy "ai_inbox_items_update" on ai_inbox_items
  for update using (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );
