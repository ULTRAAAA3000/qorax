// ============================================================
// lemonSqueezyWebhook.ts — обробка webhook-подій від LemonSqueezy.
//
// Події які обробляємо:
//   subscription_created   → активуємо план, оновлюємо subscriptions
//   subscription_updated   → зміна плану або статусу
//   subscription_cancelled → статус canceled, доступ до кінця поточного періоду
//   subscription_expired   → переводимо на free
//   order_created          → разова покупка (майбутній one-time audit $19)
//
// Верифікація: HMAC-SHA256 підпис заголовку X-Signature
// Документація: https://docs.lemonsqueezy.com/help/webhooks
// ============================================================

import { selectRows, upsertRow, updateRows } from "./supabase";

// ─── Типи LS webhook payload ─────────────────────────────────

interface LSWebhookMeta {
  event_name: string;
  custom_data?: {
    org_id?: string;
    [key: string]: unknown;
  };
}

interface LSSubscriptionAttributes {
  status: string; // active | paused | past_due | unpaid | cancelled | expired | on_trial
  variant_id: number;
  product_id: number;
  customer_id: number;
  order_id: number;
  renews_at: string | null;
  ends_at: string | null;
  trial_ends_at: string | null;
  urls?: {
    customer_portal?: string;
    update_payment_method?: string;
  };
  first_subscription_item?: {
    price_id: number;
    quantity: number;
  };
}

interface LSWebhookPayload {
  meta: LSWebhookMeta;
  data: {
    id: string; // LS subscription ID (рядок)
    type: string;
    attributes: LSSubscriptionAttributes;
  };
}

// Маппінг LS статусів → наші subscription_status
function mapStatus(lsStatus: string): string {
  switch (lsStatus) {
    case "active":       return "active";
    case "on_trial":     return "trialing";
    case "past_due":     return "past_due";
    case "unpaid":       return "unpaid";
    case "cancelled":    return "canceled";
    case "expired":      return "canceled";
    case "paused":       return "canceled";
    default:             return "canceled";
  }
}

// ─── Main handler ─────────────────────────────────────────────

export async function handleLSWebhook(
  request: Request,
  supabaseUrl: string,
  serviceRoleKey: string,
  lsWebhookSecret: string
): Promise<Response> {
  const rawBody = await request.text();

  // Верифікація підпису
  const signature = request.headers.get("X-Signature");
  if (!signature || !(await verifySignature(rawBody, signature, lsWebhookSecret))) {
    console.error("[ls-webhook] Invalid signature");
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: LSWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as LSWebhookPayload;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const eventName = payload.meta?.event_name;
  console.log("[ls-webhook] event:", eventName);

  let handled = true;

  switch (eventName) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
      handled = await handleSubscriptionActive(payload, supabaseUrl, serviceRoleKey);
      break;

    case "subscription_cancelled":
    case "subscription_expired":
    case "subscription_paused":
      handled = await handleSubscriptionCancelled(payload, supabaseUrl, serviceRoleKey);
      break;

    default:
      console.log("[ls-webhook] unhandled event:", eventName);
  }

  if (!handled) {
    // Транзієнтна помилка (БД тимчасово недоступна тощо) — повертаємо 5xx,
    // щоб LemonSqueezy сприйняв доставку як невдалу і повторив webhook
    // пізніше за власним retry-розкладом. Раніше тут завжди повертався
    // 200 OK незалежно від результату обробки — якщо upsert підписки
    // падав, LS вважав webhook доставленим і НЕ повторював його, тобто
    // клієнт міг заплатити, а підписка так і не активувалась в БД.
    console.error("[ls-webhook] Processing failed, returning 500 so LemonSqueezy retries:", eventName);
    return new Response("Processing failed, please retry", { status: 500 });
  }

  return new Response("OK", { status: 200 });
}

// ─── Subscription active / updated ───────────────────────────

