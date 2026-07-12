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

import { selectRows, upsertRow, updateRows, updateRowsReturning } from "./supabase";
import { processReferralCommission } from "./referralCommission";

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

// Payload для subscription_payment_success / subscription_payment_failed —
// інша структура ніж subscription_* events: data.type = "subscription-invoices".
// LS API документація не гарантує єдине поле для subscription_id в усіх
// SDK/прикладах — деякі показують його прямо в attributes, тому читаємо
// звідти з фолбеком на relationships, якщо він колись зміниться.
interface LSInvoiceAttributes {
  store_id: number;
  subscription_id?: number;
  customer_id: number;
  billing_reason?: string; // "initial" | "renewal" | "updated"
  status: string; // "paid" | "pending" | "void" | "refunded"
  total: number;
  total_usd: number;
  subtotal: number;
  subtotal_usd: number;
  currency: string;
  test_mode?: boolean;
}

interface LSInvoicePayload {
  meta: LSWebhookMeta;
  data: {
    id: string;
    type: string; // "subscription-invoices"
    attributes: LSInvoiceAttributes;
    relationships?: {
      subscription?: { data?: { id?: string } };
    };
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

  let payload: { meta: LSWebhookMeta; data: Record<string, unknown> };
  try {
    payload = JSON.parse(rawBody);
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
      handled = await handleSubscriptionActive(payload as unknown as LSWebhookPayload, supabaseUrl, serviceRoleKey);
      break;

    case "subscription_cancelled":
    case "subscription_expired":
    case "subscription_paused":
      handled = await handleSubscriptionCancelled(payload as unknown as LSWebhookPayload, supabaseUrl, serviceRoleKey);
      break;

    case "subscription_payment_success":
      handled = await handleSubscriptionPaymentSuccess(payload as unknown as LSInvoicePayload, supabaseUrl, serviceRoleKey);
      break;

    case "order_created":
      handled = await handleOrderCreated(payload as unknown as { meta: LSWebhookMeta; data: Record<string, unknown> }, supabaseUrl, serviceRoleKey);
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

// EXECUTION_PLAN.md Фаза 0.3 — робочі заглушки, конкретні числа
// лишаються комерційним рішенням Артема (PRICING.md розділ 5), той
// самий підхід, що MONTHLY_POST_LIMIT_BY_PLAN у socialHandler.ts.
const AI_CREDITS_BY_PLAN: Record<string, number> = {
  starter: 300,
  growth: 1000,
  agency: 3000,
  enterprise: 10000,
};

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

  // Автоматична видача ai_credits (EXECUTION_PLAN.md Фаза 0.3;
  // ai_credits — відоме обмеження задокументоване в коментарі до
  // таблиці 0042_ai_content_module.sql: рядок створювався ВИКЛЮЧНО
  // вручну). Числа нижче — робочі заглушки, той самий підхід, що
  // MONTHLY_POST_LIMIT_BY_PLAN у socialHandler.ts — конкретні
  // комерційні цифри лишаються рішенням Артема (PRICING.md розділ 5),
  // не змінюють архітектуру: місячне скидання (credits_reset_at)
  // працює однаково незалежно від того, яке число тут стоїть.
  const creditsForPlan = AI_CREDITS_BY_PLAN[planCode] ?? AI_CREDITS_BY_PLAN.starter;
  const nextResetAt = new Date();
  nextResetAt.setUTCMonth(nextResetAt.getUTCMonth() + 1);
  nextResetAt.setUTCDate(1);
  nextResetAt.setUTCHours(0, 0, 0, 0);

  const creditsUpsertResult = await upsertRow(
    "ai_credits",
    {
      organization_id: orgId,
      credits_remaining: creditsForPlan,
      credits_reset_at: nextResetAt.toISOString(),
    },
    "organization_id",
    supabaseUrl,
    serviceRoleKey
  );
  if (!creditsUpsertResult.ok) {
    // Той самий принцип, що org_type/site_limit вище — не блокуємо
    // весь webhook через другорядну операцію, гучно логуємо.
    console.error("[ls-webhook] Subscription activated but failed to upsert ai_credits:", creditsUpsertResult.error, "org:", orgId);
  }

  console.log("[ls-webhook] subscription upserted:", { orgId, status, lsSubscriptionId, orgType, siteLimit, creditsForPlan });
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

// ─── Subscription payment success → нарахування реферальної комісії ──

async function handleSubscriptionPaymentSuccess(
  payload: LSInvoicePayload,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<boolean> {
  const attrs = payload.data.attributes;
  const invoiceId = payload.data.id;

  // Пропускаємо неоплачені/повернені інвойси — комісія тільки за реально
  // отримані гроші
  if (attrs.status !== "paid") {
    console.log("[ls-webhook] Invoice not paid, skipping:", { invoiceId, status: attrs.status });
    return true;
  }

  const lsSubscriptionId = attrs.subscription_id
    ? String(attrs.subscription_id)
    : payload.data.relationships?.subscription?.data?.id ?? null;

  if (!lsSubscriptionId) {
    console.error("[ls-webhook] No subscription_id in invoice payload:", invoiceId);
    return true; // не транзієнтна помилка, ретрай не допоможе
  }

  // Знаходимо organization_id за ls_subscription_id (custom_data тут
  // недоступний — invoice-подія прив'язана до підписки, а не до checkout)
  const subResult = await selectRows<{ organization_id: string }>(
    "subscriptions",
    `select=organization_id&ls_subscription_id=eq.${encodeURIComponent(lsSubscriptionId)}&limit=1`,
    supabaseUrl,
    serviceRoleKey
  );

  if (!subResult.ok) {
    console.error("[ls-webhook] Failed to look up subscription for invoice:", subResult.error);
    return false;
  }

  const orgId = subResult.data[0]?.organization_id;
  if (!orgId) {
    // Підписка ще не встигла зафіксуватись в нашій БД (можливий порядок
    // доставки: invoice раніше за subscription_created) — не транзієнтна
    // помилка в класичному сенсі, але повторна спроба МОЖЕ допомогти якщо
    // subscription_created прийде трохи пізніше. Повертаємо false один раз;
    // LS ретраїть з експоненційною затримкою (5с/25с/125с), цього зазвичай
    // достатньо щоб subscription_created встиг обробитись першим.
    console.error("[ls-webhook] No local subscription found for ls_subscription_id yet:", lsSubscriptionId);
    return false;
  }

  return await processReferralCommission(
    orgId,
    invoiceId,
    lsSubscriptionId,
    attrs.total_usd,
    supabaseUrl,
    serviceRoleKey
  );
}

// ─── order_created — Commerce-модуль (MODULE_ROADMAP.md розділ 6) ─
// Розрізнення від майбутніх one-time покупок самого Qorax (напр.
// $19 audit, згаданий у коментарі на початку файлу): commerce-заказ
// несе custom_data.order_type = "commerce" + qorax_order_id
// (наш orders.id, встановлений в commerceCheckout.ts перед
// створенням LS checkout-сесії). Будь-який order_created БЕЗ цих
// полів — не наша справа, тихо ігнорується (handled=true, щоб LS не
// ретраїв подію, яку ми свідомо не обробляємо).

async function handleOrderCreated(
  payload: { meta: LSWebhookMeta; data: Record<string, unknown> },
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<boolean> {
  const custom = payload.meta.custom_data;
  const orderType = custom?.order_type;
  const qoraxOrderId = custom?.qorax_order_id as string | undefined;

  if (orderType !== "commerce" || !qoraxOrderId) {
    // Не commerce-заказ (майбутня one-time покупка самого Qorax тощо)
    // — не наша гілка, вважаємо "оброблено" щоб LS не повторював.
    console.log("[ls-webhook] order_created ignored (not a commerce order):", orderType);
    return true;
  }

  const attrs = payload.data.attributes as { status?: string; identifier?: string } | undefined;
  const lsOrderStatus = attrs?.status; // 'paid' | 'pending' | 'refunded' | 'partial_refund'

  if (lsOrderStatus !== "paid") {
    // LemonSqueezy надсилає order_created навіть для неоплачених
    // спроб (напр. failed payment) — оновлюємо тільки на 'paid',
    // залишаючи наш власний orders.status='pending' незмінним
    // інакше (немає окремого стану "failed" в нашій схемі, оскільки
    // покупець просто спробує ще раз той самий checkout).
    console.log("[ls-webhook] commerce order not paid yet:", qoraxOrderId, lsOrderStatus);
    return true;
  }

  // Атомарний guard: PATCH з фільтром status=eq.pending і
  // Prefer: return=representation — якщо LS повторить цей самий
  // webhook (retry) або подія прийде вдруге з будь-якої причини,
  // фільтр вже не збіжеться (замовлення вже paid), rows.length буде
  // 0, і списання стоку/все інше нижче просто не виконається. Без
  // цього повторний виклик списав би товар зі складу вдруге.
  const updateResult = await updateRowsReturning<{ id: string }>(
    "orders",
    `id=eq.${encodeURIComponent(qoraxOrderId)}&status=eq.pending`,
    { status: "paid", payment_reference: attrs?.identifier ?? null },
    supabaseUrl,
    serviceRoleKey
  );

  if (!updateResult.ok) {
    console.error("[ls-webhook] Failed to mark commerce order as paid:", updateResult.error, "order:", qoraxOrderId);
    return false; // LS зробить retry за своєю 3-retry політикою
  }

  if (updateResult.data.length === 0) {
    // Фільтр status=eq.pending не збігся — замовлення вже було
    // оброблено раніше (повторний webhook) або не існує. Не помилка,
    // просто нічого додатково робити не треба.
    console.log("[ls-webhook] commerce order already processed or not found:", qoraxOrderId);
    return true;
  }

  console.log("[ls-webhook] commerce order marked paid:", qoraxOrderId);

  // ── Списання складу ──
  // Виконується РІВНО ОДИН РАЗ завдяки guard вище. stock_quantity
  // null означає "необмежено" (базовий облік, не повний WMS, див.
  // коментар у 0061_commerce_module.sql) — такі товари пропускаємо.
  // Кожен товар списується через read-then-write з optimistic locking:
  // PATCH з фільтром stock_quantity=eq.<прочитане значення> — якщо між
  // SELECT і PATCH значення змінилось (гонка з іншим замовленням чи
  // ручним редагуванням у дашборді), фільтр не збігається, rows=0,
  // і ми просто логуємо це замість тихого перезапису чужої зміни.
  const orderItemsRes = await selectRows<{ product_id: string | null; quantity: number }>(
    "order_items",
    `select=product_id,quantity&order_id=eq.${encodeURIComponent(qoraxOrderId)}`,
    supabaseUrl,
    serviceRoleKey
  );

  for (const item of orderItemsRes.data ?? []) {
    if (!item.product_id) continue;

    const productRes = await selectRows<{ id: string; stock_quantity: number | null }>(
      "products",
      `select=id,stock_quantity&id=eq.${encodeURIComponent(item.product_id)}`,
      supabaseUrl,
      serviceRoleKey
    );
    const product = productRes.data?.[0];
    if (!product || product.stock_quantity === null) continue; // необмежений товар — нічого списувати

    const newStock = Math.max(0, product.stock_quantity - item.quantity);
    const stockUpdate = await updateRowsReturning<{ id: string }>(
      "products",
      `id=eq.${encodeURIComponent(item.product_id)}&stock_quantity=eq.${product.stock_quantity}`,
      { stock_quantity: newStock },
      supabaseUrl,
      serviceRoleKey
    );

    if (!stockUpdate.ok || stockUpdate.data.length === 0) {
      // stock_quantity змінився між SELECT і PATCH (гонка з іншим
      // замовленням чи ручним редагуванням у дашборді) — не критична
      // помилка для webhook (замовлення вже paid, гроші отримано),
      // логуємо і продовжуємо з рештою товарів. Розбіжність складу
      // на 1-2 одиниці в рідкісній гонці прийнятніша, ніж провалений
      // webhook і незарахована оплата.
      console.error("[ls-webhook] stock deduction race or failure for product:", item.product_id, stockUpdate.error);
    }
  }

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
