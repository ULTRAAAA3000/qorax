// ============================================================
// QORAX — Qorax Office: office_document_versions (Version History)
// ============================================================
// MODULE_ROADMAP.md, "Qorax Office" — "Стан реалізації", пункт
// "Version History" з повного переліку фіч. Той самий проведений
// патерн, що canvas_node_versions (0080, Creator History):
// append-only, insert лише worker'ом, select-only для звичайних
// учасників.
//
// maybeSnapshotVersion() — не окремий сервіс, викликається на
// початку кожного з трьох PATCH-хендлерів (handleDocUpdate/
// handleSheetUpdate/handleSlidesDeckUpdate) ДО застосування патчу —
// знімає стан "яким він був до цієї зміни". Throttle ~10 хв на
// документ — інакше 600мс-дебаунс автозбереження дав би сотні
// рядків за годину активного редагування.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow } from "./supabase";
import { requireOrgAccess } from "./orgAuth";

const SNAPSHOT_THROTTLE_MS = 10 * 60 * 1000; // 10 хвилин

export type OfficeDocType = "office_documents" | "office_sheets" | "office_slides";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

/**
 * Знімає версію ПОТОЧНОГО стану документа, якщо з моменту останнього
 * знімку минуло більше SNAPSHOT_THROTTLE_MS (або знімків ще не було
 * взагалі). Викликач передає dataColumn ("content"/"data"/"slides") —
 * та колонка, що містить сам вміст у doc_type-таблиці. Не кидає
 * виняток при помилці — Version History допоміжна фіча, не повинна
 * блокувати основне збереження документа.
 */
export async function maybeSnapshotVersion(params: {
  docType: OfficeDocType;
  docId: string;
  organizationId: string;
  dataColumn: "content" | "data" | "slides";
  userId?: string;
  env: Env;
}): Promise<void> {
  const { docType, docId, organizationId, dataColumn, userId, env } = params;
  try {
    const lastRes = await selectRows<{ created_at: string }>(
      "office_document_versions",
      `select=created_at&doc_type=eq.${encodeURIComponent(docType)}&doc_id=eq.${encodeURIComponent(docId)}&order=created_at.desc&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const lastAt = lastRes.data?.[0]?.created_at;
    if (lastAt && Date.now() - new Date(lastAt).getTime() < SNAPSHOT_THROTTLE_MS) return; // ще не минуло 10 хв

    const currentRes = await selectRows<{ title: string; [key: string]: unknown }>(
      docType,
      `select=title,${dataColumn}&id=eq.${encodeURIComponent(docId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const current = currentRes.data?.[0];
    if (!current) return; // документ щойно створений, ще немає що знімати

    await insertRow(
      "office_document_versions",
      {
        organization_id: organizationId,
        doc_type: docType,
        doc_id: docId,
        title: current.title,
        snapshot: current[dataColumn],
        created_by: userId ?? null,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (err) {
    console.error("[officeVersions] maybeSnapshotVersion failed:", err instanceof Error ? err.message : err);
  }
}

interface VersionRow {
  id: string;
  title: string;
  created_at: string;
}

// ── GET /api/office-versions?doc_type=...&doc_id=... ── список ────

export async function handleVersionsList(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const docType = url.searchParams.get("doc_type") as OfficeDocType | null;
  const docId = url.searchParams.get("doc_id");
  if (!docType || !docId) return json({ error: "doc_type і doc_id обов'язкові" }, 400, corsHeaders);

  const docOrgRes = await selectRows<{ organization_id: string }>(
    docType,
    `select=organization_id&id=eq.${encodeURIComponent(docId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const orgId = docOrgRes.data?.[0]?.organization_id;
  if (!orgId) return json({ error: "Документ не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<VersionRow>(
    "office_document_versions",
    `select=id,title,created_at&doc_type=eq.${encodeURIComponent(docType)}&doc_id=eq.${encodeURIComponent(docId)}&order=created_at.desc&limit=30`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ versions: res.data ?? [] }, 200, corsHeaders);
}

const DATA_COLUMN: Record<OfficeDocType, "content" | "data" | "slides"> = {
  office_documents: "content",
  office_sheets: "data",
  office_slides: "slides",
};

// ── POST /api/office-versions/:id/restore ── відновити версію ─────
//
// Відновлення САМЕ теж знімає версію "до відновлення" (той самий
// maybeSnapshotVersion, throttle діє і тут) — інакше відновлення
// старої версії могло б незворотно загубити щойно відкинуту, якщо
// throttle-вікно ще не минуло природним шляхом.

export async function handleVersionRestore(request: Request, env: Env, corsHeaders: Record<string, string>, versionId: string): Promise<Response> {
  const versionRes = await selectRows<{ organization_id: string; doc_type: OfficeDocType; doc_id: string; snapshot: unknown; title: string }>(
    "office_document_versions",
    `select=organization_id,doc_type,doc_id,snapshot,title&id=eq.${encodeURIComponent(versionId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const version = versionRes.data?.[0];
  if (!version) return json({ error: "Версію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, version.organization_id, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const dataColumn = DATA_COLUMN[version.doc_type];

  // Знімок поточного стану (того, що зараз буде замінено) — про запас.
  await maybeSnapshotVersion({
    docType: version.doc_type,
    docId: version.doc_id,
    organizationId: version.organization_id,
    dataColumn,
    userId: access.userId,
    env,
  });

  const patch: Record<string, unknown> = { [dataColumn]: version.snapshot, updated_at: new Date().toISOString() };

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${version.doc_type}?id=eq.${encodeURIComponent(version.doc_id)}&organization_id=eq.${encodeURIComponent(version.organization_id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    }
  );
  if (!res.ok) return json({ error: `Restore failed: ${res.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}
