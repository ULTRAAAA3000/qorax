import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Activity, Zap, Shield, AlertTriangle, CheckCircle,
  Clock, TrendingUp, ExternalLink, ChevronRight, Sparkles,
  FileText, Search, Eye,
} from "lucide-react";
import { ReportButton } from "./ReportButton";
import { LiveUptimePanel } from "./LiveUptimePanel";
import { QoraxusChat } from "./QoraxusChat";

export const metadata = { title: "Моніторинг сайту — Qorax" };

// ─── helpers ─────────────────────────────────────────────────
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

// ─── safe DB fetch ────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function safe<T = any>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try {
    const r = await p;
    return r.data ?? [];
  } catch {
    return [];
  }
}

// ─── main page ────────────────────────────────────────────────
export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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

  // hostname з захистом від невалідного URL
  let hostname = site.url;
  try { hostname = new URL(site.url).hostname; } catch { /* keep raw */ }

  // ── всі запити паралельно, кожен захищений safe() ──
  const [
    uptimeChecks,
    openIncidents,
    speedChecks,
    cwvChecks,
    sslArr,
    aiInsights,
    reports,
    seoAuditArr,
    sitemapAuditArr,
    competitors,
    competitorChanges,
    brokenLinks,
  ] = await Promise.all([
    safe(supabase.from("uptime_checks")
      .select("status, response_time_ms, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(288)),
    safe(supabase.from("uptime_incidents")
      .select("id, started_at, resolved_at")
      .eq("site_id", id)
      .is("resolved_at", null)
      .limit(1)),
    safe(supabase.from("speed_checks")
      .select("load_time_ms, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(30)),
    safe(supabase.from("core_web_vitals_checks")
      .select("strategy, lcp_ms, inp_ms, cls_score, performance_score, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(4)),
    safe(supabase.from("ssl_certificates")
      .select("days_until_expiry, last_checked_at")
      .eq("site_id", id)
      .limit(1)),
    safe(supabase.from("ai_insights")
      .select("severity, problem_summary, plain_explanation, estimated_monthly_loss_usd, recommendation, generated_at")
      .eq("site_id", id)
      .eq("is_resolved", false)
      .order("generated_at", { ascending: false })
      .limit(5)),
    safe(supabase.from("reports")
      .select("id, report_type, period_start, pdf_url, created_at")
      .eq("site_id", id)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(6)),
    safe(supabase.from("page_seo_audits")
      .select("title, title_length, meta_description, meta_description_length, has_h1, h1_count, has_schema_markup, schema_types, issues, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(1)),
    safe(supabase.from("sitemap_audits")
      .select("sitemap_found, urls_in_sitemap, robots_found, robots_blocks_important_pages, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(1)),
    safe(supabase.from("competitor_sites")
      .select("id, url, display_name, last_change_at")
      .eq("site_id", id)
      .limit(5)),
    safe(supabase.from("competitor_changes")
      .select("detected_at, competitor_id")
      .eq("site_id", id)
      .order("detected_at", { ascending: false })
      .limit(10)),
    safe(supabase.from("broken_links")
      .select("id, broken_url, http_status_code, first_found_at")
      .eq("site_id", id)
      .eq("status", "broken")
      .order("first_found_at", { ascending: false })
      .limit(20)),
  ]);

  const ssl = sslArr[0] ?? null;
  const seoAudit = seoAuditArr[0] ?? null;
  const sitemapAudit = sitemapAuditArr[0] ?? null;
  const isUp = openIncidents.length === 0;
  const latestSpeed = speedChecks[0] ?? null;
  const mobileCwv = cwvChecks.find((c) => c.strategy === "mobile") ?? null;
  const desktopCwv = cwvChecks.find((c) => c.strategy === "desktop") ?? null;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link href="/dashboard" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            ← Назад
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10 space-y-6">

        {/* Site hero */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full shrink-0"
              style={{ background: isUp ? "var(--lime)" : "#F5675A" }} />
            <div>
              <h1 className="font-display text-2xl font-semibold">{site.display_name}</h1>
              <p className="text-sm font-mono text-[var(--text-tertiary)]">{hostname}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/sites/${site.id}/competitor`}
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              Конкуренти
            </Link>
            <a href={site.url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              Відкрити сайт <ExternalLink size={13} />
            </a>
            <ReportButton siteId={site.id} />
          </div>
        </div>

        {/* Live Uptime */}
        <LiveUptimePanel
          siteId={site.id}
          initialChecks={uptimeChecks}
          initialIsUp={isUp}
          supabaseUrl={supabaseUrl}
          supabaseAnonKey={supabaseAnonKey}
        />

        {/* Speed trend */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium flex items-center gap-2">
              <TrendingUp size={14} className="text-[var(--text-tertiary)]" />
              Час відповіді
            </span>
            <span className="text-xs font-mono text-[var(--text-tertiary)]">
              {fmtMs(latestSpeed?.load_time_ms ?? null)}
            </span>
          </div>
          <SpeedChart checks={speedChecks} />
          <p className="text-xs text-[var(--text-tertiary)] mt-2">
            Останні {speedChecks.length} замірів · щоденний скан о 3:00
          </p>
        </div>

        {/* PageSpeed */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-5 flex items-center gap-2">
            <Zap size={14} className="text-[var(--text-tertiary)]" /> PageSpeed Insights
          </h2>
          {mobileCwv || desktopCwv ? (
            <div className="grid sm:grid-cols-2 gap-6">
              {mobileCwv && <CwvBlock label="📱 Мобільний" data={mobileCwv} />}
              {desktopCwv && <CwvBlock label="🖥 Десктоп" data={desktopCwv} />}
            </div>
          ) : (
            <EmptyData text="Дані з'являться після першого щоденного скану (о 3:00)" />
          )}
        </div>

        {/* Broken links */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--text-tertiary)]" /> Биті посилання
            </h2>
            {brokenLinks.length > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
                {brokenLinks.length} активних
              </span>
            )}
          </div>
          {brokenLinks.length > 0 ? (
            <div className="space-y-2">
              {brokenLinks.map((link, i) => (
                <div key={link.id ?? i} className="flex items-start justify-between gap-4 rounded-xl px-3.5 py-2.5"
                  style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                  <p className="text-xs font-mono truncate min-w-0" style={{ color: "var(--text-secondary)" }}>
                    {link.broken_url}
                  </p>
                  <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-md"
                    style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
                    {link.http_status_code || "timeout"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyData text="Перевірка запускається щонеділі. Якщо битих немає — чудово ✓" />
          )}
        </div>

        {/* SEO Audit */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Search size={14} className="text-[var(--text-tertiary)]" /> SEO аудит
            </h2>
            {seoAudit && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {fmtDate(seoAudit.checked_at)}
              </span>
            )}
          </div>
          {seoAudit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SeoCell label="Title" length={seoAudit.title_length} min={30} max={60} exists={!!seoAudit.title} />
                <SeoCell label="Description" length={seoAudit.meta_description_length} min={70} max={160} exists={!!seoAudit.meta_description} />
                <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                  <p className="text-xs text-[var(--text-tertiary)] mb-1.5">H1</p>
                  <div className="flex items-center gap-1.5">
                    {seoAudit.has_h1
                      ? <><CheckCircle size={12} style={{ color: "var(--lime)" }} /><span className="text-sm font-medium">{seoAudit.h1_count} шт.</span></>
                      : <><AlertTriangle size={12} style={{ color: "#F5675A" }} /><span className="text-sm font-medium" style={{ color: "#F5675A" }}>Немає</span></>}
                  </div>
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                  <p className="text-xs text-[var(--text-tertiary)] mb-1.5">Schema</p>
                  <div className="flex items-center gap-1.5">
                    {seoAudit.has_schema_markup
                      ? <><CheckCircle size={12} style={{ color: "var(--lime)" }} /><span className="text-xs font-medium" style={{ color: "var(--lime)" }}>✓ OK</span></>
                      : <><AlertTriangle size={12} style={{ color: "#F5A623" }} /><span className="text-sm font-medium" style={{ color: "#F5A623" }}>Немає</span></>}
                  </div>
                </div>
              </div>
              {(() => {
                // issues може бути JSON-рядком або масивом залежно від Supabase
                let issueList: string[] = [];
                try {
                  const raw = seoAudit.issues;
                  issueList = Array.isArray(raw) ? raw : JSON.parse(typeof raw === "string" ? raw : "[]");
                } catch { issueList = []; }
                return issueList.length > 0 ? (
                <div className="space-y-1.5">
                  {issueList.map((issue: string, i: number) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-xl px-3.5 py-2.5"
                      style={{ background: "rgba(245,103,90,0.06)", border: "1px solid rgba(245,103,90,0.15)" }}>
                      <AlertTriangle size={12} style={{ color: "#F5675A", flexShrink: 0, marginTop: 2 }} />
                      <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{issue}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5"
                  style={{ background: "rgba(214,255,63,0.06)", border: "1px solid rgba(214,255,63,0.15)" }}>
                  <CheckCircle size={13} style={{ color: "var(--lime)" }} />
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>SEO мета-теги в нормі</p>
                </div>
              ); })()}
              {sitemapAudit && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                    <p className="text-xs text-[var(--text-tertiary)] mb-1.5">sitemap.xml</p>
                    {sitemapAudit.sitemap_found
                      ? <div className="flex items-center gap-1.5"><CheckCircle size={12} style={{ color: "var(--lime)" }} /><span className="text-sm font-medium">{sitemapAudit.urls_in_sitemap ?? "?"} URL</span></div>
                      : <div className="flex items-center gap-1.5"><AlertTriangle size={12} style={{ color: "#F5A623" }} /><span className="text-sm" style={{ color: "#F5A623" }}>Не знайдено</span></div>}
                  </div>
                  <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                    <p className="text-xs text-[var(--text-tertiary)] mb-1.5">robots.txt</p>
                    {sitemapAudit.robots_found
                      ? sitemapAudit.robots_blocks_important_pages
                        ? <div className="flex items-center gap-1.5"><AlertTriangle size={12} style={{ color: "#F5675A" }} /><span className="text-sm" style={{ color: "#F5675A" }}>Блокує індексацію</span></div>
                        : <div className="flex items-center gap-1.5"><CheckCircle size={12} style={{ color: "var(--lime)" }} /><span className="text-sm font-medium">Ок</span></div>
                      : <div className="flex items-center gap-1.5"><AlertTriangle size={12} style={{ color: "#F5A623" }} /><span className="text-sm" style={{ color: "#F5A623" }}>Не знайдено</span></div>}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyData text="SEO аудит запускається щодня о 3:00. Дані з'являться після першого сканування" />
          )}
        </div>

        {/* Competitors */}
        {competitors.length > 0 && (
          <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <Eye size={14} className="text-[var(--text-tertiary)]" /> Конкуренти
              </h2>
              <Link href={`/dashboard/sites/${id}/competitor`}
                className="text-xs hover:opacity-80 transition-opacity" style={{ color: "var(--cyan)" }}>
                Налаштувати →
              </Link>
            </div>
            <div className="space-y-2">
              {competitors.map((comp) => {
                const changed = competitorChanges.find((c) => c.competitor_id === comp.id);
                let compHostname = comp.url;
                try { compHostname = new URL(comp.url).hostname; } catch { /* keep raw */ }
                return (
                  <div key={comp.id} className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                    style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{comp.display_name || compHostname}</p>
                      <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5 truncate">{comp.url}</p>
                    </div>
                    <div className="shrink-0 ml-4 text-right">
                      {changed ? (
                        <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                          style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623" }}>
                          Зміни
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">Без змін</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* AI Insights */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-5 flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--text-tertiary)]" /> AI-аналіз
          </h2>
          {aiInsights.length > 0 ? (
            <div className="space-y-3">
              {aiInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
            </div>
          ) : (
            <EmptyData text="AI-інсайти з'являться після першого повного сканування" />
          )}
        </div>

        {/* SSL */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Shield size={14} className="text-[var(--text-tertiary)]" /> SSL сертифікат
          </h2>
          {ssl ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {(ssl.days_until_expiry ?? 0) > 0
                  ? <CheckCircle size={16} style={{ color: "var(--lime)" }} />
                  : <AlertTriangle size={16} style={{ color: "#F5675A" }} />}
                <div>
                  <p className="text-sm font-medium">
                    {ssl.days_until_expiry === 999 ? "SSL активний"
                      : (ssl.days_until_expiry ?? 0) > 0 ? `Дійсний ще ${ssl.days_until_expiry} днів`
                      : "Проблема з сертифікатом"}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    Перевірено {fmtDate(ssl.last_checked_at)}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyData text="SSL перевіряється при кожному uptime-скані" />
          )}
        </div>

        {/* Reports */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <FileText size={14} className="text-[var(--text-tertiary)]" /> PDF звіти
          </h2>
          {reports.length > 0 ? (
            <div className="space-y-2">
              {reports.map((r) => <ReportRow key={r.id} report={r} />)}
            </div>
          ) : (
            <EmptyData text="Перший місячний звіт згенерується автоматично в кінці місяця" />
          )}
        </div>

      </main>

      <QoraxusChat siteId={site.id} siteName={site.display_name} accessToken={accessToken} />
    </div>
  );
}

// ─── sub-components ───────────────────────────────────────────

function SpeedChart({ checks }: { checks: { load_time_ms: number }[] }) {
  if (!checks.length) return <EmptyData text="Дані з'являться після першого сканування" />;
  const vals = [...checks].reverse().map((c) => c.load_time_ms);
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {vals.slice(-60).map((v, i) => (
        <div key={i} className="flex-1 rounded-sm min-w-[3px]"
          style={{
            height: `${Math.max((v / max) * 100, 4)}%`,
            background: v > 3000 ? "#F5675A" : v > 1500 ? "#F5A623" : "var(--lime)",
          }}
          title={`${v}мс`} />
      ))}
    </div>
  );
}

function CwvBlock({ label, data }: {
  label: string;
  data: { performance_score: number | null; lcp_ms: number | null; inp_ms: number | null; cls_score: number | null };
}) {
  return (
    <div>
      <p className="text-xs text-[var(--text-tertiary)] mb-3">{label}</p>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-display font-bold" style={{ color: scoreColor(data.performance_score) }}>
          {data.performance_score ?? "—"}
        </span>
        <span className="text-xs text-[var(--text-tertiary)]">/ 100</span>
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
    <div className="rounded-lg px-2.5 py-2 text-center"
      style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
      <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5">{label}</p>
      <p className="text-xs font-mono font-medium" style={{ color }}>{value}</p>
    </div>
  );
}

function SeoCell({ label, length, min, max, exists }: {
  label: string; length: number | null; min: number; max: number; exists: boolean;
}) {
  const ok = exists && length != null && length >= min && length <= max;
  const warn = exists && length != null && (length < min || length > max);
  const color = !exists ? "#F5675A" : ok ? "var(--lime)" : "#F5A623";
  return (
    <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
      <p className="text-xs text-[var(--text-tertiary)] mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle size={12} style={{ color }} /> : <AlertTriangle size={12} style={{ color }} />}
        <span className="text-sm font-medium" style={{ color: ok ? "var(--text-primary)" : color }}>
          {!exists ? "Відсутній" : warn && length! < min ? `Короткий (${length})` : warn ? `Довгий (${length})` : `${length} симв.`}
        </span>
      </div>
    </div>
  );
}

function InsightCard({ insight }: {
  insight: {
    severity: string; problem_summary: string; plain_explanation: string;
    estimated_monthly_loss_usd: number | null; recommendation: string;
  };
}) {
  const crit = insight.severity === "critical";
  const warn = insight.severity === "warning";
  return (
    <div className="rounded-xl border p-4" style={{
      borderColor: crit ? "rgba(245,103,90,0.4)" : warn ? "rgba(245,166,35,0.3)" : "var(--border-hairline)",
      background: crit ? "rgba(245,103,90,0.05)" : warn ? "rgba(245,166,35,0.05)" : "transparent",
    }}>
      <div className="flex items-center gap-2 mb-1">
        <span className="text-xs font-mono uppercase" style={{ color: crit ? "#F5675A" : warn ? "#F5A623" : "var(--cyan)" }}>
          {crit ? "Критично" : warn ? "Увага" : "Інфо"}
        </span>
        {insight.estimated_monthly_loss_usd && (
          <span className="text-xs px-2 py-0.5 rounded-md font-mono"
            style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
            ~${insight.estimated_monthly_loss_usd}/міс
          </span>
        )}
      </div>
      <p className="text-sm font-medium mb-1">{insight.problem_summary}</p>
      <p className="text-sm text-[var(--text-secondary)]">{insight.plain_explanation}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-2 flex items-center gap-1">
        <ChevronRight size={11} /> {insight.recommendation}
      </p>
    </div>
  );
}

function ReportRow({ report }: {
  report: { id: string; report_type: string; period_start: string | null; pdf_url: string | null; created_at: string };
}) {
  const label = report.report_type === "monthly_summary"
    ? `Місячний звіт${report.period_start ? " · " + new Date(report.period_start).toLocaleDateString("uk-UA", { month: "long", year: "numeric" }) : ""}`
    : "Разовий аудит";
  return (
    <div className="flex items-center justify-between py-2.5 border-b hairline last:border-0">
      <div className="flex items-center gap-3">
        <FileText size={14} className="text-[var(--text-tertiary)]" />
        <div>
          <p className="text-sm">{label}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{fmtDate(report.created_at)}</p>
        </div>
      </div>
      {report.pdf_url && (
        <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
          className="text-xs font-medium px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
          style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--cyan)" }}>
          PDF ↓
        </a>
      )}
    </div>
  );
}

function EmptyData({ text }: { text: string }) {
  return <p className="text-sm text-[var(--text-tertiary)] py-3">{text}</p>;
}

// Unused but kept for potential future use
const _unused = { Activity, Clock };
void _unused;
