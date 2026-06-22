-- ============================================================
-- QORAX — Migration 0019: Competitor page-change tracking
-- ============================================================
-- competitor_sites вже існує (з 0005 або 0006).
-- Додаємо таблицю для зберігання знімків контенту та змін.
-- ============================================================

-- Поточний "знімок" контенту конкурента (одна запись на competitor_site,
-- перезаписується при кожній перевірці — нам важливий лише поточний хеш).
alter table competitor_sites
  add column if not exists content_hash       text,          -- sha256 тексту сторінки
  add column if not exists content_snapshot   text,          -- перші ~2000 символів очищеного тексту (для diff-відображення)
  add column if not exists last_change_at     timestamptz;   -- коли востаннє зафіксовано зміну

-- Лог змін — append-only, для відображення "що змінилось і коли"
create table if not exists competitor_changes (
  id              uuid primary key default gen_random_uuid(),
  competitor_id   uuid not null references competitor_sites(id) on delete cascade,
  site_id         uuid not null references sites(id) on delete cascade,
  detected_at     timestamptz not null default now(),
  old_hash        text,
  new_hash        text not null,
  -- короткий summary що змінилось (генерується Gemini або простим diff-підрахунком)
  change_summary  text,
  alert_sent      boolean not null default false
);

create index if not exists idx_competitor_changes_competitor
  on competitor_changes(competitor_id, detected_at desc);

create index if not exists idx_competitor_changes_site
  on competitor_changes(site_id, detected_at desc);

comment on table competitor_changes is
  'Лог зафіксованих змін на сторінках конкурентів. Один запис = одна зміна (хеш до/після).';
