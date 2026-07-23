// ============================================================
// developerApiAuth.ts — автентифікація та rate-limit для
// публічної Qorax SEO Platform (Developer API), MVP.
//
// Узгоджено з Артемом: фундамент лише для SEO Audit API —
// перевірка API-ключа + місячний ліміт запитів на ключ. Білінг,
// декілька тарифних планів, SDK — не цей прохід (requests_limit
// зараз фіксований default=1000 з міграції 0084, змінюється вручну
// через SQL до появи UI/білінгу).
// ============================================================

import { selectRows, updateRowsReturning, insertRow } from "./supabase";

export interface ApiKeyValidation {
  ok: boolean;
  /** Присутнє лише якщо ok=true. */
  apiKeyId?: string;
  organizationId?: string;
  /** HTTP-статус і повідомлення для відповіді, коли ok=false. */
  status?: number;
  error?: string;
}

interface ApiKeyRow {
  id: string;
  organization_id: string;
  requests_limit: number;
  requests_used: number;
  period_start: string;
  revoked: boolean;
}

/**
 * SHA-256 хеш ключа через Web Crypto API (доступний у Cloudflare
 * Workers runtime без додаткових залежностей). Той самий хеш, що
 * генерується при створенні ключа в developerApiKeysHandler.ts —
 * порівнюємо ХЕШ, ніколи не зберігаємо і не логуємо сирий ключ.
 */
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Перевіряє заголовок Authorization: Bearer qrx_xxx, атомарно
 * інкрементує requests_used (щоб уникнути гонки при паралельних
 * запитах з одним ключем — той самий принцип, що
 * updateRowsReturning вже застосовує для ідемпотентності webhook'ів
 * деінде в проєкті). Якщо ліміт вичерпано — інкремент не
 * виконується, повертається ok:false.
 *
 * Скидання period_start/requests_used на новий місяць — окрема
 * nightly cron-задача (не цей прохід), тут лише читання поточного
 * стану.
 */
export async function validateAndConsumeApiKey(
  request: Request,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<ApiKeyValidation> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Відсутній або невірний заголовок Authorization: Bearer <ключ>" };
  }

  const rawKey = authHeader.slice("Bearer ".length).trim();
  if (!rawKey || !rawKey.startsWith("qrx_")) {
    return { ok: false, status: 401, error: "Невірний формат API-ключа" };
  }

  const keyHash = await sha256Hex(rawKey);

  const result = await selectRows<ApiKeyRow>(
    "developer_api_keys",
    `select=id,organization_id,requests_limit,requests_used,period_start,revoked&key_hash=eq.${encodeURIComponent(keyHash)}`,
    supabaseUrl,
    serviceRoleKey
  );

  const row = result.data?.[0];
  if (!result.ok || !row) {
    return { ok: false, status: 401, error: "API-ключ не знайдено" };
  }
  if (row.revoked) {
    return { ok: false, status: 401, error: "API-ключ відкликано" };
  }
  if (row.requests_used >= row.requests_limit) {
    return { ok: false, status: 429, error: "Місячний ліміт запитів вичерпано" };
  }

  // Атомарний інкремент з guard'ом по поточному requests_used —
  // якщо два запити прийшли одночасно на останній дозволений виклик,
  // лише один з них реально пройде цю умову в WHERE-фільтрі PostgREST.
  const increment = await updateRowsReturning<ApiKeyRow>(
    "developer_api_keys",
    `id=eq.${encodeURIComponent(row.id)}&requests_used=eq.${row.requests_used}`,
    { requests_used: row.requests_used + 1, last_used_at: new Date().toISOString() },
    supabaseUrl,
    serviceRoleKey
  );

  if (!increment.ok || !increment.data || increment.data.length === 0) {
    // Гонка: хтось інший щойно інкрементував той самий рядок першим.
    // Для MVP просто відхиляємо запит з проханням повторити — рідкісний
    // випадок (два одночасні запити одним ключем на межі ліміту).
    return { ok: false, status: 429, error: "Забагато одночасних запитів, спробуйте ще раз" };
  }

  return { ok: true, apiKeyId: row.id, organizationId: row.organization_id };
}

/** Легкий audit-лог виклику — не критичний для rate-limit, помилки глушимо. */
export async function logApiRequest(
  apiKeyId: string,
  endpoint: string,
  targetUrl: string | null,
  statusCode: number,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<void> {
  try {
    await insertRow(
      "developer_api_requests",
      { api_key_id: apiKeyId, endpoint, target_url: targetUrl, status_code: statusCode },
      supabaseUrl,
      serviceRoleKey
    );
  } catch {
    // Логування не повинно ламати відповідь користувачу API.
  }
}