async function handleSubscriptionActive(
  payload: LSWebhookPayload,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<boolean> {
  const { data, meta } = payload;
  const attrs = data.attributes;
  const orgId = meta.custom_data?.org_id;
  const lsSubscriptionId = data.id;
  const lsVariantId = String(attrs.variant_id);
  const lsCustomerId = String(attrs.customer_id);
  const portalUrl = attrs.urls?.customer_portal ?? null;

  if (!orgId) {
    console.error("[ls-webhook] No org_id in custom_data");
    // Це не транзієнтна помилка (немає org_id — і повторна спроба LS
    // цього не змінить), тому повертаємо true щоб LS не ретраїв даремно.
    // Проблема лишається залогованою для ручного розбору.
    return true;
  }

  // Знаходимо план за variant_id
  // Спочатку дістаємо ВСІ плани щоб виключити проблему з RLS або типами
  const allPlansResult = await selectRows<{ id: string; code: string; ls_variant_id: string | null }>(
    "plans",
    "select=id,code,ls_variant_id",
    supabaseUrl,
    serviceRoleKey
  );

  if (!allPlansResult.ok) {
    console.error("[ls-webhook] Failed to fetch plans:", allPlansResult.error);
    return false; // транзієнтна помилка БД — хай LS повторить webhook
  }

  console.log("[ls-webhook] all plans:", {
    ok: allPlansResult.ok,
    count: allPlansResult.data.length,
    plans: allPlansResult.data.map(p => ({ code: p.code, ls_variant_id: p.ls_variant_id })),
    error: allPlansResult.error,
    lsVariantId,
    supabaseUrlPrefix: supabaseUrl?.slice(0, 40),
  });

  // Знаходимо план в пам'яті (уникаємо проблеми з типами/RLS у PostgREST фільтрі)
  const matchedPlan = allPlansResult.data.find(
    p => p.ls_variant_id !== null && String(p.ls_variant_id).trim() === String(lsVariantId).trim()
  );

  let planId: string | null = matchedPlan?.id ?? null;

  console.log("[ls-webhook] plan match:", { lsVariantId, matchedCode: matchedPlan?.code ?? null, planId });

  // Якщо variant_id не знайдений — це помилка конфігурації (новий план
  // без прив'язки ls_variant_id), не транзієнтна. Повторна спроба LS
  // нічого не виправить, тому не ретраїмо — але гучно логуємо, бо це
  // означає що клієнт заплатив, а підписка не активувалась.
  if (!planId) {
    console.error("[ls-webhook] CRITICAL: Plan not found for variant_id, subscription NOT activated:", lsVariantId, "org:", orgId);
    return true;
  }

  const status = mapStatus(attrs.status);

  const upsertResult = await upsertRow(
    "subscriptions",
    {
      organization_id: orgId,
      plan_id: planId,
      status,
      ls_subscription_id: lsSubscriptionId,
      ls_customer_id: lsCustomerId,
      ls_variant_id: lsVariantId,
      ls_customer_portal_url: portalUrl,
      trial_ends_at: attrs.trial_ends_at ?? null,
      current_period_end: attrs.renews_at ?? attrs.ends_at ?? null,
      updated_at: new Date().toISOString(),
    },
    "organization_id",
    supabaseUrl,
    serviceRoleKey
  );

  if (!upsertResult.ok) {
    console.error("[ls-webhook] Failed to upsert subscription:", upsertResult.error, "org:", orgId);
    return false; // транзієнтна помилка БД — LS повторить webhook пізніше
  }

  // Sync org_type + site_limit based on plan
  const planCode = matchedPlan?.code ?? "";
  const orgType = planCode === "agency" ? "agency" : "client";
  const siteLimit = planCode === "agency" ? 5 : 1;

  const orgUpdateResult = await updateRows(
    "organizations",
    `id=eq.${encodeURIComponent(orgId)}`,
    { org_type: orgType, site_limit: siteLimit },
    supabaseUrl,
    serviceRoleKey
  );

  if (!orgUpdateResult.ok) {
    // Підписка вже активована — це другорядне поле (site_limit/org_type),
    // тому не блокуємо весь webhook через це, але гучно логуємо для
    // ручної перевірки.
    console.error("[ls-webhook] Subscription activated but failed to sync org_type/site_limit:", orgUpdateResult.error, "org:", orgId);
  }

  console.log("[ls-webhook] subscription upserted:", { orgId, status, lsSubscriptionId, orgType, siteLimit });
  return true;
}


// ─── Subscription cancelled / expired ────────────────────────

async function handleSubscriptionCancelled(
  payload: LSWebhookPayload,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<boolean> {
  const { data, meta } = payload;
  const orgId = meta.custom_data?.org_id;

  if (!orgId) return true; // не транзієнтна помилка, ретрай не допоможе

  // Знаходимо free план
  const freePlanResult = await selectRows<{ id: string }>(
    "plans",
    "select=id&code=eq.free",
    supabaseUrl,
    serviceRoleKey
  );
  if (!freePlanResult.ok) {
    console.error("[ls-webhook] Failed to fetch free plan:", freePlanResult.error);
    return false;
  }
  const freePlanId = freePlanResult.data[0]?.id;

  const attrs = data.attributes;
  // Якщо підписка скасована але ще активна до кінця періоду — зберігаємо active
  // Якщо вже expired — переводимо на free
  const isFullyExpired = attrs.status === "expired";

  const updateResult = isFullyExpired && freePlanId
    ? await updateRows(
        "subscriptions",
        `organization_id=eq.${encodeURIComponent(orgId)}`,
        {
          plan_id: freePlanId,
          status: "canceled",
          ls_subscription_id: data.id,
          updated_at: new Date().toISOString(),
        },
        supabaseUrl,
        serviceRoleKey
      )
    : await updateRows(
        "subscriptions",
        `organization_id=eq.${encodeURIComponent(orgId)}`,
        {
          status: "canceled",
          current_period_end: attrs.ends_at ?? null,
          updated_at: new Date().toISOString(),
        },
        supabaseUrl,
        serviceRoleKey
      );

  if (!updateResult.ok) {
    console.error("[ls-webhook] Failed to update cancelled subscription:", updateResult.error, "org:", orgId);
    return false; // транзієнтна помилка БД — LS повторить webhook пізніше
  }

  console.log("[ls-webhook] subscription cancelled:", { orgId, status: attrs.status });
  return true;
}

// ─── HMAC-SHA256 signature verification ──────────────────────

async function verifySignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return computed === signature;
  } catch {
    return false;
  }
}
