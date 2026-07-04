import { createClient } from "@/app/lib/supabase/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T = any>(p: PromiseLike<{ data: T[] | null; error?: unknown }>): Promise<T[]> {
  try {
    const r = await p;
    // Supabase returns { data, error } — ignore errors gracefully
    if (!r || !r.data) return [];
    return r.data;
  } catch {
    return [];
  }
}

export async function getSiteDetailData(id: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirectToLogin: true as const };

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name, monitoring_enabled, created_at")
    .eq("id", id)
    .single();

  if (!site) return { notFound: true as const };

  // Окремий запит для status_page полів (міграція 0025/0027 може бути ще не запущена)
  let statusPageData: { status_page_enabled?: boolean; status_page_slug?: string | null } | null = null;
  try {
    const spRes = await supabase
      .from("sites")
      .select("status_page_enabled, status_page_slug")
      .eq("id", id)
      .maybeSingle();
    statusPageData = spRes.data ?? null;
  } catch { /* columns not yet migrated */ }

  // Окремий запит для порогу алертів (міграція 0030 може бути ще не запущена)
  let alertThresholdMs: number | null = null;
  try {
    const atRes = await supabase
      .from("sites")
      .select("response_time_alert_threshold_ms")
      .eq("id", id)
      .maybeSingle();
    alertThresholdMs = atRes.data?.response_time_alert_threshold_ms ?? null;
  } catch { /* column not yet migrated */ }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const orgId = membership?.organization_id ?? "";

  const { data: subData } = orgId
    ? await supabase
        .from("subscriptions")
        .select("status, plans(code)")
        .eq("organization_id", orgId)
        .in("status", ["active", "trialing"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planCode = (subData?.plans as any)?.code as string | undefined;
  const canUseGsc = ["growth", "agency", "admin", "trial"].includes(planCode ?? "");

  let hostname = site.url;
  try { hostname = new URL(site.url).hostname; } catch { /* keep raw */ }

  let uptimeChecks: {status:string;response_time_ms:number|null;checked_at:string}[] = [];
  let openIncidents: {id:string;started_at:string;resolved_at:string|null}[] = [];
  let speedChecks: {load_time_ms:number;checked_at:string}[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cwvChecks: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sslArr: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let aiInsights: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let reports: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let seoAuditArr: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sitemapAuditArr: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let competitors: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let competitorChanges: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let brokenLinks: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let historyIncidents: any[] = [];

  try {
    [
    uptimeChecks, openIncidents, speedChecks, cwvChecks, sslArr,
    aiInsights, reports, seoAuditArr, sitemapAuditArr, competitors,
    competitorChanges, brokenLinks, historyIncidents,
    ] = await Promise.all([
    safe(supabase.from("uptime_checks").select("status, response_time_ms, checked_at").eq("site_id", id).order("checked_at", { ascending: false }).limit(288)),
    safe(supabase.from("uptime_incidents").select("id, started_at, resolved_at").eq("site_id", id).is("resolved_at", null).limit(1)),
    safe(supabase.from("speed_checks").select("load_time_ms, checked_at").eq("site_id", id).order("checked_at", { ascending: false }).limit(30)),
    safe(supabase.from("core_web_vitals_checks").select("strategy, lcp_ms, inp_ms, cls_score, performance_score, checked_at").eq("site_id", id).order("checked_at", { ascending: false }).limit(4)),
    safe(supabase.from("ssl_certificates").select("days_until_expiry, last_checked_at").eq("site_id", id).limit(1)),
    safe(supabase.from("ai_insights").select("id, severity, problem_summary, plain_explanation, estimated_monthly_loss_usd, recommendation, generated_at").eq("site_id", id).eq("is_resolved", false).order("generated_at", { ascending: false }).limit(5)),
    safe(supabase.from("reports").select("id, report_type, period_start, pdf_url, created_at").eq("site_id", id).eq("status", "ready").order("created_at", { ascending: false }).limit(6)),
    safe(supabase.from("page_seo_audits").select("title, title_length, meta_description, meta_description_length, has_h1, h1_count, has_schema_markup, schema_types, issues, checked_at").eq("site_id", id).order("checked_at", { ascending: false }).limit(1)),
    safe(supabase.from("sitemap_audits").select("sitemap_found, urls_in_sitemap, robots_found, robots_blocks_important_pages, checked_at").eq("site_id", id).order("checked_at", { ascending: false }).limit(1)),
    safe(supabase.from("competitor_sites").select("id, url, display_name, last_change_at").eq("site_id", id).limit(5)),
    safe(supabase.from("competitor_changes").select("detected_at, competitor_id").eq("site_id", id).order("detected_at", { ascending: false }).limit(10)),
    safe(supabase.from("broken_links").select("id, broken_url, http_status_code, first_found_at").eq("site_id", id).eq("status", "broken").order("first_found_at", { ascending: false }).limit(20)),
    safe(supabase.from("uptime_incidents").select("id, started_at, resolved_at").eq("site_id", id).order("started_at", { ascending: false }).limit(30)),
    ]);
  } catch (e) {
    console.error("Site page DB error:", e);
  }

  const ssl = sslArr[0] ?? null;
  const seoAudit = seoAuditArr[0] ?? null;
  const sitemapAudit = sitemapAuditArr[0] ?? null;
  const isUp = openIncidents.length === 0;
  const latestSpeed = speedChecks[0] ?? null;
  const mobileCwv = cwvChecks.find((c) => c.strategy === "mobile") ?? null;
  const desktopCwv = cwvChecks.find((c) => c.strategy === "desktop") ?? null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

  const uptimePct = uptimeChecks.length
    ? ((uptimeChecks.filter(c => c.status === "up").length / uptimeChecks.length) * 100).toFixed(1)
    : null;
  const sslOk = ssl && (ssl.days_until_expiry === 999 || (ssl.days_until_expiry ?? 0) > 0);
  const seoIssueCount = (() => {
    try {
      const raw = seoAudit?.issues;
      const list = Array.isArray(raw) ? raw : JSON.parse(typeof raw === "string" ? raw : "[]");
      return list.length;
    } catch { return 0; }
  })();

  return {
    site, hostname, accessToken, canUseGsc, statusPageData, alertThresholdMs,
    uptimeChecks, openIncidents, speedChecks, cwvChecks, ssl,
    aiInsights, reports, seoAudit, sitemapAudit, competitors,
    competitorChanges, brokenLinks, historyIncidents,
    isUp, latestSpeed, mobileCwv, desktopCwv,
    supabaseUrl, supabaseAnonKey, workerUrl,
    uptimePct, sslOk, seoIssueCount,
  };
}

export type SiteDetailData = Awaited<ReturnType<typeof getSiteDetailData>>;
