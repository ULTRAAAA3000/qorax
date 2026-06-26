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

  switch (eventName) {
    case "subscription_created":
    case "subscription_updated":
    case "subscription_resumed":
      await handleSubscriptionActive(payload, supabaseUrl, serviceRoleKey);
      break;

    case "subscription_cancelled":
    case "subscription_expired":
    case "subscription_paused":
      await handleSubscriptionCancelled(payload, supabaseUrl, serviceRoleKey);
      break;

    default:
      console.log("[ls-webhook] unhandled event:", eventName);
  }

  return new Response("OK", { status: 200 });
}

// ─── Subscription active / updated ───────────────────────────

async function handleSubscriptionActive(
  payload: LSWebhookPayload,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const { data, meta } = payload;
  const attrs = data.attributes;
  const orgId = meta.custom_data?.org_id;
  const lsSubscriptionId = data.id;
  const lsVariantId = String(attrs.variant_id);
  const lsCustomerId = String(attrs.customer_id);
  const portalUrl = attrs.urls?.customer_portal ?? null;

  if (!orgId) {
    console.error("[ls-webhook] No org_id in custom_data");
    return;
  }

  // Знаходимо план за variant_id
  // Спочатку дістаємо ВСІ плани щоб виключити проблему з RLS або типами
  const allPlansResult = await selectRows<{ id: string; code: string; ls_variant_id: string | null }>(
    "plans",
    "select=id,code,ls_variant_id",
    supabaseUrl,
    serviceRoleKey
  );

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

  // Якщо variant_id не знайдений — логуємо але не падаємо
  if (!planId) {
    console.error("[ls-webhook] Plan not found for variant_id:", lsVariantId);
    return;
  }

  const status = mapStatus(attrs.status);

  await upsertRow(
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

  console.log("[ls-webhook] subscription upserted:", { orgId, status, lsSubscriptionId });
}

// ─── Subscription cancelled / expired ────────────────────────

async function handleSubscriptionCancelled(
  payload: LSWebhookPayload,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const { data, meta } = payload;
  const orgId = meta.custom_data?.org_id;

  if (!orgId) return;

  // Знаходимо free план
  const freePlanResult = await selectRows<{ id: string }>(
    "plans",
    "select=id&code=eq.free",
    supabaseUrl,
    serviceRoleKey
  );
  const freePlanId = freePlanResult.data[0]?.id;

  const attrs = data.attributes;
  // Якщо підписка скасована але ще активна до кінця періоду — зберігаємо active
  // Якщо вже expired — переводимо на free
  const isFullyExpired = attrs.status === "expired";

  if (isFullyExpired && freePlanId) {
    await updateRows(
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
    );
  } else {
    // Cancelled але ще активна — залишаємо план, міняємо статус
    await updateRows(
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
  }

  console.log("[ls-webhook] subscription cancelled:", { orgId, status: attrs.status });
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
