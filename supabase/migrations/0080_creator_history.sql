-- 0080_creator_history.sql
-- Qorax Creator — History: append-only версіонування вузлів канвасу
-- (MODULE_ROADMAP.md "Qorax Creator", "Developer Mode, History,
-- Multiplayer, Marketplace": "History дешевше за real-time
-- мультиплеєр: append-only canvas_node_versions (знімок
-- data/field_bindings при кожній суттєвій зміні) — можна зробити
-- раніше за Multiplayer, не залежить від Durable Objects").
--
-- Знімається при create/update-геометрії/delete вузла (Артем: "теж
-- при зміні позиції/розміру" — детальніша історія, ціною більшого
-- обсягу записів, ніж мінімальний варіант "тільки create/delete").
--
-- Append-only: немає update/delete-політик для звичайних
-- користувачів (лише insert+select) — історія не повинна редагуватись
-- заднім числом, інакше це вже не історія.

create table canvas_node_versions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid references canvas_nodes(id) on delete set null, -- NOT NULL навмисно прибрано: on delete cascade видалив би ВСЮ історію вузла разом із самим вузлом, включно зі щойно вставленим знімком "deleted" — суперечить самій меті append-only History ("цей вузол існував, ось хто і коли його видалив"). set null зберігає рядки історії, лише розриває посилання на вже неіснуючий вузол.
  board_id uuid not null references canvas_boards(id) on delete cascade, -- денормалізовано з canvas_nodes.board_id — дозволяє читати історію ВСІЄЇ дошки одним запитом, без join через canvas_nodes для кожного рядка
  event text not null,   -- 'created' | 'updated' | 'deleted' — тип події, що спричинила знімок
  snapshot jsonb not null, -- знімок { node_type, position_x, position_y, width, height, data, ref_table, ref_id, bound_ref_table, bound_ref_id, field_bindings } на момент події
  created_by uuid references auth.users(id) on delete set null, -- хто зробив зміну; null якщо користувача не вдалось визначити (не критично для append-only логу)
  created_at timestamptz not null default now()
);

comment on table canvas_node_versions is
  'Append-only історія змін вузлів Qorax Creator. Знімок робиться при create/update(геометрія)/delete. Дешевша альтернатива real-time Multiplayer (MODULE_ROADMAP.md "Qorax Creator") — не потребує Durable Objects, дає базову "хто і коли що змінив" і можливість відкату.';

create index idx_canvas_node_versions_node on canvas_node_versions(node_id, created_at desc);
create index idx_canvas_node_versions_board on canvas_node_versions(board_id, created_at desc);

alter table canvas_node_versions enable row level security;

-- Той самий organization-рівня доступ, що canvas_boards/canvas_nodes
-- (через board_id -> canvas_boards.organization_id), але ТІЛЬКИ
-- select для звичайних учасників організації — insert виконує
-- виключно worker (service role, обходить RLS) одразу після
-- операції над canvas_nodes, не сам користувач напряму.
create policy "canvas_node_versions_select" on canvas_node_versions
  for select using (
    board_id in (
      select id from canvas_boards
      where organization_id in (select user_organization_ids())
    )
    or is_platform_admin()
  );
