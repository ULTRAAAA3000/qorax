// ============================================================
// QORAX — Qorax Office: office_documents (MVP Docs mode)
// ============================================================
// MODULE_ROADMAP.md, "Qorax Office — окремий продукт екосистеми".
// MVP-пріоритет з самого документа Артема: "зручний редактор
// документів" (Docs, цей файл) і "AI, що реально економить час"
// (AI Writer нижче) — перші два пункти списку. Sheets/Slides/
// Whiteboard/PDF Studio/Templates — НЕ цей прохід, свідомо.
//
// CRUD-частина — той самий патерн, що creatorHandler.ts
// (canvas_boards): requireOrgAccess з orgAuth.ts, insertRowReturning
// для отримання id одразу після створення.
// AI Writer — не нова генерація, `callGemini()` з
// contentGeneration.ts (той самий retry на 429/503) + AI-кредити
// тим самим механізмом (checkAiCredits/deductAiCredits).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, insertRowReturning, updateRows } from "./supabase";
import { requireOrgAccess } from "./orgAuth";
import { maybeSnapshotVersion } from "./officeVersions";
import { callGemini } from "./contentGeneration";
import { checkAiCredits, deductAiCredits } from "./aiCredits";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

// Формат блоків MVP — навмисно вузький (paragraph/heading/
// bullet_list/checklist), решта Smart Blocks зі списку в плані —
// пізніші ітерації, не цей прохід. Той самий "{blocks:[...]}"
// формат, що project_pages.content (0058).
export type OfficeBlock =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "bullet_list"; items: string[] }
  | { id: string; type: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { id: string; type: "image"; url: string; alt?: string };

interface DocRow {
  id: string;
  organization_id: string;
  title: string;
  content: { blocks: OfficeBlock[] };
  created_at: string;
  updated_at: string;
}

interface TemplateRow {
  id: string;
  organization_id: string | null;
  category: string;
  title: string;
  description: string | null;
  content: { blocks: OfficeBlock[] };
}

async function getDocOrgId(docId: string, env: Env): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "office_documents",
    `select=organization_id&id=eq.${encodeURIComponent(docId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data?.[0]?.organization_id ?? null;
}

// ── GET /api/organizations/:id/office-templates ── бібліотека шаблонів ──
//
// Повертає системні (organization_id=null) + власні шаблони
// організації в одному списку — той самий підхід, що RLS-політика
// вже дозволяє на рівні бази (0073), тут просто один SELECT без
// додаткової фільтрації.

export async function handleTemplatesList(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<Omit<TemplateRow, "content">>(
    "office_templates",
    `select=id,organization_id,category,title,description&or=(organization_id.is.null,organization_id.eq.${encodeURIComponent(organizationId)})&order=category.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ templates: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/office-documents/:id/save-as-template ── власний шаблон ──
//
// Схема (organization_id на office_templates) вже це дозволяла з
// самого початку (0073) — цим ендпоінтом закривається прогалина,
// зафіксована в EXECUTION_PLAN.md при першій реалізації Templates.
// Власний шаблон організації, не системний — інші організації його
// не бачать (RLS office_templates_select вже це гарантує).

export async function handleSaveAsTemplate(request: Request, env: Env, corsHeaders: Record<string, string>, docId: string): Promise<Response> {
  const docRes = await selectRows<DocRow>(
    "office_documents",
    `select=organization_id,title,content&id=eq.${encodeURIComponent(docId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const doc = docRes.data?.[0];
  if (!doc) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, doc.organization_id, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string; description?: string; category?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const insertRes = await insertRowReturning<TemplateRow>(
    "office_templates",
    {
      organization_id: doc.organization_id, // НЕ null — власний шаблон, не системний
      category: body.category?.trim() || "custom",
      title: body.title?.trim() || doc.title,
      description: body.description?.trim() || null,
      content: doc.content,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true, template: insertRes.data?.[0] ?? null }, 201, corsHeaders);
}

// ── GET /api/organizations/:id/office-documents ── список документів ──

export async function handleDocsList(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<Omit<DocRow, "content">>(
    "office_documents",
    `select=id,organization_id,title,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ documents: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/organizations/:id/office-documents ── новий документ ──

export async function handleDocCreate(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string; template_id?: string; content?: { blocks: OfficeBlock[] } };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  let title = body.title?.trim() || "Без назви";
  let content: { blocks: OfficeBlock[] } | undefined;

  if (body.template_id) {
    const templateRes = await selectRows<TemplateRow>(
      "office_templates",
      `select=id,organization_id,title,content&id=eq.${encodeURIComponent(body.template_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const template = templateRes.data?.[0];
    // Шаблон має бути або системним (organization_id null), або
    // власним для ЦІЄЇ організації — той самий захист, що вже є в
    // creatorHandler.ts для ref_id проєкту, щоб не можна було
    // підставити чужий template_id іншої організації.
    if (!template || (template.organization_id !== null && template.organization_id !== organizationId)) {
      return json({ error: "Шаблон не знайдено" }, 404, corsHeaders);
    }
    if (!body.title?.trim()) title = template.title;
    content = template.content;
  } else if (body.content?.blocks) {
    // Прямий content без template_id — Smart Capture з Qorax Browser
    // (MODULE_ROADMAP.md, "Qorax Browser", Smart Capture: виділений
    // текст сторінки → напряму в Office). Мінімальна валідація форми
    // блоків, не повний схема-валідатор — той самий рівень довіри,
    // що решта worker-ендпоінтів до вже автентифікованого органу.
    const blocks = body.content.blocks;
    if (Array.isArray(blocks) && blocks.every(b => b && typeof b === "object" && "type" in b)) {
      content = { blocks };
    }
  }

  const insertRes = await insertRowReturning<DocRow>(
    "office_documents",
    {
      organization_id: organizationId,
      title,
      ...(content ? { content } : {}),
      created_by: access.userId,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true, document: insertRes.data?.[0] ?? null }, 201, corsHeaders);
}

// ── GET /api/office-documents/:id ── документ з вмістом ──

export async function handleDocDetail(request: Request, env: Env, corsHeaders: Record<string, string>, docId: string): Promise<Response> {
  const orgId = await getDocOrgId(docId, env);
  if (!orgId) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<DocRow>(
    "office_documents",
    `select=id,organization_id,title,content,created_at,updated_at&id=eq.${encodeURIComponent(docId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const doc = res.data?.[0];
  if (!doc) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  return json({ document: doc }, 200, corsHeaders);
}

// ── PATCH /api/office-documents/:id ── назва і/або вміст ──
//
// Приймає частковий патч (title і/або content) — той самий підхід,
// що handleNodeUpdate в creatorHandler.ts, щоб автозбереження
// редактора могло слати лише те, що змінилось.

export async function handleDocUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, docId: string): Promise<Response> {
  const orgId = await getDocOrgId(docId, env);
  if (!orgId) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  // Version History (0081) — знімок стану ДО застосування патчу,
  // throttled ~10 хв на документ, не на кожне збереження.
  await maybeSnapshotVersion({ docType: "office_documents", docId, organizationId: orgId, dataColumn: "content", userId: access.userId, env });

  let body: { title?: string; content?: { blocks: OfficeBlock[] } };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (body.content && Array.isArray(body.content.blocks)) patch.content = body.content;

  const res = await updateRows(
    "office_documents",
    `id=eq.${encodeURIComponent(docId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    patch,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/office-documents/:id ──────────────────────────────

export async function handleDocDelete(request: Request, env: Env, corsHeaders: Record<string, string>, docId: string): Promise<Response> {
  const orgId = await getDocOrgId(docId, env);
  if (!orgId) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/office_documents?id=eq.${encodeURIComponent(docId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
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

// ── POST /api/office-documents/:id/ai-writer ── AI Writer ─────────
//
// MVP: одна дія за раз (не повний "структура → таблиці → зображення"
// пайплайн з плану — той рівень вимагає image-generation API,
// окреме постачальницьке рішення, не вирішене в MODULE_ROADMAP.md).
// instruction — довільний запит користувача ("зроби коротшим",
// "напиши вступ про...", "додай висновок") — AI Writer повертає
// НОВИЙ набір блоків, редактор сам вирішує, замінити весь документ
// чи додати блоки в кінець (керується параметром mode на клієнті).

export async function handleAiWriter(request: Request, env: Env, corsHeaders: Record<string, string>, docId: string): Promise<Response> {
  const orgId = await getDocOrgId(docId, env);
  if (!orgId) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { instruction?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  const instruction = body.instruction?.trim();
  if (!instruction) return json({ error: "instruction обов'язковий" }, 400, corsHeaders);

  const credits = await checkAiCredits(orgId, "office", env);
  if (!credits.ok) {
    return json(
      { error: credits.disabledByAdmin ? "AI тимчасово вимкнено адміністратором платформи." : "Недостатньо AI-кредитів" },
      credits.disabledByAdmin ? 503 : 402,
      corsHeaders
    );
  }

  const prompt = `Ти — AI Writer у Qorax Office, допомагаєш писати ділові документи.
Запит користувача: "${instruction}"

Напиши текст відповідно до запиту. Поверни РІВНО валідний JSON-масив блоків без жодного тексту навколо (без markdown-огорожі, без пояснень), формату:
[{"type":"paragraph","text":"..."}] або [{"type":"heading","level":2,"text":"..."}] або [{"type":"bullet_list","items":["...", "..."]}]
Не вигадуй інших полів. Пиши українською, якщо запит не вказує іншу мову.`;

  const geminiResult = await callGemini(prompt, env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY);
  if (!geminiResult.ok) return json({ error: geminiResult.error }, geminiResult.status, corsHeaders);

  let blocks: Array<Record<string, unknown>>;
  try {
    const cleaned = geminiResult.text.replace(/^```json\s*|```\s*$/g, "").trim();
    blocks = JSON.parse(cleaned);
    if (!Array.isArray(blocks)) throw new Error("not an array");
  } catch {
    return json({ error: "AI повернув невалідний формат — спробуйте ще раз" }, 502, corsHeaders);
  }

  const withIds = blocks.map((b, i) => ({ id: `ai-${Date.now()}-${i}`, ...b }));

  await deductAiCredits(orgId, credits.creditsRemaining, credits.unlimited, env);
  await insertRow(
    "ai_generations",
    { organization_id: orgId, kind: "office_ai_writer", prompt_input: { instruction }, output: JSON.stringify(withIds) },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  ).catch(() => {}); // лог генерації не критичний для успіху запиту

  return json({ ok: true, blocks: withIds }, 200, corsHeaders);
}
