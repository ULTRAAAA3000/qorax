// ============================================================
// supabase.ts — минимальный клиент для записи в Supabase через
// его REST API (PostgREST), без полноценного supabase-js SDK
// (тяжёлый для Workers bundle size, нам нужен только insert).
// ============================================================

export interface SaveLeadParams {
  email: string | null;
  siteUrl: string;
  previewResults: Record<string, unknown>;
}

export async function saveAuditLead(
  params: SaveLeadParams,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/free_audit_leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        email: params.email,
        site_url: params.siteUrl,
        preview_results: params.previewResults,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Supabase insert failed: ${response.status} ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
