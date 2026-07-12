// ============================================================
// commerceCheckout.ts — Commerce модуль, checkout-флоу
// (MODULE_ROADMAP.md розділ 6, Крок 2). Розділено від
// commerceCatalog.ts навмисно: тут гроші КЛІЄНТА (власника проєкту),
// інший рівень довіри — orders вставляє тільки цей файл (service
// role), не будь-який CRUD-ендпоінт каталогу.
//
// LemonSqueezy Checkouts API вимагає заздалегідь створений variant_id
// у Dashboard навіть для довільної (custom) ціни — товари клієнтів
// Qorax створюються динамічно, не мають власного variant у LS. Рішення
// Артема: один універсальний variant "Commerce Order" в LS Dashboard
// (LS_COMMERCE_VARIANT_ID), кожне замовлення передає свою суму через
// checkout_data.custom_price (в центах) — той самий підхід, що
// рекомендує сама LemonSqueezy для marketplace/динамічних цін.
//
// Розрізнення від order_created для підписок самого Qorax: кожен
// commerce checkout несе custom_data.order_type = "commerce" +
// custom_data.qorax_order_id (наш orders.id) — webhook-обробник
// (lemonSqueezyWebhook.ts) читає ці поля і не плутає з майбутніми
// one-time покупками самого Qorax (обробка order_created з іншим
// order_type або без нього — окрема гілка коду).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow } from "./supabase";
import { json } from "./httpUtils";
import { checkRateLimit, getClientIp } from "./rateLimit";

interface CartItem {
  product_id: string;
  quantity: number;
}

interface ProductForCheckout {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
  stock_quantity: number | null;
  status: string;
}

