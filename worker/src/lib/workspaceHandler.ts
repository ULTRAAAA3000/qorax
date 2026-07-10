// ============================================================
// workspaceHandler.ts — Qorax AI Workspace (хвиля 3, крок після Chat).
//
// EXECUTION_PLAN.md: 0049_qorax_ai_hub.sql описує ai_files, коментар
// у самій міграції каже "сам bucket і upload-flow — завдання окремого
// worker-кроку". 0051_ai_workspace_storage.sql створює приватний
// bucket 'ai-workspace-files'. Це — сам upload-flow.
//
// Рішення Артема: одразу авто-витягування тексту + AI-сумаризація
// через Gemini (extracted_summary заповнюється автоматично), 4 типи
// файлів одразу — PDF, CSV, зображення, DOCX.
//
// Стратегія екстракції за типом файлу:
// - PDF / зображення: Gemini має нативну підтримку document/image
//   understanding через inline_data — НЕ парсимо самі, віддаємо файл
//   напряму в Gemini з проханням summarize. Це простіше і надійніше
//   за самостійний PDF-parsing (pdf-parse використовує node:fs
//   специфічним чином, що ризиковано в Workers runtime).
// - CSV: звичайний текст, читаємо як є.
// - DOCX: це ZIP-архів з XML всередині (word/document.xml). Gemini
//   НЕ підтримує DOCX нативно через inline_data (спостережена помилка
//   "Unsupported MIME type" в офіційному форумі Google). Розпаковуємо
//   через fflate (чистий JS, без node:fs) + regex по <w:t> тегам —
//   легкий і надійний підхід, повноцінний OOXML-парсер тут над-
//   інженерія для потреб сумаризації.
//
// Ліміт розміру файлу: 5 MB (рішення Артема, ближче до звичайних
// документів/звітів, не 20 MB ліміту Gemini inline request).
// ============================================================

import { unzipSync, strFromU8 } from "fflate";
import { selectRows, insertRow } from "./supabase";
import type { Env } from "../types";
import { corsHeaders as sharedCorsHeaders } from "./cors";

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 25_000;
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB — узгоджено з 0051_ai_workspace_storage.sql

const ALLOWED_MIME_TYPES: Record<string, "pdf" | "csv" | "docx" | "image"> = {
  "application/pdf": "pdf",
  "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/png": "image",
  "image/jpeg": "image",
  "image/webp": "image",
};

const BUCKET = "ai-workspace-files";

interface FileRow {
  id: string;
  organization_id: string;
  thread_id: string | null;
  file_name: string;
  file_type: string;
  storage_path: string;
  extracted_summary: string | null;
  created_at: string;
}

// ─── POST /api/workspace/upload ────────────────────────────────

