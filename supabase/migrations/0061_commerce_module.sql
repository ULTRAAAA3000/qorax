-- 0061_commerce_module.sql
-- Commerce — модуль для Sites-конструктора (MODULE_ROADMAP.md, розділ 6;
-- EXECUTION_PLAN.md позначав Commerce як розблокований технічно з появою
-- Sites-конструктора, черга не була визначена — ця сесія бере Commerce).
--
-- Точна схема з MODULE_ROADMAP.md розділ 6, Крок 1 — без відхилень.
-- products/product_categories/product_category_links/orders/order_items/
-- coupons — усі прив'язані до projects.id (Sites-конструктор), НЕ до
-- sites.id (моніторинг) — те саме критичне правило з PLATFORM.md, яке
-- дотримано в 0058_sites_builder.sql: "sites" і "projects" ніколи не
-- змішуються.
--
-- Перший модуль з реальними грошима КЛІЄНТА (не підписка на сам Qorax) —
-- новий рівень відповідальності. Checkout — LemonSqueezy, той самий
-- провайдер, що вже працює для підписок Qorax (webhook розширюється
-- новим case "order_created" в lemonSqueezyWebhook.ts, розрізняється
-- від майбутніх one-time покупок самого Qorax через custom_data.order_type,
-- див. коментар в самому webhook-файлі).

create table products (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  title text not null,
  description text,
  price_cents integer not null,
  currency text not null default 'USD',
  sku text,
  stock_quantity integer,            -- null = необмежено (базовий облік, не повний WMS)
  image_urls jsonb,
  seo_title text,
  seo_description text,
  status text not null default 'draft', -- draft | published | archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table products is 'Товари Commerce-модуля. Прив''язані до projects (Sites-конструктор), НЕ до sites (моніторинг) — критичне правило з PLATFORM.md.';

create index idx_products_project on products(project_id);
create index idx_products_project_status on products(project_id, status);

create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

create table product_categories (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  slug text not null,
  parent_id uuid references product_categories(id) on delete set null,
  unique (project_id, slug)
);

create index idx_product_categories_project on product_categories(project_id);

create table product_category_links (
  product_id uuid not null references products(id) on delete cascade,
  category_id uuid not null references product_categories(id) on delete cascade,
  primary key (product_id, category_id)
);

create table orders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  customer_email text not null,
  customer_name text,
  status text not null default 'pending', -- pending | paid | shipped | cancelled | refunded
  total_cents integer not null,
  currency text not null default 'USD',
  payment_provider text,              -- 'lemonsqueezy' (Stripe свідомо не додається — несумісність з Україною, tech stack)
  payment_reference text,             -- LS order id, для звірки з webhook
  shipping_address jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table orders is 'Замовлення клієнтів Commerce-магазину. Це ГРОШІ КЛІЄНТА (власника проєкту), не підписка на Qorax — окремий LemonSqueezy checkout, окремий webhook case (order_created з custom_data.order_type=commerce).';

create index idx_orders_project on orders(project_id, created_at desc);
create index idx_orders_payment_reference on orders(payment_reference) where payment_reference is not null;

create trigger trg_orders_updated_at
  before update on orders
  for each row execute function set_updated_at();

create table order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders(id) on delete cascade,
  product_id uuid references products(id) on delete set null,
  title_snapshot text not null,       -- назва товару на момент замовлення — не залежить від майбутніх правок products
  price_cents_snapshot integer not null,
  quantity integer not null default 1
);

comment on table order_items is 'title_snapshot/price_cents_snapshot фіксують стан товару на момент покупки — редагування products після замовлення не змінює історію.';

create index idx_order_items_order on order_items(order_id);

create table coupons (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  code text not null,
  discount_type text not null,        -- 'percent' | 'fixed'
  discount_value integer not null,
  max_uses integer,
  used_count integer not null default 0,
  expires_at timestamptz,
  unique (project_id, code)
);

create index idx_coupons_project on coupons(project_id);

-- ============================================================
-- RLS — той самий патерн, що project_pages (0058_sites_builder.sql):
-- доступ через project_id -> projects.organization_id -> user_organization_ids()
-- ============================================================

alter table products enable row level security;
alter table product_categories enable row level security;
alter table product_category_links enable row level security;
alter table orders enable row level security;
alter table order_items enable row level security;
alter table coupons enable row level security;

create policy "products_select_own_org" on products
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "products_insert_own_org" on products
  for insert with check (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "products_update_own_org" on products
  for update using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "products_delete_own_org" on products
  for delete using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin')
    )
  );

create policy "product_categories_select_own_org" on product_categories
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "product_categories_write_own_org" on product_categories
  for all using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

create policy "product_category_links_select_own_org" on product_category_links
  for select using (
    is_platform_admin() or
    product_id in (
      select id from products where project_id in (select id from projects where organization_id in (select user_organization_ids()))
    )
  );

create policy "product_category_links_write_own_org" on product_category_links
  for all using (
    product_id in (
      select pr.id from products pr
      join projects p on p.id = pr.project_id
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );

-- orders/order_items: SELECT для власника проєкту (перегляд замовлень
-- у дашборді). INSERT — тільки service role (checkout-флоу в worker,
-- не прямий запис з клієнта — інакше можна підробити оплачене
-- замовлення, оминувши LemonSqueezy).

create policy "orders_select_own_org" on orders
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "orders_admin_write" on orders
  for all using (is_platform_admin());

create policy "order_items_select_own_org" on order_items
  for select using (
    is_platform_admin() or
    order_id in (
      select id from orders where project_id in (select id from projects where organization_id in (select user_organization_ids()))
    )
  );

create policy "order_items_admin_write" on order_items
  for all using (is_platform_admin());

create policy "coupons_select_own_org" on coupons
  for select using (
    is_platform_admin() or
    project_id in (select id from projects where organization_id in (select user_organization_ids()))
  );

create policy "coupons_write_own_org" on coupons
  for all using (
    project_id in (
      select p.id from projects p
      join organization_members om on om.organization_id = p.organization_id
      where om.user_id = auth.uid() and om.role in ('owner', 'admin', 'editor')
    )
  );
