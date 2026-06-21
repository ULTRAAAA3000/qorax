// ============================================================
// supabase.ts — минимальный клиент для записи в Supabase через
// его REST API (PostgREST), без полноценного supabase-js SDK
// (тяжёлый для Workers bundle size, нам нужен только insert/upsert/select).
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

// ------------------------------------------------------------
// Generic PostgREST helpers — для cron monitoring задач, которые
// читают/пишут в несколько разных таблиц (sites, uptime_checks,
// ssl_certificates, speed_checks и т.д.) без отдельной функции
// на каждую таблицу.
// ------------------------------------------------------------

function authHeaders(serviceRoleKey: string): Record<string, string> {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
  };
}

/** SELECT через PostgREST. query — это часть строки после "?", например "select=id,url&monitoring_enabled=eq.true". */
export async function selectRows<T = Record<string, unknown>>(
  table: string,
  query: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; data: T[]; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
      headers: { ...authHeaders(serviceRoleKey), "Content-Type": "application/json" },
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, data: [], error: `Select failed: ${response.status} ${text}` };
    }

    const data = (await response.json()) as T[];
    return { ok: true, data };
  } catch (err) {
    return { ok: false, data: [], error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** INSERT (append) — для time-series таблиц типа uptime_checks/speed_checks. */
export async function insertRow(
  table: string,
  row: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...authHeaders(serviceRoleKey),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Insert into ${table} failed: ${response.status} ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/**
 * UPSERT по конфликтующей колонке — для "текущее состояние" таблиц типа
 * ssl_certificates/domain_registrations, у которых одна запись на site_id
 * (unique constraint), а не временной ряд.
 */
export async function upsertRow(
  table: string,
  row: Record<string, unknown>,
  conflictColumn: string,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/${table}?on_conflict=${conflictColumn}`,
      {
        method: "POST",
        headers: {
          ...authHeaders(serviceRoleKey),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(row),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Upsert into ${table} failed: ${response.status} ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

/** PATCH — частичное обновление строк, подходящих под фильтр (например, закрытие инцидента). */
export async function updateRows(
  table: string,
  filterQuery: string,
  patch: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${filterQuery}`, {
      method: "PATCH",
      headers: {
        ...authHeaders(serviceRoleKey),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(patch),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Update ${table} failed: ${response.status} ${text}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}
