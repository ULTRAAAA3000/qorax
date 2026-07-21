// ============================================================
// sitesAiHandler.ts — AI-генерація контенту для сторінок Sites-
// конструктора (project_pages, 0058_sites_builder.sql).
//
// Артем: "делай возможность ИИ генерации контента для страницы в
// модуле Sites" — після того, як Sites-конструктор і хвиля 3 Qorax
// AI обидва вже готові (паралельна робота Артема). Це місток між
// двома завершеними системами: генерує ВСЮ сторінку одразу (усі
// блоки за один запит, рішення Артема), контекст — ai_memory
// (buildMemoryContext з memoryHandler.ts), якщо заповнено, інакше
// текстове поле "опишіть бізнес" як fallback.
//
// Стиль файлу — сучасний патерн проєкту (orgAuth.ts/httpUtils.ts,
// той самий, що sitesBuilderHandler.ts), НЕ старіший патерн
// authenticate()/jsonResponse() з файлів хвилі 3 (chatHandler.ts
// тощо, написаних до появи orgAuth.ts/httpUtils.ts).
//
// Списання кредитів переюзовує ІСНУЮЧУ ai_credits (0042_ai_content_
// module.sql) — 1 кредит за генерацію всієї сторінки (один виклик
// Gemini, не по кредиту на блок). Результат НЕ пишеться в
// ai_generations — та таблиця прив'язана до sites (моніторинг), а
// не projects (конструктор); генерація одразу оновлює project_pages.
// content, окремої історії генерацій для Sites немає в MVP.
//
// Структурований вихід через responseMimeType: "application/json" +
// responseSchema (Gemini API, gemini-2.5-flash підтримує) — гарантує
// валідний JSON без крихкого текстового парсингу.
// ============================================================

import type { Env } from "../types";
import { selectRows, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccessForProject } from "./orgAuth";
import { buildMemoryContext } from "./memoryHandler";
import { checkAiCredits, deductAiCredits } from "./aiCredits";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 30_000; // довше за звичайну генерацію — вся сторінка одразу

interface ProjectPageRow {
  id: string;
  project_id: string;
  slug: string;
  content: { blocks?: Array<{ type: string }> };
}

interface GeneratedBlock {
  type: string;
  heading?: string;
  subheading?: string;
  body?: string;
  cta_text?: string;
  cta_href?: string;
  alt?: string;
  items?: Array<{ question: string; answer: string }>;
}

// Схема відповіді Gemini — той самий набір полів, що Block у
// ProjectEditorUI.tsx, БЕЗ image_url (Gemini не генерує реальні
// зображення тут, alt-текст для існуючого image-блоку — можна).
const BLOCK_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    seo_title: { type: "string", description: "SEO-заголовок сторінки, до 60 символів" },
    seo_description: { type: "string", description: "SEO-опис сторінки, до 160 символів" },
    blocks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["hero", "text", "image", "cta", "faq"] },
          heading: { type: "string" },
          subheading: { type: "string" },
          body: { type: "string" },
          cta_text: { type: "string" },
          cta_href: { type: "string" },
          alt: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: { type: "string" },
                answer: { type: "string" },
              },
              required: ["question", "answer"],
            },
          },
        },
        required: ["type"],
      },
    },
  },
  required: ["seo_title", "seo_description", "blocks"],
};

// ── POST /api/projects/:id/pages/:pageId/ai-generate ──────────
// body: { topic?: string } — topic лише fallback, якщо ai_memory
// організації порожня. minRole editor (той самий рівень, що
// project_pages_update_own_org policy й PATCH-ендпоінт сторінки).

