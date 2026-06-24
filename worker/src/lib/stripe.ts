// ============================================================
// stripe.ts — Stripe інтеграція для Qorax.
//
// Використовуємо Stripe REST API напряму (без Node.js SDK) —
// Cloudflare Workers не підтримують Node.js-специфічні модулі
// які є в офіційному stripe npm пакеті.
//
// Підтримувані операції:
//   createCheckoutSession — створення сесії оплати
//   createBillingPortalSession — портал управління підпискою
//   constructWebhookEvent — верифікація підпису webhook
//   handleWebhookEvent — обробка подій від Stripe
// ============================================================

import { selectRows, updateRows, upsertRow } from "./supabase";

const STRIPE_API = "https://api.stripe.com/v1";

// ─── Types ───────────────────────────────────────────────────

export interface StripeCheckoutParams {
  organizationId: string;
  planCode: string;
  userEmail: string;
  successUrl: string;
  cancelUrl: string;
}

export interface StripeCheckoutResult {
  ok: boolean;
  url?: string;
  error?: string;
}

interface StripePlan {
  id: string;
  code: string;
  stripe_price_id: string | null;
}

interface StripeSubscription {
  id: string;
  organization_id: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

// ─── Checkout Session ────────────────────────────────────────

export async function createCheckoutSession(
  params: StripeCheckoutParams,
  stripeSecretKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  appUrl: string
): Promise<StripeCheckoutResult> {
  // Отримуємо stripe_price_id плану
  const planResult = await selectRows<StripePlan>(
    "plans",
    `select=id,code,stripe_price_id&code=eq.${params.planCode}`,
    supabaseUrl,
    serviceRoleKey
  );

  if (!planResult.ok || !planResult.data[0]) {
    return { ok: false, error: "План не знайдено" };
  }

  const plan = planResult.data[0];
  if (!plan.stripe_price_id) {
    return { ok: false, error: `stripe_price_id не налаштовано для плану ${params.planCode}` };
  }

  // Перевіряємо чи є вже Stripe Customer для цієї організації
  const subResult = await selectRows<StripeSubscription>(
    "subscriptions",
    `select=id,organization_id,stripe_customer_id,stripe_subscription_id&organization_id=eq.${params.organizationId}`,
    supabaseUrl,
    serviceRoleKey
  );

  const existingCustomerId = subResult.data[0]?.stripe_customer_id ?? null;

  // Формуємо параметри для Stripe Checkout
  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": plan.stripe_price_id,
    "line_items[0][quantity]": "1",
    success_url: `${appUrl}/dashboard?stripe=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dashboard/upgrade?stripe=cancel`,
    customer_email: existingCustomerId ? "" : params.userEmail,
    "metadata[organization_id]": params.organizationId,
    "metadata[plan_code]": params.planCode,
    "subscription_data[metadata][organization_id]": params.organizationId,
  });

  if (existingCustomerId) {
    body.set("customer", existingCustomerId);
    body.delete("customer_email");
  }

  const resp = await fetch(`${STRIPE_API}/checkout/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    return { ok: false, error: err.error?.message ?? "Stripe помилка" };
  }

  const session = (await resp.json()) as { url?: string };
  return { ok: true, url: session.url };
}

// ─── Billing Portal ──────────────────────────────────────────

export async function createBillingPortalSession(
  organizationId: string,
  stripeSecretKey: string,
  supabaseUrl: string,
  serviceRoleKey: string,
  appUrl: string
): Promise<StripeCheckoutResult> {
  const subResult = await selectRows<StripeSubscription>(
    "subscriptions",
    `select=stripe_customer_id&organization_id=eq.${organizationId}`,
    supabaseUrl,
    serviceRoleKey
  );

  const customerId = subResult.data[0]?.stripe_customer_id;
  if (!customerId) {
    return { ok: false, error: "Stripe customer не знайдено. Спочатку оформіть підписку." };
  }

  const body = new URLSearchParams({
    customer: customerId,
    return_url: `${appUrl}/dashboard/upgrade`,
  });

  const resp = await fetch(`${STRIPE_API}/billing_portal/sessions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const err = (await resp.json()) as { error?: { message?: string } };
    return { ok: false, error: err.error?.message ?? "Stripe portal помилка" };
  }

  const session = (await resp.json()) as { url?: string };
  return { ok: true, url: session.url };
}

