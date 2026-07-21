// ============================================================
// QORAX — Qorax Office: office_sheets (MVP Sheets mode)
// ============================================================
// MODULE_ROADMAP.md, "Qorax Office". CRUD-частина — точна копія
// патерну officeHandler.ts (requireOrgAccess, insertRowReturning,
// частковий PATCH). AI Table Generator — не нова генерація,
// callGemini() з contentGeneration.ts + checkAiCredits/
// deductAiCredits, той самий облік кредитів, що AI Writer у Docs.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, insertRowReturning, updateRows } from "./supabase";
import { requireOrgAccess } from "./orgAuth";
import { callGemini } from "./contentGeneration";
import { checkAiCredits, deductAiCredits } from "./aiCredits";
import { maybeSnapshotVersion } from "./officeVersions";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

interface SheetData {
  columns: number;
  rows: number;
  cells: Record<string, string>; // "A1" -> текст/число/формула як рядок
  // formats/charts — опційні поля, worker не валідує їх форму (jsonb,
  // наскрізна передача), визначені на клієнті в
  // app/office/sheets/sheetFormulas.ts.
  formats?: Record<string, unknown>;
  charts?: unknown[];
}

interface SheetRow {
  id: string;
  organization_id: string;
  title: string;
  data: SheetData;
  created_at: string;
  updated_at: string;
}

async function getSheetOrgId(sheetId: string, env: Env): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "office_sheets",
    `select=organization_id&id=eq.${encodeURIComponent(sheetId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data?.[0]?.organization_id ?? null;
}

// ── GET /api/organizations/:id/office-sheets ── список ────────────

export async function handleSheetsList(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<Omit<SheetRow, "data">>(
    "office_sheets",
    `select=id,organization_id,title,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ sheets: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/organizations/:id/office-sheets ── нова таблиця ─────

export async function handleSheetCreate(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const insertRes = await insertRowReturning<SheetRow>(
    "office_sheets",
    { organization_id: organizationId, title: body.title?.trim() || "Без назви", created_by: access.userId },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true, sheet: insertRes.data?.[0] ?? null }, 201, corsHeaders);
}

// ── GET /api/office-sheets/:id ── таблиця з даними ─────────────────

export async function handleSheetDetail(request: Request, env: Env, corsHeaders: Record<string, string>, sheetId: string): Promise<Response> {
  const orgId = await getSheetOrgId(sheetId, env);
  if (!orgId) return json({ error: "Таблицю не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<SheetRow>(
    "office_sheets",
    `select=id,organization_id,title,data,created_at,updated_at&id=eq.${encodeURIComponent(sheetId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sheet = res.data?.[0];
  if (!sheet) return json({ error: "Таблицю не знайдено" }, 404, corsHeaders);

  return json({ sheet }, 200, corsHeaders);
}

// ── PATCH /api/office-sheets/:id ── назва і/або дані ───────────────

export async function handleSheetUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, sheetId: string): Promise<Response> {
  const orgId = await getSheetOrgId(sheetId, env);
  if (!orgId) return json({ error: "Таблицю не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  // Version History (0081) — throttled ~10 хв, той самий підхід, що officeHandler.ts.
  await maybeSnapshotVersion({ docType: "office_sheets", docId: sheetId, organizationId: orgId, dataColumn: "data", userId: access.userId, env });

  let body: { title?: string; data?: SheetData };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (body.data && typeof body.data === "object" && body.data.cells) patch.data = body.data;

  const res = await updateRows(
    "office_sheets",
    `id=eq.${encodeURIComponent(sheetId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    patch,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/office-sheets/:id ──────────────────────────────────

export async function handleSheetDelete(request: Request, env: Env, corsHeaders: Record<string, string>, sheetId: string): Promise<Response> {
  const orgId = await getSheetOrgId(sheetId, env);
  if (!orgId) return json({ error: "Таблицю не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/office_sheets?id=eq.${encodeURIComponent(sheetId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
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

// ── POST /api/office-sheets/:id/ai-generate ── AI Table Generator ──
//
// MVP: генерує СТРУКТУРУ таблиці (заголовки + приклад/каркас рядків)
// із опису природною мовою — НЕ підтягує реальні дані бізнесу з
// CRM/Analytics (це вимагало б Knowledge Graph-інтеграції на рівні
// Smart Components з довгострокового бачення Creator, окрема більша
// задача). Чесно позиціонується як "AI розставляє структуру, не
// заповнює реальними цифрами" — той самий принцип прозорості, що
// вже прийнятий для Predictive AI (оцінка на основі тренду, не
// гарантія).

export async function handleSheetAiGenerate(request: Request, env: Env, corsHeaders: Record<string, string>, sheetId: string): Promise<Response> {
  const orgId = await getSheetOrgId(sheetId, env);
  if (!orgId) return json({ error: "Таблицю не знайдено" }, 404, corsHeaders);

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

  const prompt = `Ти — AI-генератор таблиць у Qorax Office Sheets.
Запит користувача: "${instruction}"

Побудуй структуру таблиці відповідно до запиту. Якщо запит просить реальні
бізнес-дані (наприклад "прибуток по клієнтах") — постав приклад-каркас з
позначками [заповнити], НЕ вигадуй реальні цифри.

Поверни РІВНО валідний JSON без жодного тексту навколо (без markdown-огорожі),
формату: {"headers": ["Колонка 1", "Колонка 2", ...], "rows": [["значення", "значення"], ...]}
Не більше 8 колонок і 15 рядків. Пиши українською, якщо запит не вказує іншу мову.`;

  const geminiResult = await callGemini(prompt, env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY);
  if (!geminiResult.ok) return json({ error: geminiResult.error }, geminiResult.status, corsHeaders);

  let parsed: { headers: string[]; rows: string[][] };
  try {
    const cleaned = geminiResult.text.replace(/^```json\s*|```\s*$/g, "").trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) throw new Error("bad shape");
  } catch {
    return json({ error: "AI повернув невалідний формат — спробуйте ще раз" }, 502, corsHeaders);
  }

  // headers/rows -> sparse cells у A1-нотації, той самий формат, що office_sheets.data.cells
  const colLetter = (i: number) => String.fromCharCode(65 + i);
  const cells: Record<string, string> = {};
  parsed.headers.forEach((h, c) => { cells[`${colLetter(c)}1`] = h; });
  parsed.rows.forEach((row, r) => {
    row.forEach((val, c) => { cells[`${colLetter(c)}${r + 2}`] = val; });
  });

  await deductAiCredits(orgId, credits.creditsRemaining, credits.unlimited, env);
  await insertRow(
    "ai_generations",
    { organization_id: orgId, kind: "office_ai_sheet", prompt_input: { instruction }, output: JSON.stringify(parsed) },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  ).catch(() => {});

  return json({ ok: true, cells, columns: Math.max(12, parsed.headers.length), rows: Math.max(30, parsed.rows.length + 5) }, 200, corsHeaders);
}
