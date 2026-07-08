-- ============================================================
-- QORAX — Migration 0041: Rank module — tracked search queries
-- ============================================================
-- Перший модуль з product vision, що будується поверх платформи
-- (MODULE_ROADMAP.md, розділ 1 — Rank). Не вимагає нового зовнішнього
-- data provider: використовує вже наявну GSC-інтеграцію (gsc_connections,
-- gsc_metrics з міграції 0006).
--
-- rank_tracked_queries — список запитів, які власник сайту явно хоче
-- відстежувати окремо (з усіх запитів, які Google Search Console бачить
-- для сайту, цікаві зазвичай лише кілька десятків цільових).
--
-- ВАЖЛИВО: сам по собі запис у цій таблиці не гарантує щоденну історію
-- позиції — існуючий GSC sync (worker/src/lib/gscHandler.ts) синхронізує
-- тільки топ-10 запитів за кліками на СЬОГОДНІ, без історії по датах для
-- конкретного запиту. runGscSync має бути розширений, щоб додатково тягнути
-- date+query дані з фільтром саме по tracked-запитах цього сайту — інакше
-- графік історії позиції для нішевого (не топ-10) запиту буде порожній.
-- Це зроблено в тому ж воркер-файлі окремим PR/комітом, не в цій міграції.
-- ============================================================

create table rank_tracked_queries (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  query text not null,
  -- яку сторінку сайту власник хоче ранжувати цим запитом (опційно,
  -- інформаційне поле — не впливає на сам GSC-запит)
  target_url text,
  created_at timestamptz not null default now(),
  unique (site_id, query)
);

comment on table rank_tracked_queries is
  'Список пошукових запитів, обраних власником сайту для відстеження позиції. Історичні дані по кожному запиту зберігаються в gsc_metrics (query IS NOT NULL) — ця таблиця лише позначає, які запити варто виділити на дашборді Rank.';

create index idx_rank_tracked_queries_site on rank_tracked_queries(site_id);

alter table rank_tracked_queries enable row level security;

-- Доступ — так само, як і до самого сайту: через членство в організації
-- (той самий патерн user_organization_ids(), що і в uptime_checks,
-- speed_checks, competitor_sites — міграція 0011)
create policy "rank_tracked_queries_select" on rank_tracked_queries
  for select using (
    site_id in (select id from sites where organization_id in (select user_organization_ids()))
    or is_platform_admin()
  );

create policy "rank_tracked_queries_insert" on rank_tracked_queries
  for insert with check (
    site_id in (
      select s.id from sites s
      join organization_members m on m.organization_id = s.organization_id
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );

create policy "rank_tracked_queries_delete" on rank_tracked_queries
  for delete using (
    site_id in (
      select s.id from sites s
      join organization_members m on m.organization_id = s.organization_id
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
    or is_platform_admin()
  );
