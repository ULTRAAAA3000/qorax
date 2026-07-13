-- ============================================================
-- QORAX — Migration 0066: Predictive AI — ai_predictions (MVP)
-- ============================================================
-- MODULE_ROADMAP.md, "Четверта хвиля (довгострокове бачення)",
-- розділ 16 "Predictive AI". MVP навмисно вужчий за повний план
-- розділу: тільки Risk/Opportunity Detection (Крок 5 розділу —
-- "найдешевше, перевикористовує вже наявні детектори"). Traffic/
-- Ranking/Revenue Forecast і Predictive Planner — НЕ в цій міграції:
-- Forecast вимагає місяців історичних даних на організацію (з тижня
-- даних тренд не порахувати чесно), Planner — прямий наслідок AI
-- Operating System (розділ 12), якого ще нема (ai_goals/ai_plans
-- не існують). ai_roadmap_milestones з оригінального плану розділу
-- 16 звідси навмисно виключена — foreign key на ai_goals(id), якої
-- нема, зробив би цю таблицю непридатною до застосування.
--
-- prediction_type звужено до 'risk' | 'opportunity' цією міграцією
-- (не enum — текстове поле, як і в решті платформи, щоб додавання
-- 'traffic'/'ranking'/'revenue' пізніше не вимагало міграції типу).
-- ============================================================

create table ai_predictions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  site_id uuid references sites(id) on delete cascade,
  prediction_type text not null,   -- 'risk' | 'opportunity' (MVP; 'traffic'/'ranking'/'revenue'/'leads' — наступна ітерація)
  signal text not null,             -- 'keyword_position_drop' | 'keyword_position_rise' | 'speed_degradation' — конкретне джерело сигналу, для UI-іконки й фільтрації
  horizon_days integer not null default 0, -- MVP детектори констатують ПОТОЧНИЙ стан (0) — не прогноз "через N днів", а вже наявний тренд; ненульове значення — для майбутнього Forecast
  predicted_value jsonb not null,   -- гнучка структура: { metric, current, baseline, change_pct, query? } — залежить від signal
  confidence real,                  -- 0.0–1.0, якщо детектор може оцінити впевненість; null — не всі детектори MVP її дають
  based_on jsonb,                   -- джерела даних, врахованих детектором (для прозорості в UI й дебагу)
  target_date date not null,        -- дата, на яку відноситься спостереження; для MVP (horizon_days=0) співпадає з датою запуску детектора, критично для майбутньої звірки факт/прогноз коли з'явиться Forecast
  created_at timestamptz not null default now(),
  dismissed_at timestamptz          -- власник позначив картку прочитаною/неактуальною — не видаляємо запис (історія детекцій лишається), просто ховаємо з активного UI
);

comment on table ai_predictions is
  'Risk/Opportunity сигнали, отримані переформулюванням вже наявних даних (gsc_metrics.average_position, speed_checks) у структурований формат для UI-карток. MVP розділу 16 MODULE_ROADMAP.md — не ML-прогноз, а виявлення поточного тренду. Traffic/Ranking/Revenue Forecast — наступна ітерація (потребує historical baseline у кілька місяців).';

create index idx_ai_predictions_org on ai_predictions(organization_id);
create index idx_ai_predictions_site on ai_predictions(site_id) where site_id is not null;
create index idx_ai_predictions_active on ai_predictions(organization_id, created_at desc) where dismissed_at is null;

-- Уникнення дублів при щоденному крон-запуску детектора: той самий
-- сигнал для того самого сайту в межах одного дня (target_date) не
-- повинен плодити нову картку щоночі, поки тренд триває — детектор
-- робить upsert по цьому ключу, не голий insert.
create unique index idx_ai_predictions_unique_daily_signal
  on ai_predictions(site_id, signal, target_date)
  where site_id is not null;

alter table ai_predictions enable row level security;

-- Той самий патерн organization-рівня, що kg_nodes/kg_edges (0065) —
-- запис виконує виключно worker (service role, обходить RLS);
-- select-політика для фронтенда, dismiss — через update (не delete,
-- щоб зберегти історію детекцій).
create policy "ai_predictions_select" on ai_predictions
  for select using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );

create policy "ai_predictions_update" on ai_predictions
  for update using (
    organization_id in (
      select m.organization_id from organization_members m
      where m.user_id = auth.uid() and m.role in ('owner', 'admin', 'editor')
    )
  );
