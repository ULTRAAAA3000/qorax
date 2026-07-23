-- ============================================================
-- QORAX — Migration 0084: Developer API Keys (SEO Audit API MVP)
-- ============================================================
-- Артем (липень 2026): фундамент для публічної "Qorax SEO Platform" —
-- API для зовнішніх розробників/агентств/сервісів, які хочуть
-- вбудувати SEO-аудит у свій продукт. Узгоджено з Артемом: з п'яти
-- API з початкового плану (SEO Audit/AI SEO/Schema/Monitoring/
-- Reporting) стартуємо ЛИШЕ з SEO Audit API, і лише фундамент —
-- таблиця ключів + автентифікація + один ендпоінт POST /api/v1/audit
-- + базовий rate limit. Білінг/Stripe-інтеграція, SDK, White Label,
-- решта чотирьох API — свідомо НЕ цей прохід.
--
-- Один ключ на organization (не на користувача) — той самий рівень
-- скоупу, що інші platform-ресурси (sites, subscriptions), щоб ключ
-- пережив зміну складу команди в організації.
-- ============================================================

create table developer_api_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  -- Зберігаємо лише SHA-256 хеш ключа, ніколи сам ключ (той самий
  -- принцип, що паролі) — навіть service-role доступ до БД не дає
  -- прочитати робочий ключ. Префікс (перші 8 символів) зберігається
  -- окремо в plaintext лише для того, щоб користувач міг впізнати
  -- свій ключ у списку ("qrx_a1b2c3d4...") не бачачи його цілком.
  key_hash text not null unique,
  key_prefix text not null,
  label text not null default 'Default key',
  -- Місячний ліміт запитів — фіксований на MVP (не завʼязаний на
  -- тарифний план організації, бо білінгу для Developer API ще
  -- немає). requests_used обнуляється cron'ом на початку кожного
  -- календарного місяця (period_start).
  requests_limit integer not null default 1000,
  requests_used integer not null default 0,
  period_start date not null default date_trunc('month', now())::date,
  revoked boolean not null default false,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

comment on table developer_api_keys is
  'API-ключі для публічної Qorax SEO Platform (Developer API). Один ключ на organization. Ключ зберігається лише як SHA-256 хеш — worker/src/lib/developerApiAuth.ts хешує вхідний ключ запиту й порівнює з key_hash.';

create index idx_developer_api_keys_org on developer_api_keys(organization_id);

alter table developer_api_keys enable row level security;

-- Читати/створювати/відкликати ключі може будь-хто в межах своєї
-- організації — той самий паттерн, що інші org-scoped ресурси
-- (RLS 0011: user_organization_ids()). Сам worker звертається через
-- service-role і проходить повз RLS — це для Dashboard-UI генерації
-- ключа.
create policy "developer_api_keys_select_own_org" on developer_api_keys
  for select using (organization_id in (select user_organization_ids()) or is_platform_admin());

create policy "developer_api_keys_insert_own_org" on developer_api_keys
  for insert with check (organization_id in (select user_organization_ids()) or is_platform_admin());

create policy "developer_api_keys_update_own_org" on developer_api_keys
  for update using (organization_id in (select user_organization_ids()) or is_platform_admin());

-- ─── Лог запитів ────────────────────────────────────────────
-- Легкий audit-лог викликів Developer API — не для rate-limit
-- (той рахується атомарно через requests_used вище), а для того,
-- щоб власник організації бачив історію викликів свого ключа
-- (яка URL перевірялась, коли, чи була помилка).
create table developer_api_requests (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references developer_api_keys(id) on delete cascade,
  endpoint text not null,
  target_url text,
  status_code integer,
  created_at timestamptz not null default now()
);

create index idx_developer_api_requests_key on developer_api_requests(api_key_id, created_at desc);

alter table developer_api_requests enable row level security;

create policy "developer_api_requests_select_own_org" on developer_api_requests
  for select using (
    api_key_id in (
      select id from developer_api_keys
      where organization_id in (select user_organization_ids()) or is_platform_admin()
    )
  );
