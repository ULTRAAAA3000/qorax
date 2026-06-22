-- ============================================================
-- QORAX — Migration 0018: Telegram connect tokens
-- ============================================================
-- Тимчасові токени для підключення Telegram без ручного введення
-- Chat ID. Флоу:
--   1. Фронтенд POST /api/telegram/connect-token → отримує token
--   2. Відкриває t.me/QoraxMonitorBot?start=<token>
--   3. Користувач натискає Start → бот отримує /start <token>
--   4. Worker POST /api/telegram/webhook → знаходить org по token,
--      зберігає chat_id в notification_settings, видаляє token
-- ============================================================

create table telegram_connect_tokens (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(gen_random_bytes(16), 'hex'),
  organization_id uuid not null references organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

comment on table telegram_connect_tokens is
  'Одноразові токени для підключення Telegram-бота без ручного введення Chat ID. TTL 10 хвилин.';

create index idx_telegram_tokens_token on telegram_connect_tokens(token);
create index idx_telegram_tokens_expires on telegram_connect_tokens(expires_at);

-- RLS: читати/видаляти може тільки service_role (worker)
alter table telegram_connect_tokens enable row level security;

-- Без policy = тільки service_role має доступ. Це і є потрібна поведінка —
-- токен ніколи не читається через Supabase client з браузера.
