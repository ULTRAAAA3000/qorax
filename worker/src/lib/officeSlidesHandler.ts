// ============================================================
// QORAX — Qorax Office: office_slides (MVP Slides mode)
// ============================================================
// MODULE_ROADMAP.md, "Qorax Office". CRUD — точна копія патерну
// officeHandler.ts/officeSheetsHandler.ts. AI Slide Generator —
// callGemini() + облік кредитів, той самий підхід, що AI Writer.
// Кожен слайд — той самий OfficeBlock[], що office_documents —
// переюзаний тип, не новий формат контенту.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, insertRowReturning, updateRows } from "./supabase";
import { requireOrgAccess } from "./orgAuth";
import { callGemini } from "./contentGeneration";
import { checkAiCredits, deductAiCredits } from "./aiCredits";
import type { OfficeBlock } from "./officeHandler";
import { maybeSnapshotVersion } from "./officeVersions";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

interface Slide {
  id: string;
  blocks: OfficeBlock[];
}

interface SlidesRow {
  id: string;
  organization_id: string;
  title: string;
  slides: Slide[];
  created_at: string;
  updated_at: string;
}

async function getSlidesOrgId(deckId: string, env: Env): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "office_slides",
    `select=organization_id&id=eq.${encodeURIComponent(deckId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data?.[0]?.organization_id ?? null;
}

// ── GET /api/organizations/:id/office-slides ── список ────────────

export async function handleSlidesDecksList(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<Omit<SlidesRow, "slides">>(
    "office_slides",
    `select=id,organization_id,title,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ decks: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/organizations/:id/office-slides ── нова презентація ──

export async function handleSlidesDeckCreate(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const insertRes = await insertRowReturning<SlidesRow>(
    "office_slides",
    { organization_id: organizationId, title: body.title?.trim() || "Без назви", created_by: access.userId },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true, deck: insertRes.data?.[0] ?? null }, 201, corsHeaders);
}

// ── GET /api/office-slides/:id ── презентація зі слайдами ──────────

export async function handleSlidesDeckDetail(request: Request, env: Env, corsHeaders: Record<string, string>, deckId: string): Promise<Response> {
  const orgId = await getSlidesOrgId(deckId, env);
  if (!orgId) return json({ error: "Презентацію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<SlidesRow>(
    "office_slides",
    `select=id,organization_id,title,slides,created_at,updated_at&id=eq.${encodeURIComponent(deckId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const deck = res.data?.[0];
  if (!deck) return json({ error: "Презентацію не знайдено" }, 404, corsHeaders);

  return json({ deck }, 200, corsHeaders);
}

// ── PATCH /api/office-slides/:id ── назва і/або слайди ─────────────

export async function handleSlidesDeckUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, deckId: string): Promise<Response> {
  const orgId = await getSlidesOrgId(deckId, env);
  if (!orgId) return json({ error: "Презентацію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  // Version History (0081) — throttled ~10 хв, той самий підхід, що officeHandler.ts.
  await maybeSnapshotVersion({ docType: "office_slides", docId: deckId, organizationId: orgId, dataColumn: "slides", userId: access.userId, env });

  let body: { title?: string; slides?: Slide[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.title === "string" && body.title.trim()) patch.title = body.title.trim();
  if (Array.isArray(body.slides)) patch.slides = body.slides;

  const res = await updateRows(
    "office_slides",
    `id=eq.${encodeURIComponent(deckId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    patch,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/office-slides/:id ──────────────────────────────────

export async function handleSlidesDeckDelete(request: Request, env: Env, corsHeaders: Record<string, string>, deckId: string): Promise<Response> {
  const orgId = await getSlidesOrgId(deckId, env);
  if (!orgId) return json({ error: "Презентацію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/office_slides?id=eq.${encodeURIComponent(deckId)}&organization_id=eq.${encodeURIComponent(orgId)}`,
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

// ── POST /api/office-slides/:id/ai-generate ── AI Slide Generator ──
//
// "Зроби презентацію інвестору" з довгострокового бачення Creator —
// звужено до MVP: генерує структуру (заголовок + буліт-пункти на
// слайд), БЕЗ зображень/діаграм/дизайну (той самий Image-generation-
// API рішення, ще не прийняте, що вже позначено як блокер у
// MODULE_ROADMAP.md для повного AI Creator). Заміняє ВСІ слайди
// презентації — на відміну від AI Writer у Docs (додає в кінець),
// бо презентація по своїй природі — цілісна структура, не список
// нотаток, куди можна дописати абзац.

export async function handleSlidesAiGenerate(request: Request, env: Env, corsHeaders: Record<string, string>, deckId: string): Promise<Response> {
  const orgId = await getSlidesOrgId(deckId, env);
  if (!orgId) return json({ error: "Презентацію не знайдено" }, 404, corsHeaders);

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

  const credits = await checkAiCredits(orgId, env);
  if (!credits.ok) return json({ error: "Недостатньо AI-кредитів" }, 402, corsHeaders);

  const prompt = `Ти — AI-генератор презентацій у Qorax Office Slides.
Запит користувача: "${instruction}"

Побудуй структуру презентації: 5-10 слайдів. Кожен слайд має заголовок і
2-5 коротких буліт-пунктів (без зображень і діаграм — тільки текст).

Поверни РІВНО валідний JSON без жодного тексту навколо (без markdown-огорожі),
формату: {"slides": [{"title": "Заголовок слайду", "bullets": ["пункт 1", "пункт 2"]}]}
Пиши українською, якщо запит не вказує іншу мову.`;

  const geminiResult = await callGemini(prompt, env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY);
  if (!geminiResult.ok) return json({ error: geminiResult.error }, geminiResult.status, corsHeaders);

  let parsed: { slides: Array<{ title: string; bullets: string[] }> };
  try {
    const cleaned = geminiResult.text.replace(/^```json\s*|```\s*$/g, "").trim();
    parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed.slides)) throw new Error("bad shape");
  } catch {
    return json({ error: "AI повернув невалідний формат — спробуйте ще раз" }, 502, corsHeaders);
  }

  const slides: Slide[] = parsed.slides.map((s, i) => ({
    id: `ai-slide-${Date.now()}-${i}`,
    blocks: [
      { id: `ai-h-${Date.now()}-${i}`, type: "heading", level: 1, text: s.title } as OfficeBlock,
      { id: `ai-l-${Date.now()}-${i}`, type: "bullet_list", items: s.bullets } as OfficeBlock,
    ],
  }));

  await deductAiCredits(orgId, credits.creditsRemaining, credits.unlimited, env);
  await insertRow(
    "ai_generations",
    { organization_id: orgId, kind: "office_ai_slides", prompt_input: { instruction }, output: JSON.stringify(parsed) },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  ).catch(() => {});

  return json({ ok: true, slides }, 200, corsHeaders);
}
