-- ============================================================
-- QORAX — Migration 0087: product_tours_seen
-- ============================================================
-- Інтерактивний тур по продуктах (Артем: "давай зробимо
-- інтерактивний тур для новозареєстрованих користувачів... по
-- кожному продукту") — Dashboard/Mail/Creator/Office/Browser, кожен
-- зі своїм окремим туром.
--
-- Персональний стан per-user, НЕ per-organization: людина, що
-- приєдналась до вже існуючої організації (запрошений тімейт),
-- повинна побачити тур сама вперше, незалежно від того, чи
-- організація вже давно існує. Тому окрема таблиця, а не поле на
-- organizations (як onboarding_dismissed, 0037) — той стан
-- організаційний, цей — особистий.
--
-- Один рядок = один переглянутий тур одним користувачем. Автозапуск
-- при першому вході в продукт перевіряє відсутність рядка;
-- "Показати тур знову" (ручний перезапуск) не залежить від цієї
-- таблиці взагалі — це просто прямий виклик тура з UI, без запису.
-- ============================================================

create table if not exists product_tours_seen (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  -- 'dashboard' | 'mail' | 'creator' | 'office' | 'browser'
  product text not null,
  seen_at timestamptz not null default now(),
  unique (user_id, product)
);

create index idx_product_tours_seen_user on product_tours_seen(user_id);

alter table product_tours_seen enable row level security;

-- Користувач читає/пише лише свій власний прогрес турів
create policy "users manage own tour state"
  on product_tours_seen
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

comment on table product_tours_seen is
  'Які інтерактивні тури по продуктах користувач уже бачив (автозапуск при першому вході). Персональне, не організаційне — на відміну від organizations.onboarding_dismissed.';