// ─── Webhook ─────────────────────────────────────────────────

// Верифікація підпису Stripe webhook через HMAC-SHA256
// Stripe надсилає підпис в заголовку Stripe-Signature
export async function verifyStripeWebhook(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  try {
    // Формат: t=timestamp,v1=hash
    const parts = Object.fromEntries(
      signature.split(",").map((p) => p.split("=") as [string, string])
    );
    const timestamp = parts["t"];
    const expectedHash = parts["v1"];
    if (!timestamp || !expectedHash) return false;

    // Перевіряємо що timestamp не надто старий (5 хвилин)
    const age = Date.now() / 1000 - Number(timestamp);
    if (age > 300) return false;

    // HMAC-SHA256 через Web Crypto API (доступний в Cloudflare Workers)
    const signedPayload = `${timestamp}.${payload}`;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      key,
      new TextEncoder().encode(signedPayload)
    );
    const computed = Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return computed === expectedHash;
  } catch {
    return false;
  }
}

// Обробка Stripe webhook подій
export async function handleStripeWebhook(
  event: StripeEvent,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; message: string }> {
  console.log("[stripe webhook] event:", event.type, event.id);

  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(event.data.object as StripeCheckoutSession, supabaseUrl, serviceRoleKey);

    case "customer.subscription.updated":
      return handleSubscriptionUpdated(event.data.object as StripeSubscriptionObject, supabaseUrl, serviceRoleKey);

    case "customer.subscription.deleted":
      return handleSubscriptionDeleted(event.data.object as StripeSubscriptionObject, supabaseUrl, serviceRoleKey);

    case "invoice.payment_failed":
      return handlePaymentFailed(event.data.object as StripeInvoice, supabaseUrl, serviceRoleKey);

    default:
      return { ok: true, message: `Event ${event.type} ignored` };
  }
}

// checkout.session.completed — користувач щойно оплатив
async function handleCheckoutCompleted(
  session: StripeCheckoutSession,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; message: string }> {
  const organizationId = session.metadata?.organization_id;
  const planCode = session.metadata?.plan_code;

  if (!organizationId || !planCode) {
    return { ok: false, message: "Missing metadata in checkout session" };
  }

  // Отримуємо plan_id з БД
  const planResult = await selectRows<{ id: string }>(
    "plans",
    `select=id&code=eq.${planCode}`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!planResult.ok || !planResult.data[0]) {
    return { ok: false, message: `Plan ${planCode} not found` };
  }
  const planId = planResult.data[0].id;

  // Оновлюємо або створюємо підписку
  const result = await upsertRow(
    "subscriptions",
    {
      organization_id: organizationId,
      plan_id: planId,
      status: "active",
      stripe_customer_id: session.customer,
      stripe_subscription_id: session.subscription,
      stripe_webhook_event_id: session.id,
      trial_ends_at: null,
    },
    "organization_id",
    supabaseUrl,
    serviceRoleKey
  );

  if (!result.ok) {
    return { ok: false, message: result.error ?? "Failed to update subscription" };
  }

  // Оновлюємо site_limit організації відповідно до плану
  await updateSiteLimitForPlan(organizationId, planCode, supabaseUrl, serviceRoleKey);

  return { ok: true, message: `Subscription activated for org ${organizationId}, plan ${planCode}` };
}

