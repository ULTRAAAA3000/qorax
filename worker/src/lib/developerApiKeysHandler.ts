// ============================================================
// developerApiKeysHandler.ts — управління API-ключами Developer
// API (Qorax SEO Platform, MVP) з Dashboard: список, створення,
// відкликання. Авторизація — звичайна Supabase-сесія користувача
// (не плутати з самим Developer API, worker/src/lib/
// developerApiAuth.ts, де авторизація через сам API-ключ).
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { corsHeaders } from "./cors";

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

interface ApiKeyRow {
  id: string;
  organization_id: string;
  key_prefix: string;
  label: string;
  requests_limit: number;
  requests_used: number;
  period_start: string;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

async function getAuthedUser(request: Request, env: Env): Promise<{ id: string } | null> {
  const jwt = request.headers.get("Authorization")?.replace("Bearer ", "").trim();
  if (!jwt) return null;
  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${jwt}` },
  });
  if (!resp.ok) return null;
  return await resp.json();
}

async function getUserOrganizationId(userId: string, env: Env): Promise<string | null> {
  const result = await selectRows<{ organization_id: string }>(
    "organization_members",
    `select=organization_id&user_id=eq.${userId}&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return result.data?.[0]?.organization_id ?? null;
}

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Генерує новий ключ формату qrx_<32 hex символи> — достатньо ентропії (128 біт) для MVP. */
function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const hex = Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `qrx_${hex}`;
}

/** GET — список ключів організації (без самого ключа, лише key_prefix). POST — створити новий. */
export async function handleDeveloperApiKeys(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Необхідна авторизація" }, 401, origin);

  const organizationId = await getUserOrganizationId(user.id, env);
  if (!organizationId) return json({ error: "Організацію не знайдено" }, 404, origin);

  if (request.method === "GET") {
    const result = await selectRows<ApiKeyRow>(
      "developer_api_keys",
      `select=id,key_prefix,label,requests_limit,requests_used,period_start,revoked,created_at,last_used_at&organization_id=eq.${organizationId}&order=created_at.desc`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    return json({ keys: result.data ?? [] }, 200, origin);
  }

  // POST — створення нового ключа. Сирий ключ повертається ОДИН РАЗ
  // у відповіді на створення — далі відновити його неможливо (лише
  // згенерувати новий), той самий принцип, що GitHub PAT / Stripe
  // secret key.
  const rawKey = generateApiKey();
  const keyHash = await sha256Hex(rawKey);
  const keyPrefix = rawKey.slice(0, 12); // "qrx_" + перші 8 hex символів

  const created = await insertRow(
    "developer_api_keys",
    { organization_id: organizationId, key_hash: keyHash, key_prefix: keyPrefix },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!created.ok) return json({ error: created.error ?? "Не вдалося створити ключ" }, 500, origin);

  return json({ apiKey: rawKey, keyPrefix }, 201, origin);
}

/** DELETE /api/developer/keys/:id — відкликає ключ (не видаляє рядок, лише revoked=true). */
export async function handleDeveloperApiKeyRevoke(
  keyId: string,
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  const user = await getAuthedUser(request, env);
  if (!user) return json({ error: "Необхідна авторизація" }, 401, origin);

  const organizationId = await getUserOrganizationId(user.id, env);
  if (!organizationId) return json({ error: "Організацію не знайдено" }, 404, origin);

  // Фільтр по organization_id у WHERE — гарантія, що організація не
  // зможе відкликати чужий ключ, підставивши довільний id в URL.
  const result = await updateRows(
    "developer_api_keys",
    `id=eq.${encodeURIComponent(keyId)}&organization_id=eq.${organizationId}`,
    { revoked: true },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!result.ok) return json({ error: result.error ?? "Не вдалося відкликати ключ" }, 500, origin);

  return json({ ok: true }, 200, origin);
}
