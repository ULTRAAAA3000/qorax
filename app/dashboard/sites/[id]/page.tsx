import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Activity, Zap, Shield, AlertTriangle, CheckCircle,
  Clock, ExternalLink, ChevronRight, Sparkles,
  FileText, Search, Eye, ArrowLeft, Code, TrendingUp,
} from "lucide-react";
import { ReportButton } from "./ReportButton";
import { LiveUptimePanel } from "./LiveUptimePanel";
import { QoraxusChat } from "./QoraxusChat";
import { GscPanel } from "./GscPanel";
import { RefreshSpeedButton } from "./RefreshSpeedButton";
import { MultiUrlPanel } from "./MultiUrlPanel";
import { FormMonitorPanel } from "./FormMonitorPanel";
import { SpeedHeatmap } from "./SpeedHeatmap";
import { StatusPageSection } from "./StatusPageSection";
import { UptimeBadgeSection } from "./UptimeBadgeSection";
import { IncidentTimeline } from "./IncidentTimeline";

export const dynamic = "force-dynamic";
export const metadata = { title: "Моніторинг сайту — Qorax" };

function scoreColor(score: number | null): string {
  if (score === null) return "var(--text-tertiary)";
  if (score >= 90) return "var(--lime)";
  if (score >= 50) return "#F5A623";
  return "#F5675A";
}
function fmtMs(ms: number | null) {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
}
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("uk-UA", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

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

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name, monitoring_enabled, created_at")
    .eq("id", id)
    .single();

  if (!site) notFound();

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
    safe(supabase.from("ai_insights").select("severity, problem_summary, plain_explanation, estimated_monthly_loss_usd, recommendation, generated_at").eq("site_id", id).eq("is_resolved", false).order("generated_at", { ascending: false }).limit(5)),
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

  const navItems = [
    { id: "uptime",      label: "Uptime",          icon: <Activity size={14} />,    badge: isUp ? "ОК" : "DOWN", badgeRed: !isUp },
    { id: "speed",       label: "Швидкість",        icon: <TrendingUp size={14} />,  badge: latestSpeed ? fmtMs(latestSpeed.load_time_ms) : undefined },
    { id: "heatmap",     label: "Heatmap",          icon: <Clock size={14} /> },
    { id: "pagespeed",   label: "PageSpeed",        icon: <Zap size={14} />,         badge: mobileCwv?.performance_score != null ? String(mobileCwv.performance_score) : undefined },
    { id: "ai",          label: "AI Insights",      icon: <Sparkles size={14} />,    badge: aiInsights.length ? String(aiInsights.length) : undefined, badgeRed: aiInsights.some(i => i.severity === "critical") },
    { id: "seo",         label: "SEO аудит",        icon: <Search size={14} />,      badge: seoIssueCount > 0 ? String(seoIssueCount) : undefined, badgeRed: seoIssueCount > 0 },
    { id: "gsc",         label: "Search Console",   icon: <Search size={14} /> },
    { id: "links",       label: "Биті посилання",   icon: <AlertTriangle size={14} />, badge: brokenLinks.length ? String(brokenLinks.length) : undefined, badgeRed: true },
    { id: "ssl",         label: "SSL",              icon: <Shield size={14} />,       badge: sslOk ? "OK" : undefined },
    { id: "competitors", label: "Конкуренти",       icon: <Eye size={14} />,          badge: competitorChanges.length ? "Зміни" : undefined, badgeRed: competitorChanges.length > 0 },
    { id: "multiurl",    label: "Мульті-URL",       icon: <TrendingUp size={14} /> },
    { id: "forms",       label: "Форми",            icon: <CheckCircle size={14} /> },
    { id: "reports",     label: "PDF звіти",        icon: <FileText size={14} />,     badge: reports.length ? String(reports.length) : undefined },
    { id: "status",      label: "Сторінка статусу", icon: <Eye size={14} /> },
    { id: "badge",       label: "Uptime Badge",     icon: <Code size={14} /> },
  ];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Topbar ── */}
      <header className="sticky top-0 z-40"
        style={{
          background: "rgba(12,17,29,0.92)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
        <div className="h-14 flex items-center justify-between px-5 gap-4" style={{ maxWidth: "100%" }}>
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard"><QoraxLogo size="sm" /></Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <Link href="/dashboard" className="flex items-center gap-1.5 text-sm transition-colors"
              style={{ color: "var(--text-tertiary)" }}>
              <ArrowLeft size={13} /> Сайти
            </Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <span className="text-sm font-medium truncate max-w-[160px]">{site.display_name}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a href={site.url} target="_blank" rel="noopener noreferrer"
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ color: "var(--text-tertiary)", border: "1px solid rgba(255,255,255,0.07)" }}>
              <ExternalLink size={13} />
            </a>
            <ReportButton siteId={site.id} />
          </div>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>

        {/* ── Sidebar ── */}
        <aside className="hidden lg:flex flex-col shrink-0 sticky top-14"
          style={{
            width: 224,
            height: "calc(100vh - 56px)",
            background: "rgba(255,255,255,0.015)",
            borderRight: "1px solid rgba(255,255,255,0.06)",
            overflowY: "auto",
          }}>

          {/* Site identity */}
          <div className="px-4 py-5 border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="relative shrink-0">
                <div className="h-8 w-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: isUp ? "rgba(214,255,63,0.08)" : "rgba(245,103,90,0.08)",
                    border: `1px solid ${isUp ? "rgba(214,255,63,0.2)" : "rgba(245,103,90,0.2)"}`,
                  }}>
                  <Activity size={14} style={{ color: isUp ? "var(--lime)" : "#F5675A" }} />
                </div>
                <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                  style={{ background: isUp ? "var(--lime)" : "#F5675A" }} />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate leading-tight">{site.display_name}</p>
                <p className="text-[10px] font-mono truncate" style={{ color: "var(--text-tertiary)" }}>{hostname}</p>
              </div>
            </div>

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-1.5">
              <KpiTile label="Uptime" value={uptimePct ? `${uptimePct}%` : "—"} ok={(parseFloat(uptimePct ?? "0")) >= 99} />
              <KpiTile label="Швидкість" value={fmtMs(latestSpeed?.load_time_ms ?? null)} ok={(latestSpeed?.load_time_ms ?? 9999) <= 1500} />
              <KpiTile label="SSL" value={sslOk ? "OK" : "—"} ok={!!sslOk} />
            </div>
          </div>

          {/* Nav */}
          <nav className="px-2 py-3 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-widest px-2 mb-2"
              style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>Моніторинг</p>
            {navItems.slice(0, 4).map(item => (
              <NavLink key={item.id} href={`#${item.id}`} label={item.label} icon={item.icon}
                badge={item.badge} badgeRed={item.badgeRed} />
            ))}

            <p className="text-[10px] font-medium uppercase tracking-widest px-2 mt-4 mb-2"
              style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>SEO & Аналітика</p>
            {navItems.slice(4, 7).map(item => (
              <NavLink key={item.id} href={`#${item.id}`} label={item.label} icon={item.icon}
                badge={item.badge} badgeRed={item.badgeRed} />
            ))}

            <p className="text-[10px] font-medium uppercase tracking-widest px-2 mt-4 mb-2"
              style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>Безпека & Інше</p>
            {navItems.slice(7).map(item => (
              <NavLink key={item.id} href={`#${item.id}`} label={item.label} icon={item.icon}
                badge={item.badge} badgeRed={item.badgeRed} />
            ))}
          </nav>
        </aside>

        {/* ── Main content ── */}
        <main className="flex-1 min-w-0 px-5 sm:px-8 py-6 space-y-4" style={{ maxWidth: 880 }}>

          {/* ── Uptime ── */}
          <Section id="uptime" icon={<Activity size={14} />} title="Живий моніторинг">
            <LiveUptimePanel
              siteId={site.id}
              initialChecks={uptimeChecks}
              initialIsUp={isUp}
              supabaseUrl={supabaseUrl}
              supabaseAnonKey={supabaseAnonKey}
            />
          </Section>

          {/* ── Incident Timeline ── */}
          {historyIncidents.length > 0 && (
            <Section id="incidents" icon={<Clock size={14} />} title="Історія інцидентів"
              badge={`${historyIncidents.length} за 30 днів`} badgeRed>
              <IncidentTimeline incidents={historyIncidents} isUp={isUp} />
            </Section>
          )}

          {/* ── Speed line chart ── */}
          <Section
            id="speed"
            icon={<TrendingUp size={14} />}
            title="Час відповіді"
            badge={latestSpeed ? fmtMs(latestSpeed.load_time_ms) : undefined}
            action={
              <RefreshSpeedButton
                siteId={site.id}
                accessToken={accessToken}
                workerUrl={workerUrl}
              />
            }
          >
            <SpeedLineChart checks={speedChecks} />
          </Section>

          {/* ── Speed Heatmap ── */}
          <Section id="heatmap" icon={<Clock size={14} />} title="Heatmap швидкості">
            <SpeedHeatmap checks={speedChecks} />
          </Section>

          {/* ── PageSpeed ── */}
          <Section
            id="pagespeed"
            icon={<Zap size={14} />}
            title="PageSpeed Insights"
            action={
              <RefreshSpeedButton
                siteId={site.id}
                accessToken={accessToken}
                workerUrl={workerUrl}
              />
            }
          >
            {mobileCwv || desktopCwv ? (
              <div className="grid sm:grid-cols-2 gap-4">
                {mobileCwv && <CwvBlock label="Мобільний" data={mobileCwv} />}
                {desktopCwv && <CwvBlock label="Десктоп" data={desktopCwv} />}
              </div>
            ) : (
              <EmptySlot text="Натисни Оновити щоб отримати PageSpeed дані. Щоденний скан — о 3:00." />
            )}
          </Section>

          {/* ── AI ── */}
          <Section id="ai" icon={<Sparkles size={14} />} title="AI Revenue Impact" accent="lime">
            {aiInsights.length > 0 ? (
              <div className="space-y-3">
                {aiInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
              </div>
            ) : (
              <EmptySlot text="AI-інсайти з'являться після першого повного сканування" />
            )}
          </Section>

          {/* ── SEO ── */}
          <Section
            id="seo"
            icon={<Search size={14} />}
            title="SEO аудит"
            badge={seoAudit ? fmtDate(seoAudit.checked_at) : undefined}
          >
            {seoAudit ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <SeoCell label="Title" length={seoAudit.title_length} min={30} max={60} exists={!!seoAudit.title} />
                  <SeoCell label="Description" length={seoAudit.meta_description_length} min={70} max={160} exists={!!seoAudit.meta_description} />
                  <SeoCheckCell label="H1" ok={seoAudit.has_h1 && seoAudit.h1_count === 1} warn={seoAudit.has_h1 && seoAudit.h1_count > 1} value={seoAudit.has_h1 ? `${seoAudit.h1_count} шт.` : "Немає"} />
                  <SeoCheckCell label="Schema" ok={seoAudit.has_schema_markup} warn={false} value={seoAudit.has_schema_markup ? "OK" : "Немає"} />
                </div>
                {(() => {
                  let issueList: string[] = [];
                  try {
                    const raw = seoAudit.issues;
                    issueList = Array.isArray(raw) ? raw : JSON.parse(typeof raw === "string" ? raw : "[]");
                  } catch { issueList = []; }
                  return issueList.length > 0 ? (
                    <div className="space-y-2">
                      {issueList.map((issue: string, i: number) => (
                        <div key={i} className="flex items-start gap-2.5 rounded-xl px-4 py-3"
                          style={{ background: "rgba(245,103,90,0.05)", border: "1px solid rgba(245,103,90,0.15)" }}>
                          <AlertTriangle size={12} style={{ color: "#F5675A", flexShrink: 0, marginTop: 2 }} />
                          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{issue}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                      style={{ background: "rgba(214,255,63,0.05)", border: "1px solid rgba(214,255,63,0.12)" }}>
                      <CheckCircle size={13} style={{ color: "var(--lime)" }} />
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>SEO мета-теги в нормі</p>
                    </div>
                  );
                })()}
                {sitemapAudit && (
                  <div className="grid grid-cols-2 gap-2.5">
                    <SitemapCell label="sitemap.xml"
                      found={sitemapAudit.sitemap_found}
                      value={!sitemapAudit.sitemap_found ? "Не знайдено" : sitemapAudit.urls_in_sitemap != null ? `${sitemapAudit.urls_in_sitemap} URL` : "Знайдено"}
                      danger={!sitemapAudit.sitemap_found} />
                    <SitemapCell label="robots.txt"
                      found={sitemapAudit.robots_found && !sitemapAudit.robots_blocks_important_pages}
                      value={!sitemapAudit.robots_found ? "Не знайдено" : sitemapAudit.robots_blocks_important_pages ? "Блокує індексацію" : "OK"}
                      danger={sitemapAudit.robots_blocks_important_pages} />
                  </div>
                )}
              </div>
            ) : (
              <EmptySlot text="SEO аудит запускається щодня о 3:00" />
            )}
          </Section>

          {/* ── GSC ── */}
          <Section id="gsc" icon={<Search size={14} />} title="Google Search Console">
            {canUseGsc ? (
              <GscPanel siteId={site.id} accessToken={accessToken} workerUrl={workerUrl} />
            ) : (
              <div className="rounded-xl px-4 py-4 flex items-center justify-between gap-4"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
                <div>
                  <p className="text-sm font-medium mb-1">Доступно на Growth і Agency</p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    Кліки, покази, CTR та позиції у Google — прямо з офіційного API.
                  </p>
                </div>
                <a href="/dashboard/upgrade"
                  className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl"
                  style={{ background: "var(--lime)", color: "#0a0a0a" }}>
                  Upgrade →
                </a>
              </div>
            )}
          </Section>

          {/* ── Broken links ── */}
          <Section id="links" icon={<AlertTriangle size={14} />} title="Биті посилання"
            badge={brokenLinks.length > 0 ? `${brokenLinks.length}` : undefined} badgeRed>
            {brokenLinks.length > 0 ? (
              <div className="space-y-2">
                {brokenLinks.map((link, i) => (
                  <div key={link.id ?? i} className="flex items-center justify-between gap-4 rounded-xl px-4 py-2.5"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="text-xs font-mono truncate min-w-0" style={{ color: "var(--text-secondary)" }}>
                      {link.broken_url}
                    </p>
                    <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-md"
                      style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A" }}>
                      {link.http_status_code || "timeout"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptySlot text="Перевірка щонеділі. Якщо битих посилань немає — чудово ✓" />
            )}
          </Section>

          {/* ── SSL ── */}
          <Section id="ssl" icon={<Shield size={14} />} title="SSL сертифікат">
            {ssl ? (
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{
                    background: sslOk ? "rgba(214,255,63,0.08)" : "rgba(245,103,90,0.08)",
                    border: `1px solid ${sslOk ? "rgba(214,255,63,0.2)" : "rgba(245,103,90,0.2)"}`,
                  }}>
                  {sslOk
                    ? <CheckCircle size={16} style={{ color: "var(--lime)" }} />
                    : <AlertTriangle size={16} style={{ color: "#F5675A" }} />}
                </div>
                <div>
                  <p className="text-sm font-medium">
                    {ssl.days_until_expiry === 999 ? "SSL активний"
                      : (ssl.days_until_expiry ?? 0) > 0 ? `Дійсний ще ${ssl.days_until_expiry} днів`
                      : "Проблема з сертифікатом"}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                    Перевірено {fmtDate(ssl.last_checked_at)}
                  </p>
                </div>
              </div>
            ) : (
              <EmptySlot text="SSL перевіряється при кожному uptime-скані" />
            )}
          </Section>

          {/* ── Competitors ── */}
          {competitors.length > 0 && (
            <Section id="competitors" icon={<Eye size={14} />} title="Конкуренти"
              action={
                <Link href={`/dashboard/sites/${id}/competitor`} className="text-xs transition-opacity hover:opacity-70"
                  style={{ color: "var(--lime)" }}>
                  Налаштувати →
                </Link>
              }>
              <div className="space-y-2">
                {competitors.map((comp) => {
                  const changed = competitorChanges.find((c) => c.competitor_id === comp.id);
                  let compHostname = comp.url;
                  try { compHostname = new URL(comp.url).hostname; } catch { /* keep */ }
                  return (
                    <div key={comp.id} className="flex items-center justify-between rounded-xl px-4 py-3"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{comp.display_name || compHostname}</p>
                        <p className="text-xs font-mono mt-0.5 truncate" style={{ color: "var(--text-tertiary)" }}>{comp.url}</p>
                      </div>
                      <div className="shrink-0 ml-4">
                        {changed ? (
                          <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                            style={{ background: "rgba(245,166,35,0.1)", color: "#F5A623", border: "1px solid rgba(245,166,35,0.2)" }}>
                            Зміни
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Без змін</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* ── Multi-URL ── */}
          <Section id="multiurl" icon={<TrendingUp size={14} />} title="Швидкість URL">
            <MultiUrlPanel siteId={site.id} workerUrl={workerUrl} accessToken={accessToken} />
          </Section>

          {/* ── Forms ── */}
          <Section id="forms" icon={<CheckCircle size={14} />} title="Моніторинг форм">
            <FormMonitorPanel siteId={site.id} workerUrl={workerUrl} accessToken={accessToken} siteUrl={site.url} />
          </Section>

          {/* ── Reports ── */}
          <Section id="reports" icon={<FileText size={14} />} title="PDF звіти">
            {reports.length > 0 ? (
              <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
                {reports.map((r) => <ReportRow key={r.id} report={r} />)}
              </div>
            ) : (
              <EmptySlot text="Перший місячний звіт згенерується автоматично в кінці місяця" />
            )}
          </Section>

          {/* ── Status page ── */}
          <Section id="status" icon={<Eye size={14} />} title="Публічна сторінка статусу">
            <StatusPageSection
              siteId={site.id}
              accessToken={accessToken}
              initialEnabled={!!(statusPageData?.status_page_enabled)}
              initialSlug={statusPageData?.status_page_slug ?? null}
              workerUrl={workerUrl}
              appUrl={process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.app"}
            />
          </Section>

          {/* ── Badge ── */}
          <Section id="badge" icon={<Code size={14} />} title="Uptime Badge">
            <UptimeBadgeSection siteId={site.id} />
          </Section>

        </main>
      </div>

      <QoraxusChat siteId={site.id} siteName={site.display_name} accessToken={accessToken} />
    </div>
  );
}

// ─── Sidebar primitives ────────────────────────────────────────

function KpiTile({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="rounded-lg px-2 py-2 text-center"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <p className="text-[9px] font-medium uppercase tracking-wide mb-0.5"
        style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.06em" }}>{label}</p>
      <p className="text-xs font-semibold font-mono"
        style={{ color: ok ? "var(--lime)" : "var(--text-secondary)" }}>{value}</p>
    </div>
  );
}

function NavLink({ href, label, icon, badge, badgeRed }: {
  href: string; label: string; icon: React.ReactNode;
  badge?: string; badgeRed?: boolean;
}) {
  return (
    <a href={href}
      className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-colors group"
      style={{ color: "var(--text-tertiary)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.05)"; (e.currentTarget as HTMLElement).style.color = "var(--text-primary)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ""; (e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)"; }}>
      <span className="shrink-0 opacity-60">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-md"
          style={{
            background: badgeRed ? "rgba(245,103,90,0.15)" : "rgba(214,255,63,0.08)",
            color: badgeRed ? "#F5675A" : "var(--lime)",
          }}>
          {badge}
        </span>
      )}
    </a>
  );
}

// ─── Section wrapper ───────────────────────────────────────────

function Section({ id, icon, title, badge, badgeRed, accent, action, children }: {
  id: string;
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeRed?: boolean;
  accent?: "lime";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const accentBorder = accent === "lime" ? "rgba(214,255,63,0.1)" : "rgba(255,255,255,0.06)";
  const accentBg = accent === "lime" ? "rgba(214,255,63,0.02)" : "rgba(255,255,255,0.015)";

  return (
    <div id={id} className="rounded-2xl p-5"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span style={{ color: "var(--text-tertiary)" }}>{icon}</span>
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {badge && (
            <span className="text-xs font-mono px-2 py-0.5 rounded-md"
              style={badgeRed
                ? { background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }
                : { color: "var(--text-tertiary)" }}>
              {badge}
            </span>
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── SVG Line Chart ────────────────────────────────────────────

function SpeedLineChart({ checks }: { checks: { load_time_ms: number; checked_at: string }[] }) {
  if (!checks.length) return <EmptySlot text="Дані з'являться після першого сканування" />;

  const vals = [...checks].reverse().slice(-20).map(c => c.load_time_ms);
  const max = Math.max(...vals, 1);
  const min = Math.min(...vals);
  const W = 600; const H = 80; const PAD = 8;

  const pts = vals.map((v, i) => {
    const x = PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - min) / Math.max(max - min, 1)) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const polyline = pts.join(" ");
  const area = `${pts[0]} ${pts.join(" ")} ${W - PAD},${H} ${PAD},${H}`;

  const avgMs = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
  const lastMs = vals[vals.length - 1];
  const color = lastMs > 3000 ? "#F5675A" : lastMs > 1500 ? "#F5A623" : "var(--lime)";

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-display font-bold font-mono" style={{ color }}>
            {lastMs >= 1000 ? `${(lastMs / 1000).toFixed(1)}с` : `${lastMs}мс`}
          </span>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>остання перевірка</span>
        </div>
        <span className="text-xs font-mono" style={{ color: "var(--text-tertiary)" }}>
          avg {avgMs >= 1000 ? `${(avgMs / 1000).toFixed(1)}с` : `${avgMs}мс`}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 80, display: "block", overflow: "visible" }}
        preserveAspectRatio="none">
        <defs>
          <linearGradient id={`sg-${checks.length}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={area} fill={`url(#sg-${checks.length})`} />
        <polyline points={polyline} fill="none" stroke="var(--lime)" strokeWidth="1.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {/* dots at each point */}
        {pts.map((pt, i) => {
          const [x, y] = pt.split(",").map(Number);
          return <circle key={i} cx={x} cy={y} r="2.5" fill="var(--bg)" stroke="var(--lime)" strokeWidth="1.5" />;
        })}
      </svg>
      <p className="text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
        Останні {vals.length} замірів · щоденний скан о 3:00
      </p>
    </div>
  );
}

// ─── CWV ───────────────────────────────────────────────────────

function CwvBlock({ label, data }: {
  label: string;
  data: { performance_score: number | null; lcp_ms: number | null; inp_ms: number | null; cls_score: number | null };
}) {
  const score = data.performance_score;
  const color = scoreColor(score);
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-3" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-display font-bold" style={{ color }}>{score ?? "—"}</span>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>/ 100</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <MetricPill label="LCP" value={data.lcp_ms ? `${(data.lcp_ms / 1000).toFixed(1)}с` : "—"}
          ok={data.lcp_ms !== null && data.lcp_ms <= 2500} warn={data.lcp_ms !== null && data.lcp_ms <= 4000} />
        <MetricPill label="INP" value={data.inp_ms ? `${data.inp_ms}мс` : "—"}
          ok={data.inp_ms !== null && data.inp_ms <= 200} warn={data.inp_ms !== null && data.inp_ms <= 500} />
        <MetricPill label="CLS" value={data.cls_score != null ? data.cls_score.toFixed(3) : "—"}
          ok={data.cls_score !== null && data.cls_score <= 0.1} warn={data.cls_score !== null && data.cls_score <= 0.25} />
      </div>
    </div>
  );
}

function MetricPill({ label, value, ok, warn }: { label: string; value: string; ok: boolean; warn: boolean }) {
  const color = value === "—" ? "var(--text-tertiary)" : ok ? "var(--lime)" : warn ? "#F5A623" : "#F5675A";
  return (
    <div className="rounded-lg px-2 py-2 text-center"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] mb-0.5" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <p className="text-xs font-mono font-semibold" style={{ color }}>{value}</p>
    </div>
  );
}

// ─── SEO cells ─────────────────────────────────────────────────

function SeoCell({ label, length, min, max, exists }: {
  label: string; length: number | null; min: number; max: number; exists: boolean;
}) {
  const ok = exists && length != null && length >= min && length <= max;
  const warn = exists && length != null && (length < min || length > max);
  const color = !exists ? "#F5675A" : ok ? "var(--lime)" : "#F5A623";
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle size={11} style={{ color }} /> : <AlertTriangle size={11} style={{ color }} />}
        <span className="text-xs font-medium" style={{ color: ok ? "var(--text-primary)" : color }}>
          {!exists ? "Немає" : warn && length! < min ? `Короткий (${length})` : warn ? `Довгий (${length})` : `${length} симв.`}
        </span>
      </div>
    </div>
  );
}

function SeoCheckCell({ label, ok, warn, value }: { label: string; ok: boolean; warn: boolean; value: string }) {
  const color = ok ? "var(--lime)" : warn ? "#F5A623" : "#F5675A";
  return (
    <div className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle size={11} style={{ color }} /> : <AlertTriangle size={11} style={{ color }} />}
        <span className="text-xs font-medium" style={{ color: ok ? "var(--text-primary)" : color }}>{value}</span>
      </div>
    </div>
  );
}

function SitemapCell({ label, found, value, danger }: { label: string; found: boolean; value: string; danger: boolean }) {
  const color = found ? "var(--lime)" : danger ? "#F5675A" : "#F5A623";
  return (
    <div className="rounded-xl px-4 py-3" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-xs mb-1.5" style={{ color: "var(--text-tertiary)" }}>{label}</p>
      <div className="flex items-center gap-1.5">
        {found ? <CheckCircle size={12} style={{ color }} /> : <AlertTriangle size={12} style={{ color }} />}
        <span className="text-sm font-medium" style={{ color: found ? "var(--text-primary)" : color }}>{value}</span>
      </div>
    </div>
  );
}

// ─── AI Insight ────────────────────────────────────────────────

function InsightCard({ insight }: {
  insight: {
    severity: string; problem_summary: string; plain_explanation: string;
    estimated_monthly_loss_usd: number | null; recommendation: string;
  };
}) {
  const crit = insight.severity === "critical";
  const warn = insight.severity === "warning";
  const accentColor = crit ? "#F5675A" : warn ? "#F5A623" : "var(--lime)";
  const accentRgb = crit ? "245,103,90" : warn ? "245,166,35" : "214,255,63";
  return (
    <div className="rounded-xl p-4"
      style={{ background: `rgba(${accentRgb},0.04)`, border: `1px solid rgba(${accentRgb},0.15)` }}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-xs font-mono font-semibold" style={{ color: accentColor }}>
          {crit ? "● Критично" : warn ? "● Увага" : "● Інфо"}
        </span>
        {insight.estimated_monthly_loss_usd && (
          <span className="text-xs px-2 py-0.5 rounded-md font-mono font-semibold"
            style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
            ~${insight.estimated_monthly_loss_usd}/міс
          </span>
        )}
      </div>
      <p className="text-sm font-semibold mb-1.5">{insight.problem_summary}</p>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>{insight.plain_explanation}</p>
      <p className="text-xs mt-3 flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
        <ChevronRight size={11} />{insight.recommendation}
      </p>
    </div>
  );
}

// ─── Report row ────────────────────────────────────────────────

function ReportRow({ report }: {
  report: { id: string; report_type: string; period_start: string | null; pdf_url: string | null; created_at: string };
}) {
  const label = report.report_type === "monthly_summary"
    ? `Місячний звіт${report.period_start ? " · " + new Date(report.period_start).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }) : ""}`
    : "Разовий аудит";
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <FileText size={13} style={{ color: "var(--text-tertiary)" }} />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{fmtDate(report.created_at)}</p>
        </div>
      </div>
      {report.pdf_url && (
        <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg"
          style={{ background: "rgba(214,255,63,0.08)", border: "1px solid rgba(214,255,63,0.15)", color: "var(--lime)" }}>
          PDF ↓
        </a>
      )}
    </div>
  );
}

function EmptySlot({ text }: { text: string }) {
  return (
    <div className="rounded-xl px-4 py-4 flex items-center gap-2.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <Clock size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{text}</p>
    </div>
  );
}
