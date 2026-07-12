// ============================================================
// commerceCatalog.ts — Commerce модуль, каталог (MODULE_ROADMAP.md
// розділ 6, Крок 2). Той самий патерн доступу, що sitesBuilderHandler.ts:
// requireOrgAccess() для /api/projects/:id/products (organization_id
// відомий через requireOrgAccessForProject — projectId в path, як і
// у решти Sites-related ендпоінтів), не власна копія auth-логіки.
//
// Checkout (створення orders + LemonSqueezy checkout-сесія) — окремий
// файл commerceCheckout.ts, навмисно розділено: каталог — звичайний
// CRUD під контролем власника проєкту, checkout — гроші клієнта,
// інший рівень довіри (service role пише orders, не власник напряму).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccessForProject } from "./orgAuth";

interface ProductRow {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  sku: string | null;
  stock_quantity: number | null;
  image_urls: unknown;
  seo_title: string | null;
  seo_description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

// ── GET /api/projects/:id/products ── список товарів проєкту ──────────

export async function handleProductsList(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<ProductRow>(
    "products",
    `select=id,project_id,title,description,price_cents,currency,sku,stock_quantity,image_urls,seo_title,seo_description,status,created_at,updated_at&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ products: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/projects/:id/products ── новий товар ─────────────────────

export async function handleProductCreate(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string; description?: string; price_cents?: number; currency?: string; sku?: string; stock_quantity?: number | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const title = body.title?.trim();
  if (!title || title.length > 200) return json({ error: "Назва товару обов'язкова (до 200 символів)" }, 400, corsHeaders);
  if (typeof body.price_cents !== "number" || body.price_cents < 0) return json({ error: "Ціна повинна бути невід'ємним числом (у центах)" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "products",
    {
      project_id: projectId,
      title,
      description: body.description?.trim() || null,
      price_cents: Math.round(body.price_cents),
      currency: body.currency?.trim().toUpperCase() || "USD",
      sku: body.sku?.trim() || null,
      stock_quantity: body.stock_quantity ?? null,
      status: "draft",
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── PATCH /api/projects/:id/products/:productId ── редагувати товар ────

export async function handleProductUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string, productId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string; description?: string; price_cents?: number; currency?: string; sku?: string; stock_quantity?: number | null; status?: string; seo_title?: string; seo_description?: string; image_urls?: unknown };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  if (body.status && !["draft", "published", "archived"].includes(body.status)) {
    return json({ error: "Невірний статус товару" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.description !== undefined) patch.description = body.description?.trim() || null;
  if (body.price_cents !== undefined) {
    if (typeof body.price_cents !== "number" || body.price_cents < 0) return json({ error: "Ціна повинна бути невід'ємним числом" }, 400, corsHeaders);
    patch.price_cents = Math.round(body.price_cents);
  }
  if (body.currency !== undefined) patch.currency = body.currency.trim().toUpperCase();
  if (body.sku !== undefined) patch.sku = body.sku?.trim() || null;
  if (body.stock_quantity !== undefined) patch.stock_quantity = body.stock_quantity;
  if (body.status !== undefined) patch.status = body.status;
  if (body.seo_title !== undefined) patch.seo_title = body.seo_title;
  if (body.seo_description !== undefined) patch.seo_description = body.seo_description;
  if (body.image_urls !== undefined) patch.image_urls = body.image_urls;

  if (Object.keys(patch).length === 0) return json({ error: "Немає змін" }, 400, corsHeaders);

  const res = await updateRows(
    "products",
    `id=eq.${encodeURIComponent(productId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    patch,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/projects/:id/products/:productId ────────────────────────

export async function handleProductDelete(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string, productId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "admin", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/products?id=eq.${encodeURIComponent(productId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!res.ok) return json({ error: `Delete failed: ${res.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/projects/:id/orders ── список замовлень проєкту ───────────

interface OrderRow {
  id: string;
  project_id: string;
  customer_email: string;
  customer_name: string | null;
  status: string;
  total_cents: number;
  currency: string;
  payment_provider: string | null;
  created_at: string;
}

export async function handleOrdersList(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<OrderRow>(
    "orders",
    `select=id,project_id,customer_email,customer_name,status,total_cents,currency,payment_provider,created_at&project_id=eq.${encodeURIComponent(projectId)}&order=created_at.desc&limit=100`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ orders: res.data ?? [] }, 200, corsHeaders);
}

// ── GET /api/projects/:id/coupons ── список купонів проєкту ────────────

interface CouponRow {
  id: string;
  project_id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
}

export async function handleCouponsList(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<CouponRow>(
    "coupons",
    `select=id,project_id,code,discount_type,discount_value,max_uses,used_count,expires_at&project_id=eq.${encodeURIComponent(projectId)}&order=code.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ coupons: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/projects/:id/coupons ── новий купон ───────────────────────

export async function handleCouponCreate(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { code?: string; discount_type?: string; discount_value?: number; max_uses?: number | null; expires_at?: string | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const code = body.code?.trim().toUpperCase();
  if (!code || code.length > 50) return json({ error: "Код купона обов'язковий (до 50 символів)" }, 400, corsHeaders);
  if (!/^[A-Z0-9_-]+$/.test(code)) return json({ error: "Код купона: тільки латинські літери, цифри, - та _" }, 400, corsHeaders);

  if (body.discount_type !== "percent" && body.discount_type !== "fixed") {
    return json({ error: "discount_type повинен бути 'percent' або 'fixed'" }, 400, corsHeaders);
  }
  if (typeof body.discount_value !== "number" || body.discount_value <= 0) {
    return json({ error: "Розмір знижки повинен бути додатним числом" }, 400, corsHeaders);
  }
  if (body.discount_type === "percent" && body.discount_value > 100) {
    return json({ error: "Знижка у відсотках не може перевищувати 100" }, 400, corsHeaders);
  }
  if (body.max_uses != null && (typeof body.max_uses !== "number" || body.max_uses < 1)) {
    return json({ error: "Ліміт використань повинен бути додатним числом або порожнім (без ліміту)" }, 400, corsHeaders);
  }

  // unique(project_id, code) у схемі (0061_commerce_module.sql) — Supabase
  // поверне 409-подібну помилку через insertRes.error, не окрема
  // попередня перевірка (уникнення TOCTOU-вікна між SELECT і INSERT).
  const insertRes = await insertRow(
    "coupons",
    {
      project_id: projectId,
      code,
      discount_type: body.discount_type,
      discount_value: Math.round(body.discount_value),
      max_uses: body.max_uses ?? null,
      expires_at: body.expires_at || null,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) {
    const isDuplicate = insertRes.error?.includes("duplicate") || insertRes.error?.includes("23505");
    return json({ error: isDuplicate ? "Купон з таким кодом вже існує" : insertRes.error }, isDuplicate ? 409 : 400, corsHeaders);
  }

  return json({ ok: true }, 201, corsHeaders);
}

// ── DELETE /api/projects/:id/coupons/:couponId ──────────────────────────
// Купони не редагуються (PATCH) навмисно на цій ітерації — код і розмір
// знижки, застосовані до вже оплачених замовлень, фіксуються в
// orders.total_cents на момент checkout (не перераховуються заднім
// числом), тож зміна параметрів існуючого купона не має сенсу для вже
// використаних застосувань. Власник видаляє і створює новий за потреби.

export async function handleCouponDelete(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string, couponId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "admin", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/coupons?id=eq.${encodeURIComponent(couponId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!res.ok) return json({ error: `Delete failed: ${res.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /api/coupons/validate ── перевірка купона під час checkout ────
// Публічний ендпоінт (без requireOrgAccessForProject) — покупець на
// вітрині магазину не має аккаунту Qorax, лише вводить код купона.

export async function handleCouponValidate(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: { project_id?: string; code?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const projectId = body.project_id;
  const code = body.code?.trim();
  if (!projectId || !code) return json({ error: "project_id і code обов'язкові" }, 400, corsHeaders);

  const res = await selectRows<{ id: string; discount_type: string; discount_value: number; max_uses: number | null; used_count: number; expires_at: string | null }>(
    "coupons",
    `select=id,discount_type,discount_value,max_uses,used_count,expires_at&project_id=eq.${encodeURIComponent(projectId)}&code=eq.${encodeURIComponent(code)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const coupon = res.data?.[0];
  if (!coupon) return json({ valid: false, error: "Купон не знайдено" }, 200, corsHeaders);

  if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
    return json({ valid: false, error: "Термін дії купона закінчився" }, 200, corsHeaders);
  }
  if (coupon.max_uses !== null && coupon.used_count >= coupon.max_uses) {
    return json({ valid: false, error: "Купон вже вичерпано" }, 200, corsHeaders);
  }

  return json({ valid: true, discount_type: coupon.discount_type, discount_value: coupon.discount_value }, 200, corsHeaders);
}
