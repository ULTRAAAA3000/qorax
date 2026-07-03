-- 0028_white_label_logo_storage.sql
-- Storage bucket для логотипів агентств (white-label PDF/статус-сторінки).
-- Публічний bucket на читання (лого має бути видно в PDF/на статус-сторінках
-- без авторизації — генерується воркером і відкривається клієнтами агентства),
-- запис дозволено лише власнику/адміну організації для власної теки.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agency-logos',
  'agency-logos',
  true,
  2097152, -- 2 MB
  array['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
)
on conflict (id) do nothing;

-- Файли зберігаються за шляхом: {organization_id}/logo.{ext}
-- Це дозволяє перевіряти права доступу через перший сегмент шляху.

-- Публічне читання (потрібно для рендеру в PDF та на публічних статус-сторінках)
create policy "Public read access for agency logos"
on storage.objects for select
using (bucket_id = 'agency-logos');

-- Завантаження: лише учасник організації (owner/admin ролі) у свою теку
create policy "Org members can upload their agency logo"
on storage.objects for insert
with check (
  bucket_id = 'agency-logos'
  and (storage.foldername(name))[1] in (
    select organization_id::text
    from organization_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

-- Оновлення/заміна логотипу
create policy "Org members can update their agency logo"
on storage.objects for update
using (
  bucket_id = 'agency-logos'
  and (storage.foldername(name))[1] in (
    select organization_id::text
    from organization_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);

-- Видалення логотипу
create policy "Org members can delete their agency logo"
on storage.objects for delete
using (
  bucket_id = 'agency-logos'
  and (storage.foldername(name))[1] in (
    select organization_id::text
    from organization_members
    where user_id = auth.uid()
      and role in ('owner', 'admin')
  )
);