export async function handleCommerceCheckout(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `commerce-checkout:${clientIp}`, 10, 60);
  if (!rateLimit.allowed) return json({ error: "Забагато запитів — спробуйте пізніше" }, 429, corsHeaders);

  if (!env.LS_COMMERCE_VARIANT_ID) {
    console.error("[commerce-checkout] LS_COMMERCE_VARIANT_ID не налаштовано");
    return json({ error: "Оплата тимчасово недоступна — зверніться до власника магазину" }, 503, corsHeaders);
  }

  let body: {
    project_id?: string;
    customer_email?: string;
    customer_name?: string;
    items?: CartItem[];
    coupon_code?: string;
    shipping_address?: Record<string, unknown>;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const projectId = body.project_id;
  const customerEmail = body.customer_email?.trim();
  const items = body.items ?? [];

  if (!projectId) return json({ error: "project_id обов'язковий" }, 400, corsHeaders);
  if (!customerEmail || !customerEmail.includes("@")) return json({ error: "Вкажіть коректний email" }, 400, corsHeaders);
  if (items.length === 0) return json({ error: "Кошик порожній" }, 400, corsHeaders);

  const projectRes = await selectRows<{ id: string; status: string; name: string }>(
    "projects",
    `select=id,status,name&id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const project = projectRes.data?.[0];
  if (!project || project.status !== "published") return json({ error: "Магазин недоступний" }, 404, corsHeaders);

  const productIds = items.map(i => i.product_id);
  const productsRes = await selectRows<ProductForCheckout>(
    "products",
    `select=id,title,price_cents,currency,stock_quantity,status&project_id=eq.${encodeURIComponent(projectId)}&id=in.(${productIds.map(encodeURIComponent).join(",")})`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const productsById = new Map(productsRes.data?.map(p => [p.id, p]) ?? []);

  const lineItems: Array<{ product: ProductForCheckout; quantity: number }> = [];
  for (const item of items) {
    const product = productsById.get(item.product_id);
    if (!product || product.status !== "published") {
      return json({ error: `Товар недоступний: ${item.product_id}` }, 400, corsHeaders);
    }
    if (product.stock_quantity !== null && product.stock_quantity < item.quantity) {
      return json({ error: `Недостатньо товару на складі: ${product.title}` }, 400, corsHeaders);
    }
    lineItems.push({ product, quantity: Math.max(1, Math.floor(item.quantity)) });
  }

  let totalCents = lineItems.reduce((sum, li) => sum + li.product.price_cents * li.quantity, 0);
  const currency = lineItems[0]?.product.currency ?? "USD";

  let couponId: string | null = null;
  if (body.coupon_code?.trim()) {
    const couponRes = await selectRows<{ id: string; discount_type: string; discount_value: number; max_uses: number | null; used_count: number; expires_at: string | null }>(
      "coupons",
      `select=id,discount_type,discount_value,max_uses,used_count,expires_at&project_id=eq.${encodeURIComponent(projectId)}&code=eq.${encodeURIComponent(body.coupon_code.trim())}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const coupon = couponRes.data?.[0];
    if (coupon && (!coupon.expires_at || new Date(coupon.expires_at) >= new Date()) && (coupon.max_uses === null || coupon.used_count < coupon.max_uses)) {
      couponId = coupon.id;
      totalCents = coupon.discount_type === "percent"
        ? Math.round(totalCents * (1 - coupon.discount_value / 100))
        : Math.max(0, totalCents - coupon.discount_value);
    }
  }

  const orderId = crypto.randomUUID();
  const orderInsert = await insertRow(
    "orders",
    {
      id: orderId,
      project_id: projectId,
      customer_email: customerEmail,
      customer_name: body.customer_name?.trim() || null,
      status: "pending",
      total_cents: totalCents,
      currency,
      payment_provider: "lemonsqueezy",
      shipping_address: body.shipping_address ?? null,
      coupon_id: couponId,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!orderInsert.ok) return json({ error: orderInsert.error ?? "Не вдалося створити замовлення" }, 500, corsHeaders);

  for (const li of lineItems) {
    await insertRow(
      "order_items",
      {
        order_id: orderId,
        product_id: li.product.id,
        title_snapshot: li.product.title,
        price_cents_snapshot: li.product.price_cents,
        quantity: li.quantity,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  const lsRes = await fetch("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.LS_API_KEY}`,
      "Content-Type": "application/vnd.api+json",
      Accept: "application/vnd.api+json",
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email: customerEmail,
            name: body.customer_name?.trim() || undefined,
            custom: {
              qorax_order_id: orderId,
              order_type: "commerce",
              project_id: projectId,
            },
          },
          product_options: {
            name: `Замовлення — ${project.name}`,
            description: lineItems.map(li => `${li.product.title} × ${li.quantity}`).join(", "),
          },
          checkout_options: {
            embed: false,
          },
          expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        },
        relationships: {
          store: { data: { type: "stores", id: env.LS_STORE_ID } },
          variant: { data: { type: "variants", id: env.LS_COMMERCE_VARIANT_ID } },
        },
      },
    }),
  });

  if (!lsRes.ok) {
    const errText = await lsRes.text();
    console.error("[commerce-checkout] LemonSqueezy error:", lsRes.status, errText.slice(0, 300));
    return json({ error: "Не вдалося створити оплату — спробуйте пізніше" }, 502, corsHeaders);
  }

  interface LSCheckoutResponse { data?: { attributes?: { url?: string } } }
  const lsData = (await lsRes.json()) as LSCheckoutResponse;
  const checkoutUrl = lsData.data?.attributes?.url;
  if (!checkoutUrl) return json({ error: "Не вдалося отримати посилання на оплату" }, 502, corsHeaders);

  // coupons.used_count НЕ інкрементується тут навмисно — купон вважався
  // б використаним навіть для покинутого кошика чи неоплаченого
  // checkout (LS checkout_data.expires_at — 30 хв). Інкремент
  // перенесено у lemonSqueezyWebhook.ts (handleOrderCreated), де
  // виконується РІВНО ОДИН РАЗ у момент підтвердження оплати —
  // той самий guard-патерн (status=eq.pending), що для stock_quantity.

  return json({ ok: true, order_id: orderId, checkout_url: checkoutUrl }, 200, corsHeaders);
}
