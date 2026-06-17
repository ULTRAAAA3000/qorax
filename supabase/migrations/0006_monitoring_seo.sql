-- ============================================================
-- QORAX — Migration 0006: Monitoring — SEO (meta, schema, GSC, sitemap, duplicates)
-- ============================================================

-- ------------------------------------------------------------
-- page_seo_audits — проверка meta-тегов и schema по каждой странице сайта
-- ------------------------------------------------------------

create table page_seo_audits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url text not null,
  title text,
  title_length integer,
  meta_description text,
  meta_description_length integer,
  has_h1 boolean,
  h1_count integer,
  has_schema_markup boolean,
  schema_types jsonb default '[]', -- какие типы schema.org найдены (Organization, Product, и т.д.)
  issues jsonb not null default '[]', -- список проблем: "title слишком длинный", "нет meta description" и т.д.
  checked_at timestamptz not null default now()
);

comment on table page_seo_audits is 'SEO-проверка отдельной страницы: meta теги, заголовки, schema markup. Краулится раз в неделю.';

create index idx_page_seo_site_time on page_seo_audits(site_id, checked_at desc);
create index idx_page_seo_site_url on page_seo_audits(site_id, page_url);

-- ------------------------------------------------------------
-- duplicate_pages — найденные дубликаты контента
-- ------------------------------------------------------------

create table duplicate_pages (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  page_url_a text not null,
  page_url_b text not null,
  similarity_score numeric(4, 3), -- 0.000-1.000, насколько похож контент
  detected_at timestamptz not null default now(),
  resolved boolean not null default false
);

comment on table duplicate_pages is 'Пары страниц с дублирующимся или почти одинаковым контентом (сравнение по хэшу/similarity).';

create index idx_duplicate_pages_site on duplicate_pages(site_id);

-- ------------------------------------------------------------
-- sitemap_audits — проверка sitemap.xml и robots.txt
-- ------------------------------------------------------------

create table sitemap_audits (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  sitemap_found boolean not null default false,
  sitemap_url text,
  urls_in_sitemap integer,
  sitemap_errors jsonb default '[]',
  robots_found boolean not null default false,
  robots_blocks_important_pages boolean default false, -- критическая проблема: robots.txt блокирует нужные страницы
  robots_issues jsonb default '[]',
  checked_at timestamptz not null default now()
);

comment on table sitemap_audits is 'Валидация sitemap.xml (структура, доступность) и robots.txt (не блокирует ли важные страницы).';

create index idx_sitemap_audits_site_time on sitemap_audits(site_id, checked_at desc);

-- ------------------------------------------------------------
-- gsc_connections — OAuth подключение к Google Search Console
-- ------------------------------------------------------------

create table gsc_connections (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade unique,
  gsc_property_url text not null, -- какой property в GSC подключен
  -- refresh_token хранится зашифрованным на уровне приложения, не plaintext
  encrypted_refresh_token text not null,
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz,
  is_active boolean not null default true
);

comment on table gsc_connections is 'OAuth-подключение к Google Search Console. encrypted_refresh_token шифруется до записи в БД (не хранить plaintext токены).';

-- ------------------------------------------------------------
-- gsc_metrics — данные из Search Console (клики, показы, позиции страниц)
-- ------------------------------------------------------------

create table gsc_metrics (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id) on delete cascade,
  date date not null,
  clicks integer not null default 0,
  impressions integer not null default 0,
  ctr numeric(6, 4),
  average_position numeric(6, 2),
  page_url text, -- null = агрегат по всему сайту за день, иначе по конкретной странице
  query text, -- если данные по конкретному запросу (опционально, для будущего)
  synced_at timestamptz not null default now()
);

comment on table gsc_metrics is 'Метрики из официального GSC API: клики/показы/CTR/средняя позиция. Это НЕ парсинг позиций как у Ahrefs — данные напрямую от Google для подключённого property.';

create index idx_gsc_metrics_site_date on gsc_metrics(site_id, date desc);
create unique index idx_gsc_metrics_unique on gsc_metrics(site_id, date, coalesce(page_url, ''), coalesce(query, ''));
