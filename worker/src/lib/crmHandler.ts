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
import { selectRows, insertRow, insertRowReturning, updateRows } from "./supabase";
import { upsertNode, addEdge } from "./knowledgeGraph";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";
import { dispatchAlert } from "./monitoring";

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

  const limitCheck = await checkContactLimit(organizationId, env);
  if (!limitCheck.ok) return json({ error: limitCheck.error }, 402, corsHeaders);

  const insertRes = await insertRowReturning<{ id: string }>(
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

  const newContactId = insertRes.data?.[0]?.id;
  if (newContactId) {
    // Knowledge Graph (MODULE_ROADMAP.md, хвиля 4, розділ 14) — node_type
    // 'customer' спрощено охоплює і лідів, і клієнтів: на рівні crm_contacts
    // немає окремого розмежування (стадія лишається властивістю crm_deals,
    // не контакту) — не блокує основний потік, помилка ігнорується
    const contactNodeId = await upsertNode(organizationId, "customer", name ?? email ?? phone ?? "Контакт", "crm_contacts", newContactId, env);

    // MVP-звʼязок для Diagram Mode (Qorax Creator, "KG Visualization"):
    // лід ↔ ключові слова, що відстежуються на ТОМУ САМОМУ сайті
    // (crm_contacts.site_id і rank_tracked_queries.site_id — те саме
    // поле sites.id, гарантовано коректне співставлення, не URL-евристика).
    // Обмежено 3 найновішими keyword-вузлами, не всіма (до 30 на сайт,
    // MAX_TRACKED_QUERIES у rankHandler.ts) — звʼязок "цей лід і ЦЕ
    // ключове слово того самого сайту" залишається змістовним на
    // діаграмі, а не розмивається у зірку з 30 ліній на кожен новий лід.
    if (contactNodeId && body.site_id) {
      const trackedRes = await selectRows<{ id: string }>(
        "rank_tracked_queries",
        `select=id&site_id=eq.${encodeURIComponent(body.site_id)}&order=created_at.desc&limit=3`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const trackedIds = (trackedRes.data ?? []).map(t => t.id);
      if (trackedIds.length > 0) {
        const idsFilter = trackedIds.map(id => encodeURIComponent(id)).join(",");
        const kwNodesRes = await selectRows<{ id: string }>(
          "kg_nodes",
          `select=id&organization_id=eq.${encodeURIComponent(organizationId)}&ref_table=eq.rank_tracked_queries&ref_id=in.(${idsFilter})`,
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        );
        for (const kwNode of kwNodesRes.data ?? []) {
          await addEdge(organizationId, contactNodeId, kwNode.id, "related_to", env);
        }
      }
    }
  }

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

// ── Ліміт кількості контактів по тарифу (PRICING.md розділ 4: вісь
// ліміту "кількість контактів" — конкретні числа зараз обираються,
// узгоджено з тим же підходом, що MONTHLY_POST_LIMIT_BY_PLAN в
// socialHandler.ts). НАКОПИЧУВАЛЬНИЙ ліміт (всього контактів), не
// щомісячний — контакти не витрачаються, як публікації, вони
// накопичуються. ──

const CONTACT_LIMIT_BY_PLAN: Record<string, number> = {
  starter: 100,
  growth: 500,
  agency: 5000,
  admin: 999999,
  trial: 100,
};

async function checkContactLimit(organizationId: string, env: Env): Promise<{ ok: true } | { ok: false; error: string }> {
  const planRes = await selectRows<{ status: string; plans: { code: string } }>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const planCode = (planRes.data?.[0]?.plans as { code: string } | null)?.code ?? "starter";
  const limit = CONTACT_LIMIT_BY_PLAN[planCode] ?? CONTACT_LIMIT_BY_PLAN.starter;

  const countRes = await selectRows<{ id: string }>(
    "crm_contacts",
    `select=id&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const total = countRes.data?.length ?? 0;

  if (total >= limit) {
    return { ok: false, error: `Ліміт контактів вичерпано (${limit} на тарифі ${planCode}). Оновіть тариф для більшої кількості.` };
  }
  return { ok: true };
}

// ── run-crm-reminders — фонова задача (EXECUTION_PLAN.md Фаза 2.1,
// "НЕ зроблено": нагадування створювались, але ніхто їх не
// надсилав). Переюзовує dispatchAlert() (monitoring.ts). Легкий
// аналог getOrgNotifSettings нижче — той вимагає siteId (форма
// site→organization), нагадування CRM вже мають organization_id
// напряму, тому without зайвого походу через sites. Викликається
// через POST /api/admin/run-crm-reminders, той самий патерн, що
// run-uptime. ──

interface DueReminder {
  id: string;
  organization_id: string;
  message: string;
}

export async function runCrmReminders(env: Env): Promise<{ sent: number; failed: number }> {
  const nowIso = new Date().toISOString();
  const dueRes = await selectRows<DueReminder>(
    "crm_reminders",
    `select=id,organization_id,message&is_done=eq.false&remind_at=lte.${nowIso}&limit=100`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!dueRes.ok || !dueRes.data?.length) return { sent: 0, failed: 0 };

  let sent = 0;
  let failed = 0;

  for (const reminder of dueRes.data) {
    try {
      const settings = await getOrgNotifSettingsByOrgId(reminder.organization_id, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      if (settings) {
        await dispatchAlert(
          settings,
          { subject: "Нагадування CRM", html: `<p>${reminder.message}</p>` },
          `🔔 Нагадування CRM: ${reminder.message}`,
          null,
          env.RESEND_API_KEY,
          env.TELEGRAM_BOT_TOKEN
        );
      }
      await updateRows("crm_reminders", `id=eq.${reminder.id}`, { is_done: true }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      sent++;
    } catch (err) {
      console.error("[crm-reminders] error for reminder", reminder.id, err);
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Легкий аналог getOrgNotifSettings з monitoring.ts — той вимагає
 * siteId (форма site→organization), нагадування CRM вже мають
 * organization_id напряму, тому без зайвого походу через sites.
 * Дублює частину логіки monitoring.ts навмисно (власник + settings) —
 * винесення в спільний helper залишається окремим TODO, якщо
 * з'явиться третій споживач цього патерну (organization_id → owner
 * → notification_settings, обходячи sites).
 */
async function getOrgNotifSettingsByOrgId(
  organizationId: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<import("./monitoring").OrgEmailRow | null> {
  const settingsRes = await selectRows<{
    email_enabled: boolean;
    telegram_enabled: boolean;
    telegram_chat_id: string | null;
    slack_enabled: boolean;
    slack_webhook_url: string | null;
    notify_site_down: boolean;
    notify_ssl_domain_expiry: boolean;
    notify_competitor_changes: boolean;
  }>(
    "notification_settings",
    `select=email_enabled,telegram_enabled,telegram_chat_id,slack_enabled,slack_webhook_url,notify_site_down,notify_ssl_domain_expiry,notify_competitor_changes&organization_id=eq.${encodeURIComponent(organizationId)}`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!settingsRes.ok || !settingsRes.data?.[0]) return null;

  const ownerRes = await selectRows<{ user_id: string }>(
    "organization_members",
    `select=user_id&organization_id=eq.${encodeURIComponent(organizationId)}&role=eq.owner`,
    supabaseUrl,
    serviceRoleKey
  );
  if (!ownerRes.ok || !ownerRes.data?.[0]) return null;

  const authResp = await fetch(`${supabaseUrl}/auth/v1/admin/users/${ownerRes.data[0].user_id}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!authResp.ok) return null;
  const authData = (await authResp.json()) as { email?: string };
  if (!authData.email) return null;

  const s = settingsRes.data[0];
  return {
    email: authData.email,
    notify_site_down: s.notify_site_down,
    notify_ssl_domain_expiry: s.notify_ssl_domain_expiry,
    notify_competitor_changes: s.notify_competitor_changes,
    email_enabled: s.email_enabled,
    telegram_enabled: s.telegram_enabled,
    telegram_chat_id: s.telegram_chat_id,
    slack_enabled: s.slack_enabled,
    slack_webhook_url: s.slack_webhook_url,
  };
}
