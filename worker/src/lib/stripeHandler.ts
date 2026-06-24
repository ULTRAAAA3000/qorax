// ============================================================
// stripeHandler.ts — HTTP handlers для Stripe endpoints
// ============================================================

import type { Env } from "../types";
import {
  createCheckoutSession,
  createBillingPortalSession,
  verifyStripeWebhook,
  handleStripeWebhook,
} from "./stripe";
import { selectRows } from "./supabase";

const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "https://qorax.mrcru96.workers.dev",
];

function cors(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function jsonResp(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...cors(origin) },
  });
}

// Верифікація JWT і отримання org_id
async function getOrgIdFromJwt(
  request: Request,
  env: Env
): Promise<{ orgId: string; email: string } | null> {
  const auth = request.headers.get("Authorization");
  const jwt = auth?.replace("Bearer ", "").trim();
  if (!jwt) return null;

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userResp.ok) return null;
  const user = (await userResp.json()) as { id?: string; email?: string };
  if (!user.id) return null;

  const memberResult = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&user_id=eq.${user.id}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!memberResult.ok || !memberResult.data[0]) return null;

  return {
    orgId: memberResult.data[0].organization_id,
    email: user.email ?? "",
  };
}

// POST /api/stripe/checkout — створення Checkout Session
export async function handleStripeCheckout(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const orgData = await getOrgIdFromJwt(request, env);
  if (!orgData) return jsonResp({ error: "Unauthorized" }, 401, origin);

  let planCode: string;
  try {
    const body = (await request.json()) as { plan_code?: string };
    planCode = body.plan_code ?? "";
  } catch {
    return jsonResp({ error: "Invalid JSON" }, 400, origin);
  }

  if (!["starter", "growth", "agency"].includes(planCode)) {
    return jsonResp({ error: "Невалідний план" }, 400, origin);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResp({ error: "Stripe не налаштовано" }, 503, origin);
  }

  const result = await createCheckoutSession(
    {
      organizationId: orgData.orgId,
      planCode,
      userEmail: orgData.email,
      successUrl: `${env.APP_URL}/dashboard?stripe=success`,
      cancelUrl: `${env.APP_URL}/dashboard/upgrade?stripe=cancel`,
    },
    env.STRIPE_SECRET_KEY,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.APP_URL
  );

  if (!result.ok) return jsonResp({ error: result.error }, 500, origin);
  return jsonResp({ url: result.url }, 200, origin);
}

// POST /api/stripe/portal — Billing Portal
export async function handleStripePortal(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const orgData = await getOrgIdFromJwt(request, env);
  if (!orgData) return jsonResp({ error: "Unauthorized" }, 401, origin);

  if (!env.STRIPE_SECRET_KEY) {
    return jsonResp({ error: "Stripe не налаштовано" }, 503, origin);
  }

  const result = await createBillingPortalSession(
    orgData.orgId,
    env.STRIPE_SECRET_KEY,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    env.APP_URL
  );

  if (!result.ok) return jsonResp({ error: result.error }, 500, origin);
  return jsonResp({ url: result.url }, 200, origin);
}

// POST /api/stripe/webhook — webhook від Stripe
export async function handleStripeWebhookRequest(
  request: Request,
  env: Env
): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const payload = await request.text();
  const signature = request.headers.get("Stripe-Signature") ?? "";

  const valid = await verifyStripeWebhook(payload, signature, env.STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error("[stripe] Invalid webhook signature");
    return new Response("Invalid signature", { status: 400 });
  }

  let event: { id: string; type: string; data: { object: unknown } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const result = await handleStripeWebhook(
    event,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log("[stripe webhook] result:", JSON.stringify(result));
  return new Response(JSON.stringify(result), { status: 200 });
}
