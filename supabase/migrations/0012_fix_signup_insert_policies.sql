-- ============================================================
-- QORAX — Migration 0012: Insert RLS policies for self-registration
-- ============================================================
-- БАГ: миграция 0011 включила RLS на organizations и
-- organization_members, но не добавила insert-политики для них.
-- Поскольку signUp() в auth-actions.ts создаёт organization и
-- organization_member через обычный (не service_role) клиент, каждая
-- регистрация с этого момента молча проваливалась на этом шаге —
-- пользователь попадал в /dashboard без organization, и любое
-- дальнейшее действие (например, добавление сайта) показывало
-- "Організацію не знайдено".
--
-- Эта миграция разрешает именно self-registration сценарий:
-- авторизованный пользователь может создать organization (insert
-- без ограничений по содержимому — owner-only update-политика и
-- так не даст после этого менять чужое) и добавить САМОГО СЕБЯ
-- (user_id = auth.uid()) в organization_members с любой ролью —
-- что соответствует тому, как auth-actions.ts использует это:
-- сразу после insert в organizations добавляет текущего пользователя
-- как 'owner'.
-- ============================================================

create policy "Authenticated users can create an organization"
  on organizations for insert
  with check (auth.uid() is not null);

create policy "Users can add themselves to an organization"
  on organization_members for insert
  with check (user_id = auth.uid());
