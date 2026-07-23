// ============================================================
// tourHandler.ts — стан переглянутих інтерактивних турів по
// продуктах (Артем: "інтерактивний тур для новозареєстрованих...
// по кожному продукту"). Migration 0087_product_tours_seen.sql.
// ============================================================
// Профіль-рівня доступ (не organization-рівня) — той самий принцип,
// що вже в academyHandler.ts: людина, що приєдналась до чужої
// організації, повинна побачити тур сама вперше незалежно від того,
// чи організація вже давно існує. requireOrgAccess() тут не підходить.
// ============================================================

import type { Env } from "../types";
import { selectRows, upsertRow } from "./supabase";
import { json } from "./httpUtils";

const VALID_PRODUCTS = ["dashboard", "mail", "creator", "office", "browser"] as const;
type TourProduct = (typeof VALID_PRODUCTS)[number];

async function requireAuthenticatedUser(request: Request, env: Env): Promise<{ ok: true; userId: string } | { ok: false; status: number }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401 };

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return { ok: false, status: 401 };
  const data = (await resp.json()) as { id?: string };
  if (!data.id) return { ok: false, status: 401 };
  return { ok: true, userId: data.id };
}

// GET /api/tours/seen — список продуктів, тури яких користувач уже
// бачив. Фронт запитує один раз при завантаженні продукту, а не
// окремий запит на кожен — простіше й дешевше повернути весь набір.
export async function handleTourSeenList(request: Request, env: Env, origin: string | null): Promise<Response> {
  const auth = await requireAuthenticatedUser(request, env);
  if (!auth.ok) return json({ error: "Unauthorized" }, auth.status, origin);

  const res = await selectRows<{ product: string }>(
    "product_tours_seen",
    `select=product&user_id=eq.${encodeURIComponent(auth.userId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: "Не вдалося завантажити стан турів" }, 500, origin);

  return json({ seen: (res.data ?? []).map(r => r.product) }, 200, origin);
}

// POST /api/tours/seen { product } — позначає тур переглянутим
// (викликається по завершенню або пропуску туру, не при кожному
// кроці — driver.js сам веде користувача, бекенд лише про фінальний
// стан "більше не показувати автоматично").
export async function handleTourMarkSeen(request: Request, env: Env, origin: string | null): Promise<Response> {
  const auth = await requireAuthenticatedUser(request, env);
  if (!auth.ok) return json({ error: "Unauthorized" }, auth.status, origin);

  let body: { product?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, origin);
  }

  const product = body.product;
  if (!product || !VALID_PRODUCTS.includes(product as TourProduct)) {
    return json({ error: `product обов'язковий, одне з: ${VALID_PRODUCTS.join(", ")}` }, 400, origin);
  }

  const res = await upsertRow(
    "product_tours_seen",
    { user_id: auth.userId, product },
    "user_id,product",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: "Не вдалося зберегти стан туру" }, 500, origin);

  return json({ ok: true }, 200, origin);
}
