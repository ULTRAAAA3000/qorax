// ============================================================
// securityAuditLog.ts — єдиний спосіб писати в security_audit_log
// (SECURITY.md розділ 8; EXECUTION_PLAN.md Фаза 0.5). Один helper,
// переюзовується скрізь, де відбувається чутлива дія — не
// найдено власного логування "з нуля" в кожному handler'і.
//
// Навмисно "тихий" — помилка запису в лог НЕ повинна ламати основну
// операцію (видалення учасника команди має відбутись, навіть якщо
// insert у audit log з якоїсь причини впав). Тому catch всередині,
// не пропагується назовні.
// ============================================================

import type { Env } from "../types";
import { insertRow } from "./supabase";

export type SecurityActionType =
  | "member_role_changed"
  | "member_removed"
  | "member_invited"
  | "organization_deleted"
  | "order_deleted"
  | "order_refunded";

export async function logSecurityEvent(
  env: Env,
  params: {
    organizationId: string | null;
    actorUserId: string | null;
    actionType: SecurityActionType;
    targetTable?: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await insertRow(
      "security_audit_log",
      {
        organization_id: params.organizationId,
        actor_user_id: params.actorUserId,
        action_type: params.actionType,
        target_table: params.targetTable ?? null,
        target_id: params.targetId ?? null,
        metadata: params.metadata ?? null,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (err) {
    // Навмисно тільки console.error, не throw — лог не повинен
    // блокувати основну дію користувача.
    console.error("[security-audit-log] failed to write event", params.actionType, err);
  }
}
