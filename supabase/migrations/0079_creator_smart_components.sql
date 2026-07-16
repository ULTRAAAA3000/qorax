-- 0079_creator_smart_components.sql
-- Qorax Creator — Smart Components: "живий зв'язок з даними"
-- (MODULE_ROADMAP.md "Qorax Creator", п'ятий крок за порядком
-- реалізації: Website Mode → Diagram Mode → Live Objects →
-- Components/Brand Kit → Smart Components (ця міграція) → AI
-- Creator → ...).
--
-- НЕ Knowledge Graph і НЕ Platform Object Bridge (canvas_nodes.
-- ref_table/ref_id з Website Mode, 0071) — інша задача. kg_nodes.
-- ref_table/ref_id кажуть "цей товар існує і з чимось пов'язаний".
-- bound_ref_table/bound_ref_id/field_bindings кажуть "ця картка на
-- Canvas ПОКАЗУЄ живі дані цього товару" — рендер читає джерело
-- істини щоразу при показі, не кешує значення жорстко в
-- canvas_nodes.data. Коли ціна зміниться в Commerce, картка
-- оновиться сама при наступному відкритті дошки, без дії
-- користувача над самою карткою.
--
-- Схема — дослівно з плану (розділ "Smart Components — живий
-- зв'язок з даними").

alter table canvas_nodes add column bound_ref_table text;
alter table canvas_nodes add column bound_ref_id uuid;
alter table canvas_nodes add column field_bindings jsonb;

comment on column canvas_nodes.bound_ref_table is 'Таблиця джерела живих даних для Smart Component (напр. "products"). NULL для вузлів без live-прив''язки (embedded_editor, live_embed, звичайні kg_nodes-посилання через ref_table/ref_id) — не плутати з ref_table/ref_id (ті кажуть "існує і пов''язаний", ці — "показує й оновлюється").';
comment on column canvas_nodes.bound_ref_id is 'id рядка в bound_ref_table, чиї дані показує ця картка.';
comment on column canvas_nodes.field_bindings is 'Мапінг слотів компонента на колонки bound_ref_table, напр. {"title": "name", "price_label": "price_cents"}. Рендер читає bound_ref_table/bound_ref_id за цим мапінгом у момент показу, значення в data (jsonb) для таких вузлів не є джерелом істини.';

create index idx_canvas_nodes_bound_ref on canvas_nodes(bound_ref_table, bound_ref_id) where bound_ref_table is not null and bound_ref_id is not null;
