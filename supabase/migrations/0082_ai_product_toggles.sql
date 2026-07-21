-- ============================================================
-- QORAX — Migration 0082: AI Product Toggles
-- ============================================================
-- Артем (липень 2026): поки немає клієнтури, потрібен простий
-- спосіб вимикати ВЕСЬ AI по кожному з п'яти продуктів екосистеми
-- (Business/Mail/Creator/Office/Browser) одним тумблером — щоб не
-- витрачати Gemini-квоту даремно. Не плутати з platform_modules
-- (0039) — той реєстр керує видимістю МОДУЛІВ у sidebar Business
-- (CRM/Social/CRO/...), тут йдеться про п'ять окремих ПРОДУКТІВ
-- екосистеми (кожен — власний топ-левел роут), і не про видимість,
-- а про фактичне вимкнення виклику Gemini на бекенді.
--
-- Свідомо ПЛОСКА структура (5 фіксованих рядків, без organization_id) —
-- це глобальний платформений перемикач, той самий рівень, що
-- platform_modules.status, не org-scoped оверрайд на кшталт
-- organization_module_access. Один тумблер на продукт вимикає AI
-- цілком (усі AI-фічі всередині продукту разом), за прямою вказівкою
-- Артема — не окремі фічі (Chat/Agents/Vision) по одній.
-- ============================================================

create table ai_product_toggles (
  -- стабильный slug продукту, використовується в коді (aiCredits.ts)
  product text primary key check (product in ('business', 'mail', 'creator', 'office', 'browser')),
  label text not null,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table ai_product_toggles is
  'Глобальний вимикач усього AI по кожному з п''яти продуктів екосистеми Qorax. enabled=false → checkAiCredits() відхиляє AI-запит цього продукту ДО виклику Gemini, незалежно від залишку ai_credits організації.';

create trigger trg_ai_product_toggles_updated_at
  before update on ai_product_toggles
  for each row execute function set_updated_at();

insert into ai_product_toggles (product, label, enabled) values
  ('business', 'Qorax Business', true),
  ('mail', 'Qorax Mail', true),
  ('creator', 'Qorax Creator', true),
  ('office', 'Qorax Office', true),
  ('browser', 'Qorax Browser', true);

-- Читати може будь-який автентифікований користувач (потрібно
-- фронтенду продукту, щоб самому показати "AI вимкнено адміном" —
-- не лише worker service-role), змінювати — лише platform admin.
-- Той самий паттерн, що platform_modules (0039) select_all +
-- is_platform_admin() insert/update/delete (0040).
alter table ai_product_toggles enable row level security;

create policy "ai_product_toggles_select_all" on ai_product_toggles
  for select using (auth.role() = 'authenticated' or auth.role() = 'anon');

create policy "ai_product_toggles_update_admin" on ai_product_toggles
  for update using (is_platform_admin());
