// ============================================================
// contentGeneration.ts — модуль AI/Content (MODULE_ROADMAP.md, розділ 2).
// Переюзовує retry-патерн виклику Gemini з chatHandler.ts (429/503 retry,
// AbortController-таймаут, окремий GEMINI_CHAT_API_KEY для інтерактивних
// запитів, щоб не конкурувати з квотою фонового моніторингу).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { getUserIdFromToken } from "./gscHandler";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;

export type GenerationKind = "title" | "meta_description" | "faq" | "article_intro";

const KIND_LABELS: Record<GenerationKind, string> = {
  title: "заголовок сторінки (SEO title)",
  meta_description: "meta description",
  faq: "розділ FAQ (3-5 питань з відповідями)",
  article_intro: "вступний абзац статті",
};

const KIND_CONSTRAINTS: Record<GenerationKind, string> = {
  title: "50-60 символів, включає головне ключове слово, привабливий для кліку",
  meta_description: "120-160 символів, описує цінність для користувача, заклик до дії в кінці",
  faq: "3-5 пар питання-відповідь у форматі 'Питання: ... Відповідь: ...', відповіді короткі й конкретні",
  article_intro: "2-3 речення, захоплює увагу з першого речення, природно веде до теми статті",
};

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", ...headers } });
}

/** Перша організація, до якої належить користувач (як getOrgIdForSite в gscHandler.ts, але без прив'язки до конкретного сайту). */
async function getOrgIdForUser(userId: string, supabaseUrl: string, serviceKey: string): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
    supabaseUrl,
    serviceKey
  );
  return res.data?.[0]?.organization_id ?? null;
}

function buildPrompt(kind: GenerationKind, topic: string, keywords: string | undefined, tone: string | undefined): string {
  const toneCtx = tone?.trim() ? `Тон: ${tone.trim()}.` : "Тон: професійний, але дружній.";
  const keywordsCtx = keywords?.trim() ? `Ключові слова, які варто природно включити: ${keywords.trim()}.` : "";

  return `Ти — копірайтер, який пише ${KIND_LABELS[kind]} для бізнес-сайту.

Тема/бізнес: ${topic}
${keywordsCtx}
${toneCtx}

Вимоги до результату: ${KIND_CONSTRAINTS[kind]}

Пиши українською мовою. Поверни ЛИШЕ готовий текст, без пояснень, без лапок навколо тексту, без preamble на кшталт "Ось варіант:".`;
}

/**
 * Виклик Gemini з retry на 429/503 — той самий патерн, що в
 * chatHandler.ts (handleChatRequest), винесений сюди окремо, оскільки
 * тут немає system_instruction/історії повідомлень — просто один
 * prompt на один результат.
 */
async function callGemini(prompt: string, apiKey: string): Promise<{ ok: true; text: string } | { ok: false; error: string; status: number }> {
  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.7, maxOutputTokens: 1500 },
  };

  const doFetch = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
      return await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  try {
    let resp = await doFetch();

    if (resp.status === 429 || resp.status === 503) {
      const delay = resp.status === 503 ? 6000 : 4000;
      console.warn(`[content-gen] Gemini ${resp.status} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      resp = await doFetch();
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[content-gen] Gemini error:", resp.status, errText.slice(0, 300));
      return { ok: false, error: resp.status === 429 ? "AI перевантажений — спробуйте через хвилину" : "AI тимчасово недоступний", status: 503 };
    }

    interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const data = (await resp.json()) as GeminiResponse;
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (!text) return { ok: false, error: "AI не повернув результат", status: 502 };

    return { ok: true, text };
  } catch (err) {
    console.error("[content-gen] fetch error:", err);
    return { ok: false, error: "AI тимчасово недоступний", status: 503 };
  }
}

// ── Route: POST /api/ai/generate ─────────────────────────────────────

export async function handleAiGenerate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForUser(userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Організацію не знайдено" }, 404, corsHeaders);

  let body: { kind?: string; site_id?: string; topic?: string; keywords?: string; tone?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const kind = body.kind as GenerationKind;
  if (!kind || !(kind in KIND_LABELS)) return json({ error: "Невідомий тип генерації" }, 400, corsHeaders);
  const topic = body.topic?.trim();
  if (!topic || topic.length > 500) return json({ error: "Опишіть тему (до 500 символів)" }, 400, corsHeaders);

  // Перевіряємо і списуємо credit ДО виклику Gemini — не витрачати квоту
  // на запит, який все одно буде відхилено через відсутність кредитів
  const creditsRes = await selectRows<{ credits_remaining: number }>(
    "ai_credits",
    `select=credits_remaining&organization_id=eq.${encodeURIComponent(orgId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const credits = creditsRes.data?.[0]?.credits_remaining ?? 0;
  if (credits <= 0) {
    return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const prompt = buildPrompt(kind, topic, body.keywords, body.tone);
  const result = await callGemini(prompt, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  // Списуємо credit і записуємо генерацію в історію
  await updateRows(
    "ai_credits",
    `organization_id=eq.${encodeURIComponent(orgId)}`,
    { credits_remaining: credits - 1 },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  await insertRow(
    "ai_generations",
    {
      organization_id: orgId,
      site_id: body.site_id || null,
      kind,
      prompt_input: { topic, keywords: body.keywords ?? null, tone: body.tone ?? null },
      output: result.text,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return json({ output: result.text, credits_remaining: credits - 1 }, 200, corsHeaders);
}

// ── Route: GET /api/ai/history?site_id= ──────────────────────────────

export async function handleAiHistory(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForUser(userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Організацію не знайдено" }, 404, corsHeaders);

  const url = new URL(request.url);
  const siteId = url.searchParams.get("site_id");
  const siteFilter = siteId ? `&site_id=eq.${encodeURIComponent(siteId)}` : "";

  const res = await selectRows<{ id: string; kind: string; prompt_input: unknown; output: string; created_at: string }>(
    "ai_generations",
    `select=id,kind,prompt_input,output,created_at&organization_id=eq.${encodeURIComponent(orgId)}${siteFilter}&order=created_at.desc&limit=50`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ generations: res.data ?? [] }, 200, corsHeaders);
}

// ── Route: GET /api/ai/credits ────────────────────────────────────────

export async function handleAiCredits(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const orgId = await getOrgIdForUser(userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return json({ error: "Організацію не знайдено" }, 404, corsHeaders);

  const res = await selectRows<{ credits_remaining: number; credits_reset_at: string | null }>(
    "ai_credits",
    `select=credits_remaining,credits_reset_at&organization_id=eq.${encodeURIComponent(orgId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const row = res.data?.[0];

  return json({ credits_remaining: row?.credits_remaining ?? 0, credits_reset_at: row?.credits_reset_at ?? null }, 200, corsHeaders);
}
