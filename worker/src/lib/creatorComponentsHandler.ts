// ============================================================
// QORAX — Qorax Creator: Components / Brand Kit
// ============================================================
// MODULE_ROADMAP.md, "Qorax Creator", "Components / Brand Kit —
// перевикористання, не нова система дизайну". Четвертий крок за
// порядком реалізації (після Website Mode, Diagram Mode, Live
// Objects). Компоненти зберігаються в тому самому block-JSON
// форматі, що project_pages.content (0058_sites_builder.sql) —
// узгоджено з коментарем у 0075_creator_components_brand_kit.sql.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRowReturning, upsertRow, updateRows } from "./supabase";
import { requireOrgAccess } from "./orgAuth";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

// ── Brand Kit ─────────────────────────────────────────────────────

interface BrandKitRow {
  id: string;
  organization_id: string;
  logo_url: string | null;
  colors: Record<string, string> | null;
  fonts: Record<string, string> | null;
  tone_of_voice: string | null;
  updated_at: string;
}

// GET /api/organizations/:id/brand-kit — повертає null, якщо ще не
// створено (не 404 — "ще нема бренд-кіту" це нормальний стан, не
// помилка)
export async function handleBrandKitGet(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<BrandKitRow>(
    "creator_brand_kits",
    `select=id,organization_id,logo_url,colors,fonts,tone_of_voice,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ brandKit: res.data?.[0] ?? null }, 200, corsHeaders);
}

// PUT /api/organizations/:id/brand-kit — upsert (unique(organization_id)
// у схемі, on_conflict=organization_id) — один запис на організацію,
// той самий підхід, що канонічний "settings"-запис в інших модулях
// (не історія версій у MVP)
export async function handleBrandKitUpsert(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { logo_url?: string | null; colors?: Record<string, string> | null; fonts?: Record<string, string> | null; tone_of_voice?: string | null };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const res = await upsertRow(
    "creator_brand_kits",
    {
      organization_id: organizationId,
      logo_url: body.logo_url ?? null,
      colors: body.colors ?? null,
      fonts: body.fonts ?? null,
      tone_of_voice: body.tone_of_voice?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    "organization_id",
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── Components ────────────────────────────────────────────────────

interface ComponentRow {
  id: string;
  organization_id: string | null;
  category: string;
  name: string;
  content: Record<string, unknown>;
  is_marketplace: boolean;
  created_at: string;
}

// Той самий перелік категорій, що BLOCK_TYPES у ProjectEditorUI.tsx —
// не новий список, узгоджено з коментарем у міграції.
const ALLOWED_CATEGORIES = ["hero", "text", "image", "cta", "faq", "products"];

// GET /api/organizations/:id/components — власні компоненти
// організації + системні (organization_id is null), RLS сам це
// фільтрує (creator_components_select policy), тут просто без
// додаткового filter на organization_id в запиті — інакше системні
// компоненти (organization_id is null) не пройшли б власний
// organization_id=eq.X фільтр
export async function handleComponentsList(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  // selectRows використовує service role (обходить RLS) — тому
  // фільтр тут явний: organization_id=eq.X OR organization_id=is.null,
  // PostgREST-синтаксис через or=(...)
  const res = await selectRows<ComponentRow>(
    "creator_components",
    `select=id,organization_id,category,name,content,is_marketplace,created_at&or=(organization_id.eq.${encodeURIComponent(organizationId)},organization_id.is.null)&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ components: res.data ?? [] }, 200, corsHeaders);
}

// POST /api/organizations/:id/components — новий компонент
export async function handleComponentCreate(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { category?: string; name?: string; content?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  if (!body.category || !ALLOWED_CATEGORIES.includes(body.category)) {
    return json({ error: `category повинен бути одним з: ${ALLOWED_CATEGORIES.join(", ")}` }, 400, corsHeaders);
  }
  if (!body.content || typeof body.content !== "object") {
    return json({ error: "content обов'язковий (block-структура, той самий формат, що на сторінках Sites)" }, 400, corsHeaders);
  }

  const insertRes = await insertRowReturning<ComponentRow>(
    "creator_components",
    {
      organization_id: organizationId,
      category: body.category,
      name: body.name?.trim() || "Компонент",
      content: body.content,
      is_marketplace: false,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true, component: insertRes.data?.[0] ?? null }, 201, corsHeaders);
}

// PATCH /api/organizations/:id/components/:componentId — тільки name
// (перейменування) — редагування content відбувається пересозданням
// компонента з UI (простіше за часткове злиття jsonb-полів блоку тут)
export async function handleComponentUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string, componentId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (!body.name?.trim()) return json({ error: "name обов'язковий" }, 400, corsHeaders);

  const res = await updateRows(
    "creator_components",
    `id=eq.${encodeURIComponent(componentId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    { name: body.name.trim() },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// DELETE /api/organizations/:id/components/:componentId — фільтр
// organization_id=eq.X у самому DELETE-запиті гарантує, що системні
// компоненти (organization_id is null) видалити звідси неможливо
// навіть якщо componentId вгадано — той самий захист, що RLS-політика
// вже забезпечує на рівні бази, продубльований тут явним фільтром
// (service role обходить RLS, тому цей фільтр — єдиний захист на
// цьому шляху).
export async function handleComponentDelete(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string, componentId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/creator_components?id=eq.${encodeURIComponent(componentId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
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
