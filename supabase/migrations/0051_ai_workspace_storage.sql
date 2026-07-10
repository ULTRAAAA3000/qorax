-- 0051_ai_workspace_storage.sql
-- Storage bucket для вкладки Workspace (MODULE_ROADMAP.md розділ
-- "Третя хвиля", EXECUTION_PLAN.md: Chat вже перенесено, наступний
-- крок — Workspace). ai_files (0049_qorax_ai_hub.sql) вже описує
-- метадані, storage_path посилається на файл у цьому bucket.
--
-- На відміну від 0028_white_label_logo_storage.sql (публічний bucket
-- для лого) — цей bucket ПРИВАТНИЙ: документи клієнта (звіти,
-- прайс-листи, будь-які PDF/CSV/DOCX/зображення, завантажені для
-- AI-аналізу) не повинні бути доступні без авторизації.
--
-- Шлях файлу: {organization_id}/{ai_files.id}.{ext} — той самий
-- патерн foldername-перевірки, що вже в 0028.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-workspace-files',
  'ai-workspace-files',
  false, -- приватний, на відміну від agency-logos
  5242880, -- 5 MB (рішення Артема — не 20 MB ближче до Gemini inline ліміту)
  array[
    'application/pdf',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', -- .docx
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
on conflict (id) do nothing;

-- Читання: лише учасники тієї ж організації (перший сегмент шляху =
-- organization_id), не публічно як agency-logos.
create policy "Org members can read their workspace files"
on storage.objects for select
using (
  bucket_id = 'ai-workspace-files'
  and (storage.foldername(name))[1] in (
    select organization_id::text
    from organization_members
    where user_id = auth.uid()
  )
);

-- Завантаження: editor+ у свою теку (той самий рівень доступу, що
-- ai_files_insert_own_org policy в 0049)
create policy "Org members can upload workspace files"
on storage.objects for insert
with check (
  bucket_id = 'ai-workspace-files'
  and (storage.foldername(name))[1] in (
    select organization_id::text
    from organization_members
    where user_id = auth.uid()
      and role in ('owner', 'admin', 'editor')
  )
);

-- Видалення: той самий рівень, що ai_files_delete_own_org policy
create policy "Org members can delete workspace files"
on storage.objects for delete
using (
  bucket_id = 'ai-workspace-files'
  and (storage.foldername(name))[1] in (
    select organization_id::text
    from organization_members
    where user_id = auth.uid()
      and role in ('owner', 'admin', 'editor')
  )
);

-- Примітка: ці policy стосуються ПРЯМОГО доступу через Supabase client
-- (authenticated роль). Worker використовує service_role key і
-- обходить RLS повністю (той самий устояний патерн, що вже
-- задокументовано в 0011_row_level_security.sql) — тому основний
-- upload/delete-флоу через worker працює незалежно від цих policy;
-- вони потрібні на випадок майбутнього прямого доступу з клієнта.