export async function handleWorkspaceUploadRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const authHeader = request.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "").trim();
    if (!jwt) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    const userId = ((await userResp.json()) as { id: string }).id;

    const formData = await request.formData();
    const file = formData.get("file");
    const threadId = formData.get("thread_id");

    // duck-typing замість `instanceof File` — глобальний тип File
    // недоступний у tsconfig воркера (lib: ES2022, без DOM), хоча
    // @cloudflare/workers-types надає сам конструктор у рантаймі.
    // Перевіряємо форму об'єкта замість типу.
    const isFileLike =
      file !== null &&
      typeof file === "object" &&
      "arrayBuffer" in file &&
      "type" in file &&
      "name" in file;

    if (!isFileLike) {
      return jsonResponse({ error: "Файл обов'язковий" }, 400, corsHeaders);
    }

    const uploadedFile = file as { arrayBuffer(): Promise<ArrayBuffer>; type: string; name: string; size: number };

    const fileType = ALLOWED_MIME_TYPES[uploadedFile.type];
    if (!fileType) {
      return jsonResponse(
        { error: `Непідтримуваний тип файлу: ${uploadedFile.type || "невідомий"}. Дозволено: PDF, CSV, DOCX, PNG/JPEG/WebP` },
        400,
        corsHeaders
      );
    }

    if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
      return jsonResponse({ error: "Файл завеликий (максимум 5 МБ)" }, 400, corsHeaders);
    }

    // Визначаємо organization_id користувача (перша/єдина організація —
    // той самий патерн, що resolveThread у chatHandler.ts для нового треду)
    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) {
      return jsonResponse({ error: "Організацію не знайдено" }, 404, corsHeaders);
    }

    const fileBytes = new Uint8Array(await uploadedFile.arrayBuffer());
    const fileId = crypto.randomUUID();
    const ext = uploadedFile.name.split(".").pop() ?? "bin";
    const storagePath = `${organizationId}/${fileId}.${ext}`;

    // ── Завантажуємо в Supabase Storage ──────────────────────
    const uploadResp = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${storagePath}`,
      {
        method: "POST",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": uploadedFile.type,
        },
        body: fileBytes,
      }
    );

    if (!uploadResp.ok) {
      const errText = await uploadResp.text();
      console.error("[workspace] storage upload failed:", uploadResp.status, errText.slice(0, 300));
      return jsonResponse({ error: "Не вдалося завантажити файл" }, 500, corsHeaders);
    }

    // ── Витягуємо summary (не блокуємо відповідь при помилці —
    // файл все одно зберігається, просто без summary) ──────────
    let extractedSummary: string | null = null;
    try {
      extractedSummary = await extractSummary(fileType, fileBytes, uploadedFile.name, env);
    } catch (err) {
      console.error("[workspace] summary extraction failed:", err instanceof Error ? err.message : err);
    }

    // ── Записуємо метадані в ai_files ────────────────────────
    const insertResult = await insertRow(
      "ai_files",
      {
        id: fileId,
        organization_id: organizationId,
        thread_id: typeof threadId === "string" && threadId ? threadId : null,
        file_name: uploadedFile.name,
        file_type: fileType,
        storage_path: storagePath,
        extracted_summary: extractedSummary,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!insertResult.ok) {
      console.error("[workspace] failed to save ai_files row:", insertResult.error);
      return jsonResponse({ error: "Файл завантажено, але не вдалося зберегти метадані" }, 500, corsHeaders);
    }

    return jsonResponse(
      {
        id: fileId,
        file_name: uploadedFile.name,
        file_type: fileType,
        extracted_summary: extractedSummary,
      },
      200,
      corsHeaders
    );
  } catch (err) {
    console.error("[workspace] upload unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── GET /api/workspace/files ───────────────────────────────────

export async function handleWorkspaceListRequest(
  request: Request,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const authHeader = request.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "").trim();
    if (!jwt) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    const userId = ((await userResp.json()) as { id: string }).id;

    const memberResult = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${encodeURIComponent(userId)}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const organizationId = memberResult.data[0]?.organization_id;
    if (!organizationId) return jsonResponse({ error: "Організацію не знайдено" }, 404, corsHeaders);

    const filesResult = await selectRows<FileRow>(
      "ai_files",
      `select=id,organization_id,thread_id,file_name,file_type,storage_path,extracted_summary,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );

    return jsonResponse({ files: filesResult.data }, 200, corsHeaders);
  } catch (err) {
    console.error("[workspace] list unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── DELETE /api/workspace/files/:id ────────────────────────────

export async function handleWorkspaceDeleteRequest(
  request: Request,
  fileId: string,
  env: Env,
  origin: string | null,
  prebuiltCors?: Record<string, string>
): Promise<Response> {
  const corsHeaders = prebuiltCors ?? sharedCorsHeaders(origin);

  try {
    const authHeader = request.headers.get("Authorization");
    const jwt = authHeader?.replace("Bearer ", "").trim();
    if (!jwt) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);

    const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!userResp.ok) return jsonResponse({ error: "Unauthorized" }, 401, corsHeaders);
    const userId = ((await userResp.json()) as { id: string }).id;

    const fileResult = await selectRows<FileRow>(
      "ai_files",
      `select=id,organization_id,storage_path&id=eq.${encodeURIComponent(fileId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const file = fileResult.data[0];
    if (!file) return jsonResponse({ error: "Файл не знайдено" }, 404, corsHeaders);

    const memberCheck = await selectRows<{ organization_id: string; role: string }>(
      "organization_members",
      `select=organization_id,role&organization_id=eq.${encodeURIComponent(file.organization_id)}&user_id=eq.${encodeURIComponent(userId)}&role=in.(owner,admin,editor)`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!memberCheck.data[0]) return jsonResponse({ error: "Немає доступу" }, 403, corsHeaders);

    // Видаляємо з Storage (не блокуємо якщо не вдалось — метадані все
    // одно приберемо, щоб не лишати "мертвий" запис в UI)
    const deleteStorageResp = await fetch(
      `${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${file.storage_path}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!deleteStorageResp.ok) {
      console.error("[workspace] storage delete failed:", deleteStorageResp.status);
    }

    const deleteRowResp = await fetch(
      `${env.SUPABASE_URL}/rest/v1/ai_files?id=eq.${encodeURIComponent(fileId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        },
      }
    );
    if (!deleteRowResp.ok) {
      return jsonResponse({ error: "Не вдалося видалити запис" }, 500, corsHeaders);
    }

    return jsonResponse({ ok: true }, 200, corsHeaders);
  } catch (err) {
    console.error("[workspace] delete unhandled error:", err instanceof Error ? err.message : err);
    return jsonResponse({ error: "Внутрішня помилка сервера" }, 500, corsHeaders);
  }
}

// ─── Витягування summary за типом файлу ─────────────────────────

async function extractSummary(
  fileType: "pdf" | "csv" | "docx" | "image",
  bytes: Uint8Array,
  fileName: string,
  env: Env
): Promise<string> {
  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return "AI не налаштований — summary недоступне";

  if (fileType === "csv") {
    // CSV — звичайний текст, передаємо як є (обрізаємо якщо величезний,
    // щоб не роздувати запит — 5 MB ліміт файлу все одно набагато
    // менший за практичний контекст Gemini, але економимо токени)
    const text = new TextDecoder().decode(bytes).slice(0, 50_000);
    return await summarizeText(text, "CSV-файл з даними", apiKey);
  }

  if (fileType === "docx") {
    const text = extractDocxText(bytes);
    if (!text.trim()) return "Не вдалося витягнути текст із документа";
    return await summarizeText(text, "Word-документ", apiKey);
  }

  // PDF та зображення — нативний inline_data, Gemini аналізує сам файл
  // (не витягуємо текст самостійно, roadmap: Document understanding
  // дозволяє summarize напряму, включно з таблицями/діаграмами)
  const mimeType = fileType === "pdf" ? "application/pdf" : guessImageMime(fileName);
  return await summarizeInlineFile(bytes, mimeType, apiKey);
}

async function summarizeText(text: string, kind: string, apiKey: string): Promise<string> {
  const prompt = `Це ${kind}. Дай стислий підсумок (3-5 речень) — що це за документ і які ключові дані/висновки він містить. Відповідай українською.\n\n${text}`;

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
  };

  return callGemini(body, apiKey);
}

async function summarizeInlineFile(bytes: Uint8Array, mimeType: string, apiKey: string): Promise<string> {
  const base64 = bytesToBase64(bytes);

  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: "Дай стислий підсумок (3-5 речень) цього документа/зображення — що це і які ключові дані/висновки він містить. Відповідай українською." },
        ],
      },
    ],
    generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
  };

  return callGemini(body, apiKey);
}

async function callGemini(body: unknown, apiKey: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  try {
    const resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(body),
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[workspace] Gemini error:", resp.status, errText.slice(0, 300));
      return "Не вдалося згенерувати summary (AI тимчасово недоступний)";
    }

    interface GeminiResponse {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    }
    const data = (await resp.json()) as GeminiResponse;
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim() || "Не вдалося отримати відповідь";
  } catch (err) {
    clearTimeout(timeout);
    if (err instanceof Error && err.name === "AbortError") {
      return "Не вдалося згенерувати summary (перевищено час очікування)";
    }
    throw err;
  }
}

// ─── DOCX: ZIP-розпаковка + regex по <w:t> тегам ────────────────
// DOCX = ZIP-архів. Нас цікавить лише word/document.xml — там весь
// текстовий вміст у тегах <w:t>. Повноцінний OOXML-парсер (стилі,
// таблиці, списки) — над-інженерія для потреб сумаризації; досить
// витягнути "голий" текст абзаців.

function extractDocxText(bytes: Uint8Array): string {
  const unzipped = unzipSync(bytes, {
    filter: (file) => file.name === "word/document.xml",
  });

  const documentXml = unzipped["word/document.xml"];
  if (!documentXml) return "";

  const xml = strFromU8(documentXml);
  const paragraphs: string[] = [];
  const paraRegex = /<w:p[^>]*?>([\s\S]*?)<\/w:p>/g;
  const textRegex = /<w:t[^>]*?>([^<]*)<\/w:t>/g;

  let paraMatch: RegExpExecArray | null;
  while ((paraMatch = paraRegex.exec(xml)) !== null) {
    const inner = paraMatch[1];
    const parts: string[] = [];
    let textMatch: RegExpExecArray | null;
    textRegex.lastIndex = 0;
    while ((textMatch = textRegex.exec(inner)) !== null) {
      parts.push(textMatch[1]);
    }
    const paragraphText = parts.join("").trim();
    if (paragraphText) paragraphs.push(paragraphText);
  }

  return paragraphs.join("\n\n").slice(0, 50_000); // той самий ліміт, що CSV
}

// ─── Helpers ─────────────────────────────────────────────────

function guessImageMime(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  return "image/jpeg";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function jsonResponse(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
