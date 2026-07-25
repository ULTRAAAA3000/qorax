// ============================================================
// mailCampaignHandler.ts — Qorax Mail, Шар 2 (Campaigns/Automations/
// Templates). MODULE_ROADMAP.md "Qorax Mail — окремий продукт
// екосистеми".
//
// ДРУГА СПРОБА цього файлу — перша (до 0080→0087 перейменування
// міграції) була втрачена разом з усією незакоммiченою робочою
// копією при скиданні sandbox-контейнера. Написано заново з тим
// самим задумом, тепер одразу з інтеграцією planTiers.ts (новий
// файл, зʼявився в ecosystem-pricing рефакторингу, поки цей файл
// був відсутній) — Campaigns/Automations вимагають mail_starter+.
//
// Переюзовує sendGmailMessage() з mailHandler.ts і requireOrgAccess()/
// json() з Фази 0.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, insertRowReturning, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";
import { sendGmailMessage } from "./mailHandler";
import { hasStarterTierAccess } from "./planTiers";

interface PlanRow {
  code: string;
}

async function getOrgPlanCode(organizationId: string, env: Env): Promise<string> {
  const subResult = await selectRows<{ plans: PlanRow | null }>(
    "subscriptions",
    `select=plans(code)&organization_id=eq.${encodeURIComponent(organizationId)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return subResult.data?.[0]?.plans?.code ?? "free";
}

// ── Templates ──

interface MailTemplate {
  id: string;
  name: string;
  category: string;
  content: { blocks?: unknown[] };
  created_at: string;
}

export async function handleMailTemplatesList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<MailTemplate>(
    "mail_templates",
    `select=id,name,category,content,created_at&or=(organization_id.is.null,organization_id.eq.${encodeURIComponent(organizationId)})&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ templates: res.data ?? [] }, 200, corsHeaders);
}

const VALID_TEMPLATE_CATEGORIES = ["commercial", "invoice", "support", "onboarding", "custom"];

