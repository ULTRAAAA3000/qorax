-- ============================================================
-- QORAX — Migration 0088: Developer Monitoring API (4-те з п'яти
-- API "Qorax SEO Platform")
-- ============================================================
-- Артем: закінчити Developer API — Monitoring API останній
-- невиконаний із початкового списку 5 (AI SEO API свідомо
-- пропущено назавжди, надто велике AI-навантаження). MVP: додати
-- URL під моніторинг, зберегти "базову лінію" (title/canonical/
-- has_schema/robots_allowed/pagespeed), щогодини звіряти з
-- baseline, записувати виявлені зміни в лог. Без webhook-доставки
-- назовні (окремий наступний крок) — зміни видно через GET.
-- ============================================================

create table developer_monitored_urls (
  id uuid primary key default gen_random_uuid(),
  api_key_id uuid not null references developer_api_keys(id) on delete cascade,
  url text not null,
  active boolean not null default true,
  -- Baseline — "останній відомий стан", з яким звіряється кожна
  -- нова перевірка. Оновлюється при кожній зміні (не лише при
  -- створенні) — той самий принцип, що "стежити за поточним станом",
  -- не "звіряти завжди з першим знімком": після зафіксованої зміни
  -- baseline стає НОВИМ станом, інакше один заголовок title
  -- генерував би "зміну" щогодини нескінченно.
  baseline_title text,
  baseline_canonical text,
  baseline_has_schema boolean,
  baseline_robots_allowed boolean,
  baseline_pagespeed_mobile integer,
  last_checked_at timestamptz,
  last_check_ok boolean,
  created_at timestamptz not null default now()
);

comment on table developer_monitored_urls is
  'URL під моніторингом через публічний Qorax Monitoring API (Developer API). Один рядок = один відстежуваний URL для конкретного API-ключа. Щогодинний cron (worker/src/index.ts, "0 * * * *" тригер) звіряє поточний стан з baseline, записує зміни в developer_monitor_changes, оновлює baseline при виявленій зміні.';

create index idx_developer_monitored_urls_key on developer_monitored_urls(api_key_id);
create index idx_developer_monitored_urls_active on developer_monitored_urls(active) where active = true;

alter table developer_monitored_urls enable row level security;

-- Читати/створювати/видаляти може будь-хто в межах своєї
-- організації (через JOIN на developer_api_keys.organization_id) —
-- той самий паттерн, що developer_api_requests (0084).
create policy "developer_monitored_urls_select_own_org" on developer_monitored_urls
  for select using (
    api_key_id in (
      select id from developer_api_keys
      where organization_id in (select user_organization_ids()) or is_platform_admin()
    )
  );

-- ─── Лог виявлених змін ─────────────────────────────────────
create table developer_monitor_changes (
  id uuid primary key default gen_random_uuid(),
  monitored_url_id uuid not null references developer_monitored_urls(id) on delete cascade,
  field text not null, -- 'title' | 'canonical' | 'schema' | 'robots' | 'pagespeed'
  old_value text,
  new_value text,
  detected_at timestamptz not null default now()
);

comment on table developer_monitor_changes is
  'Лог виявлених змін для developer_monitored_urls — кожен рядок це ОДНА зміна ОДНОГО поля (title/canonical/schema/robots/pagespeed), виявлена під час щогодинної cron-перевірки. field="pagespeed" — old_value/new_value зберігають число як text (простіше за окрему числову колонку для однієї строкової таблиці змін).';

create index idx_developer_monitor_changes_url on developer_monitor_changes(monitored_url_id, detected_at desc);

alter table developer_monitor_changes enable row level security;

create policy "developer_monitor_changes_select_own_org" on developer_monitor_changes
  for select using (
    monitored_url_id in (
      select id from developer_monitored_urls
      where api_key_id in (
        select id from developer_api_keys
        where organization_id in (select user_organization_ids()) or is_platform_admin()
      )
    )
  );