// customer.subscription.updated — зміна плану, відновлення, etc.
async function handleSubscriptionUpdated(
  sub: StripeSubscriptionObject,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; message: string }> {
  const organizationId = sub.metadata?.organization_id;
  if (!organizationId) {
    // Шукаємо по stripe_customer_id
    const subResult = await selectRows<{ organization_id: string }>(
      "subscriptions",
      `select=organization_id&stripe_customer_id=eq.${sub.customer}`,
      supabaseUrl,
      serviceRoleKey
    );
    if (!subResult.ok || !subResult.data[0]) {
      return { ok: false, message: `No subscription found for customer ${sub.customer}` };
    }
  }

  const orgId = organizationId ?? await getOrgByCustomer(sub.customer, supabaseUrl, serviceRoleKey);
  if (!orgId) return { ok: false, message: "Organization not found" };

  // Маппінг Stripe status → наш status
  const statusMap: Record<string, string> = {
    active: "active",
    trialing: "trialing",
    past_due: "past_due",
    canceled: "canceled",
    unpaid: "unpaid",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
  };

  await updateRows(
    "subscriptions",
    `organization_id=eq.${orgId}`,
    {
      status: statusMap[sub.status] ?? "active",
      stripe_subscription_id: sub.id,
      current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
      current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
      cancel_at_period_end: sub.cancel_at_period_end,
    },
    supabaseUrl,
    serviceRoleKey
  );

  return { ok: true, message: `Subscription updated for org ${orgId}` };
}

// customer.subscription.deleted — підписка скасована
async function handleSubscriptionDeleted(
  sub: StripeSubscriptionObject,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; message: string }> {
  const orgId = await getOrgByCustomer(sub.customer, supabaseUrl, serviceRoleKey);
  if (!orgId) return { ok: false, message: `No org for customer ${sub.customer}` };

  // Переводимо на free план
  const freePlanResult = await selectRows<{ id: string }>(
    "plans",
    "select=id&code=eq.free",
    supabaseUrl,
    serviceRoleKey
  );
  const freePlanId = freePlanResult.data[0]?.id;

  await updateRows(
    "subscriptions",
    `organization_id=eq.${orgId}`,
    {
      status: "canceled",
      plan_id: freePlanId,
      cancel_at_period_end: false,
    },
    supabaseUrl,
    serviceRoleKey
  );

  await updateSiteLimitForPlan(orgId, "free", supabaseUrl, serviceRoleKey);
  return { ok: true, message: `Subscription canceled for org ${orgId}, moved to free` };
}

// invoice.payment_failed
async function handlePaymentFailed(
  invoice: StripeInvoice,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; message: string }> {
  const orgId = await getOrgByCustomer(invoice.customer, supabaseUrl, serviceRoleKey);
  if (!orgId) return { ok: false, message: `No org for customer ${invoice.customer}` };

  await updateRows(
    "subscriptions",
    `organization_id=eq.${orgId}`,
    { status: "past_due" },
    supabaseUrl,
    serviceRoleKey
  );

  return { ok: true, message: `Marked past_due for org ${orgId}` };
}

// ─── helpers ─────────────────────────────────────────────────

async function getOrgByCustomer(
  customerId: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<string | null> {
  const result = await selectRows<{ organization_id: string }>(
    "subscriptions",
    `select=organization_id&stripe_customer_id=eq.${customerId}&limit=1`,
    supabaseUrl,
    serviceRoleKey
  );
  return result.data[0]?.organization_id ?? null;
}

async function updateSiteLimitForPlan(
  organizationId: string,
  planCode: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  const limitMap: Record<string, number> = {
    free: 1,
    trial: 1,
    starter: 1,
    growth: 1,
    agency: 5,
    admin: 999999,
  };
  const limit = limitMap[planCode] ?? 1;
  await updateRows(
    "organizations",
    `id=eq.${organizationId}`,
    { site_limit: limit },
    supabaseUrl,
    serviceRoleKey
  );
}

// ─── Stripe event types (мінімальні) ─────────────────────────

interface StripeEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

interface StripeCheckoutSession {
  id: string;
  customer: string;
  subscription: string;
  metadata?: { organization_id?: string; plan_code?: string };
}

interface StripeSubscriptionObject {
  id: string;
  customer: string;
  status: string;
  current_period_start: number;
  current_period_end: number;
  cancel_at_period_end: boolean;
  metadata?: { organization_id?: string };
}

interface StripeInvoice {
  customer: string;
}