export async function handleMailTemplateCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; name?: string; category?: string; content?: { blocks?: unknown[] } };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const name = body.name?.trim();
  if (!name) return json({ error: "Назва шаблону обов'язкова" }, 400, corsHeaders);

  const category = body.category ?? "custom";
  if (!VALID_TEMPLATE_CATEGORIES.includes(category)) {
    return json({ error: `category має бути одним з: ${VALID_TEMPLATE_CATEGORIES.join(", ")}` }, 400, corsHeaders);
  }

  const insertRes = await insertRow(
    "mail_templates",
    { organization_id: organizationId, name, category, content: body.content ?? { blocks: [] } },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── Campaigns ──

interface MailCampaign {
  id: string;
  name: string;
  subject: string;
  status: string;
  scheduled_at: string | null;
  created_at: string;
}

export async function handleMailCampaignsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<MailCampaign>(
    "mail_campaigns",
    `select=id,name,subject,status,scheduled_at,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ campaigns: res.data ?? [] }, 200, corsHeaders);
}

export async function handleMailCampaignCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; mail_account_id?: string; name?: string; subject?: string; template_id?: string; scheduled_at?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const planCode = await getOrgPlanCode(organizationId, env);
  if (!hasStarterTierAccess(planCode)) {
    return json({ error: "Email-кампанії доступні з тарифу Mail Starter і вище" }, 402, corsHeaders);
  }

  const mailAccountId = body.mail_account_id;
  if (!mailAccountId) return json({ error: "mail_account_id обов'язковий" }, 400, corsHeaders);

  const accountCheck = await selectRows<{ id: string }>(
    "mail_accounts",
    `select=id&id=eq.${encodeURIComponent(mailAccountId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!accountCheck.data?.[0]) return json({ error: "mail_account_id не належить цій організації" }, 400, corsHeaders);

  const name = body.name?.trim();
  const subject = body.subject?.trim();
  if (!name || !subject) return json({ error: "name і subject обов'язкові" }, 400, corsHeaders);

  const scheduledAt = body.scheduled_at ? new Date(body.scheduled_at) : null;
  const isScheduled = scheduledAt && !isNaN(scheduledAt.getTime()) && scheduledAt.getTime() > Date.now();

  const insertRes = await insertRowReturning<{ id: string }>(
    "mail_campaigns",
    {
      organization_id: organizationId,
      mail_account_id: mailAccountId,
      name,
      subject,
      template_id: body.template_id || null,
      status: isScheduled ? "scheduled" : "draft",
      scheduled_at: isScheduled ? scheduledAt!.toISOString() : null,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true, id: insertRes.data[0]?.id }, 201, corsHeaders);
}

export async function handleMailCampaignSendNow(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  campaignId: string
): Promise<Response> {
  const campaignRes = await selectRows<{ organization_id: string }>(
    "mail_campaigns",
    `select=organization_id&id=eq.${encodeURIComponent(campaignId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const organizationId = campaignRes.data?.[0]?.organization_id;
  if (!organizationId) return json({ error: "Не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const result = await sendCampaign(campaignId, env);
  return json(result, result.ok ? 200 : 500, corsHeaders);
}

async function renderTemplateToHtml(templateId: string | null, env: Env): Promise<string> {
  if (!templateId) return "";
  const res = await selectRows<{ content: { blocks?: Array<{ type?: string; heading?: string; body?: string; text?: string }> } }>(
    "mail_templates",
    `select=content&id=eq.${encodeURIComponent(templateId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const blocks = res.data?.[0]?.content?.blocks ?? [];
  return blocks
    .map(b => {
      if (b.type === "hero" || b.type === "text") return `<h2>${b.heading ?? ""}</h2><p>${b.body ?? b.text ?? ""}</p>`;
      return `<p>${b.body ?? b.text ?? ""}</p>`;
    })
    .join("\n");
}

async function sendCampaign(campaignId: string, env: Env): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  const campaignRes = await selectRows<{ mail_account_id: string; subject: string; template_id: string | null; organization_id: string }>(
    "mail_campaigns",
    `select=mail_account_id,subject,template_id,organization_id&id=eq.${encodeURIComponent(campaignId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const campaign = campaignRes.data?.[0];
  if (!campaign) return { ok: false, sent: 0, failed: 0, error: "Кампанію не знайдено" };

  await updateRows("mail_campaigns", `id=eq.${encodeURIComponent(campaignId)}`, { status: "sending" }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  const bodyHtml = await renderTemplateToHtml(campaign.template_id, env);

  const contactsRes = await selectRows<{ id: string; email: string }>(
    "crm_contacts",
    `select=id,email&organization_id=eq.${encodeURIComponent(campaign.organization_id)}&email=not.is.null`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const contacts = contactsRes.data ?? [];

  let sent = 0;
  let failed = 0;
  for (const contact of contacts) {
    const existing = await selectRows<{ id: string; sent_at: string | null }>(
      "mail_campaign_sends",
      `select=id,sent_at&campaign_id=eq.${encodeURIComponent(campaignId)}&contact_id=eq.${encodeURIComponent(contact.id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (existing.data?.[0]?.sent_at) continue;

    const result = await sendGmailMessage(campaign.mail_account_id, contact.email, campaign.subject, bodyHtml, env);

    if (existing.data?.[0]) {
      await updateRows(
        "mail_campaign_sends",
        `id=eq.${encodeURIComponent(existing.data[0].id)}`,
        result.ok ? { sent_at: new Date().toISOString() } : { error_message: result.error },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
    } else {
      await insertRow(
        "mail_campaign_sends",
        { campaign_id: campaignId, contact_id: contact.id, sent_at: result.ok ? new Date().toISOString() : null, error_message: result.ok ? null : result.error },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
    }

    if (result.ok) sent++;
    else failed++;
  }

  await updateRows("mail_campaigns", `id=eq.${encodeURIComponent(campaignId)}`, { status: "sent" }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  return { ok: true, sent, failed };
}

export async function runDueMailCampaigns(env: Env): Promise<{ campaignsSent: number }> {
  const nowIso = new Date().toISOString();
  const dueRes = await selectRows<{ id: string }>(
    "mail_campaigns",
    `select=id&status=eq.scheduled&scheduled_at=lte.${nowIso}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!dueRes.ok || !dueRes.data?.length) return { campaignsSent: 0 };

  let campaignsSent = 0;
  for (const campaign of dueRes.data) {
    const result = await sendCampaign(campaign.id, env);
    if (result.ok) campaignsSent++;
  }
  return { campaignsSent };
}

// ── Automations ──

interface MailAutomation {
  id: string;
  name: string;
  trigger_event: string;
  steps: Array<{ delay_days: number; template_id: string }>;
  is_active: boolean;
  created_at: string;
}

export async function handleMailAutomationsList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<MailAutomation>(
    "mail_automations",
    `select=id,name,trigger_event,steps,is_active,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ automations: res.data ?? [] }, 200, corsHeaders);
}

export async function handleMailAutomationCreate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  let body: { organization_id?: string; mail_account_id?: string; name?: string; steps?: Array<{ delay_days: number; template_id: string }> };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const planCode = await getOrgPlanCode(organizationId, env);
  if (!hasStarterTierAccess(planCode)) {
    return json({ error: "Автоматизації доступні з тарифу Mail Starter і вище" }, 402, corsHeaders);
  }

  const mailAccountId = body.mail_account_id;
  if (!mailAccountId) return json({ error: "mail_account_id обов'язковий" }, 400, corsHeaders);

  const accountCheck = await selectRows<{ id: string }>(
    "mail_accounts",
    `select=id&id=eq.${encodeURIComponent(mailAccountId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!accountCheck.data?.[0]) return json({ error: "mail_account_id не належить цій організації" }, 400, corsHeaders);

  const name = body.name?.trim();
  if (!name) return json({ error: "Назва автоматизації обов'язкова" }, 400, corsHeaders);

  const steps = body.steps;
  if (!Array.isArray(steps) || steps.length === 0) return json({ error: "Потрібен хоча б один крок" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "mail_automations",
    { organization_id: organizationId, mail_account_id: mailAccountId, name, trigger_event: "new_contact", steps, is_active: true },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

export async function runMailAutomations(env: Env): Promise<{ enrolled: number; sent: number }> {
  let enrolled = 0;
  let sent = 0;

  const automationsRes = await selectRows<{ id: string; organization_id: string; steps: Array<{ delay_days: number; template_id: string }> }>(
    "mail_automations",
    `select=id,organization_id,steps&is_active=eq.true&trigger_event=eq.new_contact`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  for (const automation of automationsRes.data ?? []) {
    if (!automation.steps?.[0]) continue;

    const contactsRes = await selectRows<{ id: string }>(
      "crm_contacts",
      `select=id&organization_id=eq.${encodeURIComponent(automation.organization_id)}&email=not.is.null`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    for (const contact of contactsRes.data ?? []) {
      const existingRun = await selectRows<{ id: string }>(
        "mail_automation_runs",
        `select=id&automation_id=eq.${encodeURIComponent(automation.id)}&contact_id=eq.${encodeURIComponent(contact.id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      if (existingRun.data?.[0]) continue;

      const firstStepDelayDays = automation.steps[0].delay_days ?? 0;
      const nextSendAt = new Date(Date.now() + firstStepDelayDays * 24 * 60 * 60 * 1000);

      await insertRow(
        "mail_automation_runs",
        { automation_id: automation.id, contact_id: contact.id, current_step: 0, next_send_at: nextSendAt.toISOString() },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      enrolled++;
    }
  }

  const nowIso = new Date().toISOString();
  const dueRunsRes = await selectRows<{ id: string; automation_id: string; contact_id: string; current_step: number }>(
    "mail_automation_runs",
    `select=id,automation_id,contact_id,current_step&completed_at=is.null&next_send_at=lte.${nowIso}&limit=100`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  for (const run of dueRunsRes.data ?? []) {
    try {
      const automationRes = await selectRows<{ mail_account_id: string; steps: Array<{ delay_days: number; template_id: string }> }>(
        "mail_automations",
        `select=mail_account_id,steps&id=eq.${encodeURIComponent(run.automation_id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const automation = automationRes.data?.[0];
      if (!automation) continue;

      const contactRes = await selectRows<{ email: string | null }>(
        "crm_contacts",
        `select=email&id=eq.${encodeURIComponent(run.contact_id)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const email = contactRes.data?.[0]?.email;
      if (!email) continue;

      const step = automation.steps[run.current_step];
      if (!step) continue;

      const bodyHtml = await renderTemplateToHtml(step.template_id, env);
      const result = await sendGmailMessage(automation.mail_account_id, email, "", bodyHtml, env);
      if (result.ok) sent++;

      const nextStepIndex = run.current_step + 1;
      const nextStep = automation.steps[nextStepIndex];

      if (nextStep) {
        const nextSendAt = new Date(Date.now() + (nextStep.delay_days ?? 0) * 24 * 60 * 60 * 1000);
        await updateRows(
          "mail_automation_runs",
          `id=eq.${encodeURIComponent(run.id)}`,
          { current_step: nextStepIndex, next_send_at: nextSendAt.toISOString() },
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        );
      } else {
        await updateRows(
          "mail_automation_runs",
          `id=eq.${encodeURIComponent(run.id)}`,
          { completed_at: new Date().toISOString() },
          env.SUPABASE_URL,
          env.SUPABASE_SERVICE_ROLE_KEY
        );
      }
    } catch (err) {
      console.error("[mail-automations] failed for run", run.id, err);
    }
  }

  return { enrolled, sent };
}
