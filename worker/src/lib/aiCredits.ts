// ============================================================
// aiCredits.ts — спільна перевірка/списання ai_credits.
// ============================================================
// Раніше цей блок ("select credits_remaining → якщо <= 0 відмовити →
// update credits_remaining - 1") був продубльований в 5 місцях:
// contentGeneration.ts, agentHandler.ts, sitesAiHandler.ts,
// socialHandler.ts, translatorHandler.ts. Тепер один спільний виклик —
// той самий принцип, що вже застосований для adminAuth.ts
// (requireAdmin, який теж прибрав дублювання з 4 місць index.ts).
//
// Безлімітні кредити для platform_role='admin' (Артем, липень 2026):
// НЕ плутати з organization_members.role='admin' (роль всередині
// ОДНІЄЇ організації, є в enum member_role) — тут йдеться про
// profiles.platform_role='admin', той самий глобальний прапор, що
// вже перевіряє requireAdmin() в adminAuth.ts для /api/admin/*.
// Організація вважається "адмінською" (безлімітні кредити), якщо
// хоча б один її учасник має platform_role='admin' — саме так
// власна організація Артема отримує безліміт, а не довільна
// організація, куди адміна колись додали як member.

import type { Env } from "../types";
import { selectRows, updateRows } from "./supabase";

export type AiProduct = "business" | "mail" | "creator" | "office" | "browser";

export interface CreditsCheckResult {
  /** true, якщо генерацію можна виконувати (є кредити АБО unlimited) І продукт не вимкнено адміном. */
  ok: boolean;
  /** true для organization_id, що належить platform_role='admin' — списання credit пропускається. */
  unlimited: boolean;
  /** Поточний залишок кредитів. Для unlimited — те саме значення з ai_credits (не Infinity), лише інформаційно. */
  creditsRemaining: number;
  /** true, якщо ok=false саме через ai_product_toggles.enabled=false (0082), а не через брак кредитів — фронт показує інше повідомлення. */
  disabledByAdmin: boolean;
}

/**
 * Чи належить organizationId хоча б одному profiles.platform_role='admin'.
 * Свідомо ДВА простих запити замість одного embed-запиту
 * (organization_members?select=profiles(platform_role)) — у проєкті
 * немає жодного прецеденту вкладеного select через FK (перевірено
 * при написанні benchmarkAggregator.ts), тому безпечніше не покладатись
 * на PostgREST embed-синтаксис, який тут ніде раніше не тестувався.
 */
async function orgHasAdminMember(organizationId: string, env: Env): Promise<boolean> {
  const membersRes = await selectRows<{ user_id: string }>(
    "organization_members",
    `select=user_id&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const userIds = (membersRes.data ?? []).map(m => m.user_id);
  if (userIds.length === 0) return false;

  const idsFilter = userIds.map(id => encodeURIComponent(id)).join(",");
  const profilesRes = await selectRows<{ platform_role: string }>(
    "profiles",
    `select=platform_role&id=in.(${idsFilter})&platform_role=eq.admin&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return (profilesRes.data ?? []).length > 0;
}

/**
 * Чи вимкнено AI для цього продукту глобально (0082, admin-тумблер
 * в /dashboard/admin). За замовчуванням true (fail-open), якщо рядок
 * з якоїсь причини відсутній — новий продукт без явного toggle-рядка
 * не повинен випадково заблокувати AI для всіх.
 */
async function isProductAiEnabled(product: AiProduct, env: Env): Promise<boolean> {
  const res = await selectRows<{ enabled: boolean }>(
    "ai_product_toggles",
    `select=enabled&product=eq.${encodeURIComponent(product)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const row = res.data?.[0];
  return row ? row.enabled : true;
}

/**
 * Перевіряє, чи можна витрачати AI-кредит для organizationId.
 * Викликати ДО важкої роботи (виклику Gemini) — той самий принцип,
 * що вже був у кожному з 5 місць окремо ("не витрачати квоту на
 * запит, який все одно буде відхилено"). Тепер додатково перевіряє
 * ai_product_toggles (0082) — вимкнений адміном продукт блокує
 * запит ще ДО перевірки кредитів організації, навіть для unlimited
 * адмінської організації (сам тумблер вважається вищим пріоритетом,
 * ніж unlimited — інакше admin-вимикач не мав би сенсу для власного
 * тестового акаунта Артема).
 */
export async function checkAiCredits(organizationId: string, product: AiProduct, env: Env): Promise<CreditsCheckResult> {
  const [creditsRes, isAdminOrg, productEnabled] = await Promise.all([
    selectRows<{ credits_remaining: number }>(
      "ai_credits",
      `select=credits_remaining&organization_id=eq.${encodeURIComponent(organizationId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    ),
    orgHasAdminMember(organizationId, env),
    isProductAiEnabled(product, env),
  ]);

  const creditsRemaining = creditsRes.data?.[0]?.credits_remaining ?? 0;

  if (!productEnabled) {
    return { ok: false, unlimited: isAdminOrg, creditsRemaining, disabledByAdmin: true };
  }
  if (isAdminOrg) return { ok: true, unlimited: true, creditsRemaining, disabledByAdmin: false };
  return { ok: creditsRemaining > 0, unlimited: false, creditsRemaining, disabledByAdmin: false };
}

/**
 * Списує 1 (або спеціально вказану кількість) кредит(ів) для
 * organizationId. No-op для unlimited=true — саме тут блокується
 * фактичне списання для адмінської організації, попри те, що решта
 * коду (генерація, запис в ai_generations) виконується як зазвичай.
 */
export async function deductAiCredits(
  organizationId: string,
  currentRemaining: number,
  unlimited: boolean,
  env: Env,
  amount = 1
): Promise<number> {
  if (unlimited) return currentRemaining; // безліміт — залишок у ai_credits не чіпаємо
  const next = currentRemaining - amount;
  await updateRows(
    "ai_credits",
    `organization_id=eq.${encodeURIComponent(organizationId)}`,
    { credits_remaining: next },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return next;
}