export async function handleProjectPageAiGenerate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  projectId: string,
  pageId: string
): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) {
    if (access.status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
    if (access.status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
    return json({ error: "Unauthorized" }, 401, corsHeaders);
  }
  const organizationId = access.organizationId!;

  let body: { topic?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const pageRes = await selectRows<ProjectPageRow>(
    "project_pages",
    `select=id,project_id,slug,content&id=eq.${encodeURIComponent(pageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const page = pageRes.data?.[0];
  if (!page) return json({ error: "Сторінку не знайдено" }, 404, corsHeaders);

  // Контекст: ai_memory організації (Qorax AI хаб, вкладка Memory),
  // якщо заповнена — інакше topic з тіла запиту як fallback.
  const memoryContext = await buildMemoryContext(organizationId, env);
  const topic = body.topic?.trim().slice(0, 500);

  if (!memoryContext && !topic) {
    return json(
      { error: "Заповніть Memory в Qorax AI (вкладка Memory) або опишіть бізнес у полі нижче." },
      400,
      corsHeaders
    );
  }

  // Перевіряємо і списуємо credit ДО виклику Gemini — aiCredits.ts
  // (спільний helper), безлімітні кредити для адмінської організації.
  const creditsCheck = await checkAiCredits(organizationId, "business", env);
  if (!creditsCheck.ok) {
    return json(
      { error: creditsCheck.disabledByAdmin ? "AI тимчасово вимкнено адміністратором платформи." : "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." },
      creditsCheck.disabledByAdmin ? 503 : 402,
      corsHeaders
    );
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  // Існуючі блоки на сторінці визначають, ЯКІ типи блоків генерувати
  // (зберігаємо структуру, яку вже обрав користувач, не вигадуємо
  // нову з нуля) — якщо сторінка порожня, пропонуємо базовий набір.
  const existingTypes = (page.content?.blocks ?? []).map((b) => b.type);
  const typesToGenerate = existingTypes.length > 0 ? existingTypes : ["hero", "text", "cta"];

  const contextBlock = memoryContext
    ? `Контекст про бізнес:\n${memoryContext}`
    : `Опис бізнесу: ${topic}`;

  const prompt = `Ти копірайтер, що пише текст для лендингу малого бізнесу.
${contextBlock}

Сторінка сайту: "${page.slug}".
Згенеруй SEO-заголовок, SEO-опис і контент для блоків у такому порядку типів: ${typesToGenerate.join(", ")}.

Правила:
- Для блоку "hero": heading (короткий, привабливий), subheading (1 речення), cta_text (2-4 слова), cta_href завжди "#contact"
- Для блоку "text": heading і body (2-4 речення)
- Для блоку "cta": heading, cta_text (2-4 слова), cta_href завжди "#contact"
- Для блоку "faq": heading і items — 2-3 пари питання/відповідь, релевантні бізнесу
- Для блоку "image": лише alt-текст, що описує зображення для цього бізнесу (image_url НЕ генеруй)
- Українською мовою, без markdown-розмітки в тексті
- Масив blocks має містити РІВНО ${typesToGenerate.length} елемент(и/ів) у тому самому порядку типів, що вказано вище`;

  const geminiBody = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
      responseSchema: BLOCK_RESPONSE_SCHEMA,
    },
  };

  let generated: { seo_title: string; seo_description: string; blocks: GeneratedBlock[] };
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(geminiBody),
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[sites-ai] Gemini error:", resp.status, errText.slice(0, 300));
      return json({ error: "AI тимчасово недоступний, спробуйте через хвилину" }, 503, corsHeaders);
    }

    interface GeminiResponse {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
    const data = (await resp.json()) as GeminiResponse;
    const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    try {
      generated = JSON.parse(rawText);
    } catch (parseErr) {
      console.error("[sites-ai] failed to parse Gemini JSON:", parseErr, rawText.slice(0, 300));
      return json({ error: "AI повернув невалідну відповідь, спробуйте ще раз" }, 502, corsHeaders);
    }

    if (!Array.isArray(generated.blocks)) {
      return json({ error: "AI повернув невалідну структуру, спробуйте ще раз" }, 502, corsHeaders);
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return json({ error: "AI не відповів вчасно, спробуйте ще раз" }, 504, corsHeaders);
    }
    console.error("[sites-ai] unexpected error:", err instanceof Error ? err.message : err);
    return json({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }

  // ── Мерджимо згенеровані блоки з існуючими за типом+позицією —
  // якщо на сторінці вже був конкретний блок (напр. image з
  // заповненим image_url), зберігаємо його непорожні поля, які AI
  // навмисно не генерує (image_url), і лише додаємо згенеровані.
  const existingBlocks = page.content?.blocks ?? [];
  const mergedBlocks: GeneratedBlock[] = generated.blocks.map((genBlock, i) => {
    const existing = existingBlocks[i] as GeneratedBlock | undefined;
    if (existing?.type === genBlock.type && genBlock.type === "image") {
      return { ...genBlock, image_url: (existing as { image_url?: string }).image_url } as GeneratedBlock;
    }
    return genBlock;
  });

  const updateRes = await updateRows(
    "project_pages",
    `id=eq.${encodeURIComponent(pageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      content: { blocks: mergedBlocks },
      seo_title: generated.seo_title?.slice(0, 200),
      seo_description: generated.seo_description?.slice(0, 500),
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  // Списуємо credit лише ПІСЛЯ успішного збереження — не карати
  // користувача кредитом за збій запису в БД. No-op для unlimited=true.
  const creditsRemaining = await deductAiCredits(organizationId, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);

  return json(
    {
      ok: true,
      content: { blocks: mergedBlocks },
      seo_title: generated.seo_title,
      seo_description: generated.seo_description,
      credits_remaining: creditsRemaining,
      unlimited: creditsCheck.unlimited,
    },
    200,
    corsHeaders
  );
}
