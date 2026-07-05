// ============================================================
// referralCommission.ts — нарахування комісії партнеру за платіж
// приведеного ним клієнта (subscription_payment_success webhook).
//
// Вікно атрибуції: 30 днів від organizations.referred_at. Комісія
// нараховується лише за платежі В МЕЖАХ цього вікна — тобто фактично
// тільки за перший місяць оплати (не recurring на весь час підписки).
// ============================================================

import { selectRows } from "./supabase";

const COMMISSION_RATE = 0.25; // 25% — середнє в діапазоні 20-30%, домовленому з Артемом
const ATTRIBUTION_WINDOW_DAYS = 30;

interface OrgReferralInfo {
  id: string;
  referred_by_org_id: string | null;
  referred_at: string | null;
}

/**
 * Обробляє нарахування комісії за успішний платіж. Викликається з
 * lemonSqueezyWebhook.ts на подію subscription_payment_success.
 *
 * Повертає true якщо оброблено успішно АБО якщо нарахування не
 * застосовується (немає реферала, вікно минуло) — в обох випадках
 * webhook вважається успішно обробленим. Повертає false лише при
 * транзієнтній помилці БД, щоб LemonSqueezy повторив доставку.
 */
export async function processReferralCommission(
  organizationId: string,
  invoiceId: string,
  lsSubscriptionId: string | null,
  paymentAmountUsd: number,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<boolean> {
  // Чи приведена ця організація партнером?
  const orgResult = await selectRows<OrgReferralInfo>(
    "organizations",
    `select=id,referred_by_org_id,referred_at&id=eq.${organizationId}`,
    supabaseUrl,
    serviceRoleKey
  );

  if (!orgResult.ok) {
    console.error("[referral] Failed to fetch organization:", orgResult.error);
    return false;
  }

  const org = orgResult.data[0];
  if (!org || !org.referred_by_org_id || !org.referred_at) {
    // Органічна реєстрація, без реферала — нічого нараховувати, це не помилка
    return true;
  }

  const referredAt = new Date(org.referred_at).getTime();
  const windowEnd = referredAt + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (Date.now() > windowEnd) {
    console.log("[referral] Payment outside attribution window, no commission:", { organizationId, referredAt: org.referred_at });
    return true;
  }

  const commissionAmount = Math.round(paymentAmountUsd * COMMISSION_RATE * 100) / 100;

  // INSERT напряму (не через insertRow helper) щоб точно розрізнити
  // 409 Conflict (webhook вже оброблено раніше — унікальний constraint
  // на ls_subscription_invoice_id, ідемпотентність при retry) від
  // реальної транзієнтної помилки БД.
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/referral_commissions`, {
      method: "POST",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        referrer_org_id: org.referred_by_org_id,
        referred_org_id: organizationId,
        ls_subscription_invoice_id: invoiceId,
        ls_subscription_id: lsSubscriptionId,
        payment_amount_usd: paymentAmountUsd,
        commission_rate: COMMISSION_RATE,
        commission_amount_usd: commissionAmount,
        status: "pending",
      }),
    });

    if (response.status === 409) {
      // Цей інвойс вже нарахований раніше (повторна доставка webhook) —
      // це очікувана ідемпотентність, не помилка.
      console.log("[referral] Commission already recorded for invoice (idempotent):", invoiceId);
      return true;
    }

    if (!response.ok) {
      const text = await response.text();
      console.error("[referral] Failed to insert commission:", response.status, text);
      return false;
    }

    console.log("[referral] Commission recorded:", {
      referrerOrgId: org.referred_by_org_id,
      referredOrgId: organizationId,
      commissionAmount,
    });
    return true;
  } catch (err) {
    console.error("[referral] Network error inserting commission:", err);
    return false;
  }
}
