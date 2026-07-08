// ============================================================
// crmHandler.ts — CRM-модуль (MODULE_ROADMAP.md розділ 7,
// EXECUTION_PLAN.md Фаза 2.3). Перший handler, що використовує НОВІ
// спільні helper'и з Фази 0: requireOrgAccess() (orgAuth.ts) замість
// ручної перевірки членства+ролі в кожній функції, і json() з
// httpUtils.ts замість власної копії.
//
// Контакти/угоди — organization-рівня (DATA_MODEL.md розділ 2.1),
// тому весь доступ перевіряється через requireOrgAccess() з
// organization_id напряму з тіла/query, а не через site_id/project_id.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";

interface CrmContact {
  id: string;
  organization_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string;
  site_id: string | null;
  created_at: string;
}

interface CrmDeal {
  id: string;
  organization_id: string;
  contact_id: string | null;
  title: string;
  stage: string;
  value_cents: number | null;
  currency: string;
  created_at: string;
  updated_at: string;
}

const VALID_STAGES = ["new", "contacted", "qualified", "won", "lost"];

// ── GET /api/crm/contacts?organization_id=... ──

export async function handleCrmContactsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<CrmContact>(
    "crm_contacts",
    `select=id,organization_id,name,email,phone,source,site_id,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ contacts: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/crm/contacts ── body: { organization_id, name?, email?, phone?, site_id? }

export async function handleCrmContactCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; name?: string; email?: string; phone?: string; site_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const name = body.name?.trim() || null;
  const email = body.email?.trim() || null;
  const phone = body.phone?.trim() || null;
  if (!name && !email && !phone) {
    return json({ error: "Потрібно вказати хоча б ім'я, email чи телефон" }, 400, corsHeaders);
  }

  const insertRes = await insertRow(
    "crm_contacts",
    {
      organization_id: organizationId,
      name,
      email,
      phone,
      source: "manual",
      site_id: body.site_id || null,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── GET /api/crm/deals?organization_id=... — канбан-воронка, згруповано на клієнті за stage ──

export async function handleCrmDealsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<CrmDeal>(
    "crm_deals",
    `select=id,organization_id,contact_id,title,stage,value_cents,currency,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ deals: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/crm/deals ── body: { organization_id, title, contact_id?, value_cents?, currency? }

export async function handleCrmDealCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; title?: string; contact_id?: string; value_cents?: number; currency?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const title = body.title?.trim();
  if (!title || title.length > 200) return json({ error: "Некоректна назва угоди" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "crm_deals",
    {
      organization_id: organizationId,
      title,
      contact_id: body.contact_id || null,
      value_cents: body.value_cents ?? null,
      currency: body.currency || "USD",
      stage: "new",
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── PATCH /api/crm/deals/:id/stage ── body: { organization_id, stage } — переміщення по канбану

export async function handleCrmDealStageUpdate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  dealId: string
): Promise<Response> {
  let body: { organization_id?: string; stage?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const stage = body.stage;
  if (!stage || !VALID_STAGES.includes(stage)) {
    return json({ error: `stage має бути одним з: ${VALID_STAGES.join(", ")}` }, 400, corsHeaders);
  }

  // Подвійна перевірка: угода дійсно належить цій organization_id,
  // а не тільки те, що юзер має доступ до organization_id з тіла
  // запиту (SECURITY.md розділ 5 — ownership verification, не
  // покладатись тільки на JWT-валідність).
  const dealRes = await selectRows<{ id: string }>(
    "crm_deals",
    `select=id&id=eq.${encodeURIComponent(dealId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!dealRes.data?.[0]) return json({ error: "Not found" }, 404, corsHeaders);

  const updateRes = await updateRows(
    "crm_deals",
    `id=eq.${encodeURIComponent(dealId)}`,
    { stage },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /api/crm/notes ── body: { organization_id, deal_id? | contact_id?, body } — нотатка

export async function handleCrmNoteCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; deal_id?: string; contact_id?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const noteBody = body.body?.trim();
  if (!noteBody) return json({ error: "Текст нотатки обов'язковий" }, 400, corsHeaders);

  const hasDeal = !!body.deal_id;
  const hasContact = !!body.contact_id;
  if (hasDeal === hasContact) {
    // обидва задані чи обидва відсутні — CHECK-обмеження в БД це б
    // теж відхилило, але перевіряємо тут для чіткішого повідомлення
    return json({ error: "Потрібно вказати рівно одне з deal_id/contact_id" }, 400, corsHeaders);
  }

  const insertRes = await insertRow(
    "crm_notes",
    {
      deal_id: body.deal_id || null,
      contact_id: body.contact_id || null,
      author_id: access.userId,
      body: noteBody,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── GET /api/crm/notes?deal_id=... АБО ?contact_id=... ──

export async function handleCrmNotesList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const dealId = url.searchParams.get("deal_id");
  const contactId = url.searchParams.get("contact_id");
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!dealId && !contactId) return json({ error: "Потрібно вказати deal_id чи contact_id" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const filter = dealId
    ? `deal_id=eq.${encodeURIComponent(dealId)}`
    : `contact_id=eq.${encodeURIComponent(contactId as string)}`;

  const res = await selectRows<{ id: string; body: string; author_id: string | null; created_at: string }>(
    "crm_notes",
    `select=id,body,author_id,created_at&${filter}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ notes: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/crm/reminders ── body: { organization_id, deal_id?, remind_at, message }

export async function handleCrmReminderCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; deal_id?: string; remind_at?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const message = body.message?.trim();
  if (!message) return json({ error: "Текст нагадування обов'язковий" }, 400, corsHeaders);

  const remindAt = body.remind_at ? new Date(body.remind_at) : null;
  if (!remindAt || isNaN(remindAt.getTime())) return json({ error: "Некоректна дата remind_at" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "crm_reminders",
    {
      organization_id: organizationId,
      deal_id: body.deal_id || null,
      remind_at: remindAt.toISOString(),
      message,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}
