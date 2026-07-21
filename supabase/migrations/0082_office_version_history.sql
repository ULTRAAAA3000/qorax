-- 0082_office_version_history.sql
-- Qorax Office — Version History: append-only знімки Docs/Sheets/
-- Slides (MODULE_ROADMAP.md "Qorax Office", "Стан реалізації",
-- пункт "Version History" з повного переліку фіч — не MVP, окрема
-- ітерація після MVP).
--
-- Той самий проведений патерн, що canvas_node_versions (0080,
-- Qorax Creator History): append-only, insert лише через worker
-- (service role), select-only для звичайних учасників організації.
--
-- ОДНА таблиця на три типи документів (doc_type/doc_id), не три
-- окремі *_versions таблиці — на відміну від Creator (де History
-- прив'язана лише до canvas_nodes, один тип сутності), в Office
-- три редактори з майже ідентичною потребою "знімок вмісту з
-- часом" — узагальнена схема дешевша й простіша для одного спільного
-- worker-модуля/UI-компонента, ніж три майже однакові таблиці.
--
-- Throttle (НЕ в цій міграції, у коді worker'а): знімок робиться не
-- на кожен PATCH (600мс-дебаунс дав би сотні рядків за годину
-- редагування), а не частіше ніж раз на 10 хвилин на документ —
-- see officeVersions.ts.

create table office_document_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  doc_type text not null,   -- 'office_documents' | 'office_sheets' | 'office_slides'
  doc_id uuid not null,     -- м'яке посилання (не FK) — три різні можливі таблиці-джерела
  title text not null,
  snapshot jsonb not null,  -- content (Docs) / data (Sheets) / slides (Slides) на момент знімку
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table office_document_versions is
  'Append-only історія версій Qorax Office (Docs/Sheets/Slides одна таблиця, doc_type розрізняє). Знімок — не на кожне збереження, throttle ~10 хв у worker (officeVersions.ts). MODULE_ROADMAP.md "Qorax Office".';

create index idx_office_document_versions_doc on office_document_versions(doc_type, doc_id, created_at desc);

alter table office_document_versions enable row level security;

-- Той самий рівень доступу, що office_documents/office_sheets/
-- office_slides (organization-рівня) — insert виконує виключно
-- worker (service role, обходить RLS) одразу після PATCH-операції,
-- не сам користувач напряму.
create policy "office_document_versions_select" on office_document_versions
  for select using (
    organization_id in (select user_organization_ids())
    or is_platform_admin()
  );
