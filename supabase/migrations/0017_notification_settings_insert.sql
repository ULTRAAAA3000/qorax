-- ============================================================
-- QORAX — Migration 0017: RLS insert policy for notification_settings
-- ============================================================
-- notification_settings создаётся автоматически при первом
-- обращении к настройкам уведомлений. Нужна insert-политика
-- чтобы owner мог создать запись для своей организации.
-- ============================================================

create policy "Owners can insert notification settings"
  on notification_settings for insert
  with check (
    organization_id in (
      select organization_id from organization_members
      where user_id = auth.uid() and role in ('owner', 'admin')
    )
  );
