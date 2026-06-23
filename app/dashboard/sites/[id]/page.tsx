import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Activity, Zap, Shield, AlertTriangle, CheckCircle,
  Clock, TrendingUp, ExternalLink, ChevronRight, Sparkles,
  FileText, Search, Eye
} from "lucide-react";
import { ReportButton } from "./ReportButton";
import { LiveUptimePanel } from "./LiveUptimePanel";
import { QoraxusChat } from "./QoraxusChat";

export const metadata = { title: "Моніторинг сайту — Qorax" };

// ─── helpers ────────────────────────────────────────────────
function scoreColor(score: number | null): string {
  if (score === null) return "var(--text-tertiary)";
  if (score >= 90) return "var(--lime)";
  if (score >= 50) return "#F5A623";
  return "#F5675A";
}
function statusDot(up: boolean) {
  return up ? "var(--lime)" : "#F5675A";
}
function fmtMs(ms: number | null) {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}
function uptimePercent(checks: { status: string }[]): string {
  if (!checks.length) return "—";
  const up = checks.filter(c => c.status === "up").length;
  return ((up / checks.length) * 100).toFixed(1) + "%";
}

// ─── main page ───────────────────────────────────────────────
export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Токен сесії для авторизації запитів до worker /api/chat
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name, platform, monitoring_enabled, check_interval_minutes, created_at")
    .eq("id", id)
    .single();
  if (!site) notFound();

  // ── паралельні запити всіх даних ──
  const [
    { data: uptimeChecks },
    { data: openIncidents },
    { data: speedChecks },
    { data: cwvChecks },
    { data: sslArr },
    { data: aiInsights },
    { data: reports },
    { data: seoAuditArr },
    { data: sitemapAuditArr },
    { data: competitors },
    { data: competitorChanges },
    { data: brokenLinks },
  ] = await Promise.all([
    supabase.from("uptime_checks")
      .select("status, response_time_ms, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(288), // ~24h при перевірці кожні 5хв
    supabase.from("uptime_incidents")
      .select("id, started_at, resolved_at")
      .eq("site_id", id)
      .is("resolved_at", null)
      .limit(1),
    supabase.from("speed_checks")
      .select("load_time_ms, page_size_kb, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(30),
    supabase.from("core_web_vitals_checks")
      .select("strategy, lcp_ms, inp_ms, cls_score, performance_score, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(4),
    supabase.from("ssl_certificates")
      .select("days_until_expiry, last_checked_at")
      .eq("site_id", id)
      .limit(1),
    supabase.from("ai_insights")
      .select("severity, problem_summary, plain_explanation, estimated_monthly_loss_usd, recommendation, generated_at")
      .eq("site_id", id)
      .eq("is_resolved", false)
      .order("generated_at", { ascending: false })
      .limit(5),
    supabase.from("reports")
      .select("id, report_type, period_start, period_end, pdf_url, status, created_at")
      .eq("site_id", id)
      .eq("status", "ready")
      .order("created_at", { ascending: false })
      .limit(6),
    supabase.from("page_seo_audits")
      .select("title, title_length, meta_description, meta_description_length, has_h1, h1_count, has_schema_markup, schema_types, issues, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(1),
    supabase.from("sitemap_audits")
      .select("sitemap_found, sitemap_url, urls_in_sitemap, sitemap_errors, robots_found, robots_blocks_important_pages, robots_issues, checked_at")
      .eq("site_id", id)
      .order("checked_at", { ascending: false })
      .limit(1),
    supabase.from("competitor_sites")
      .select("id, url, display_name, last_change_at")
      .eq("site_id", id)
      .limit(5),
    supabase.from("competitor_changes")
      .select("detected_at, change_summary, competitor_id")
      .eq("site_id", id)
      .order("detected_at", { ascending: false })
      .limit(5),
    supabase.from("broken_links")
      .select("id, broken_url, http_status_code, source_page_url, first_found_at, status")
      .eq("site_id", id)
      .eq("status", "broken")
      .order("first_found_at", { ascending: false })
      .limit(20),
  ]);

  const seoAudit = seoAuditArr?.[0] ?? null;
  const sitemapAudit = sitemapAuditArr?.[0] ?? null;
  const ssl = sslArr?.[0] ?? null;

  const isUp = !openIncidents?.length;
  const latestCheck = uptimeChecks?.[0];
  const latestSpeed = speedChecks?.[0];
  const latestMobileCwv = cwvChecks?.find(c => c.strategy === "mobile");
  const latestDesktopCwv = cwvChecks?.find(c => c.strategy === "desktop");
  const hostname = new URL(site.url).hostname;

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

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10 space-y-8">

        {/* ── Site hero ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 rounded-full shrink-0 transition-colors" style={{ background: statusDot(isUp) }} />
            <div>
              <h1 className="font-display text-2xl font-semibold">{site.display_name}</h1>
              <p className="text-sm font-mono text-[var(--text-tertiary)]">{hostname}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href={`/dashboard/sites/${site.id}/competitor`}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Конкуренти
            </Link>
            <a
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Відкрити сайт <ExternalLink size={13} />
            </a>
            <ReportButton siteId={site.id} />
          </div>
        </div>

        {/* ── Live Uptime Panel (auto-refresh 30s) ── */}
        <LiveUptimePanel
          siteId={site.id}
          initialChecks={uptimeChecks ?? []}
          initialIsUp={isUp}
          supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!}
          supabaseAnonKey={process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}
        />

        {/* ── Speed trend (full width) ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-sm font-medium flex items-center gap-2">
              <TrendingUp size={14} className="text-[var(--text-tertiary)]" /> Час відповіді (швидкість завантаження)
            </span>
            <span className="text-xs font-mono text-[var(--text-tertiary)]">
              {latestSpeed ? fmtMs(latestSpeed.load_time_ms) : "—"}
            </span>
          </div>
          <SpeedChart checks={speedChecks ?? []} />
          <p className="text-xs text-[var(--text-tertiary)] mt-2">
            Останні {speedChecks?.length ?? 0} замірів · щоденний скан о 3:00
          </p>
        </div>

        {/* ── Broken Links ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle size={14} className="text-[var(--text-tertiary)]" /> Биті посилання
            </h2>
            {brokenLinks && brokenLinks.length > 0 && (
              <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
                {brokenLinks.length} активних
              </span>
            )}
          </div>
          {brokenLinks && brokenLinks.length > 0 ? (
            <div className="space-y-2">
              {brokenLinks.map((link) => (
                <div key={link.id} className="flex items-start justify-between gap-4 rounded-xl px-3.5 py-2.5"
                  style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                  <div className="min-w-0">
                    <p className="text-xs font-mono truncate" style={{ color: "var(--text-secondary)" }}>
                      {link.broken_url}
                    </p>
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      Знайдено: {fmtDate(link.first_found_at)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-mono px-2 py-0.5 rounded-md"
                    style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
                    {link.http_status_code || "timeout"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyData text="Перевірка битих посилань запускається щонеділі. Якщо битих немає — чудово ✓" />
          )}
        </div>

        {/* ── PageSpeed scores ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-5 flex items-center gap-2">
            <Zap size={14} className="text-[var(--text-tertiary)]" /> PageSpeed Insights
          </h2>
          {latestMobileCwv || latestDesktopCwv ? (
            <div className="grid sm:grid-cols-2 gap-6">
              {latestMobileCwv && <CwvBlock label="📱 Мобільний" data={latestMobileCwv} />}
              {latestDesktopCwv && <CwvBlock label="🖥 Десктоп" data={latestDesktopCwv} />}
            </div>
          ) : (
            <EmptyData text="Дані з'являться після першого щоденного скану (кожної ночі о 3:00)" />
          )}
        </div>


        {/* ── SEO Audit ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-sm font-medium flex items-center gap-2">
              <Search size={14} className="text-[var(--text-tertiary)]" /> SEO аудит
            </h2>
            {seoAudit && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {fmtDate((seoAudit as Record<string,unknown>).checked_at as string)}
              </span>
            )}
          </div>
          {seoAudit ? (
            <div className="space-y-4">
              {/* Meta grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SeoMetaCell
                  label="Title"
                  value={(seoAudit as Record<string,unknown>).title as string | null}
                  length={(seoAudit as Record<string,unknown>).title_length as number | null}
                  minLen={30} maxLen={60}
                />
                <SeoMetaCell
                  label="Description"
                  value={(seoAudit as Record<string,unknown>).meta_description as string | null}
                  length={(seoAudit as Record<string,unknown>).meta_description_length as number | null}
                  minLen={70} maxLen={160}
                />
                <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                  <p className="text-xs text-[var(--text-tertiary)] mb-1.5">H1</p>
                  {(seoAudit as Record<string,unknown>).has_h1 ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={13} style={{ color: "var(--lime)" }} />
                      <span className="text-sm font-medium">{(seoAudit as Record<string,unknown>).h1_count as number} шт.</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} style={{ color: "#F5675A" }} />
                      <span className="text-sm font-medium" style={{ color: "#F5675A" }}>Немає</span>
                    </div>
                  )}
                </div>
                <div className="rounded-xl p-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                  <p className="text-xs text-[var(--text-tertiary)] mb-1.5">Schema</p>
                  {(seoAudit as Record<string,unknown>).has_schema_markup ? (
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={13} style={{ color: "var(--lime)" }} />
                      <span className="text-sm font-medium text-xs" style={{ color: "var(--lime)" }}>
                        {((seoAudit as Record<string,unknown>).schema_types as string[] | null)?.join(", ") || "✓"}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle size={13} style={{ color: "#F5A623" }} />
                      <span className="text-sm font-medium" style={{ color: "#F5A623" }}>Немає</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Issues */}
              {((seoAudit as Record<string,unknown>).issues as string[] | null)?.length ? (
                <div className="space-y-1.5">
                  {((seoAudit as Record<string,unknown>).issues as string[]).map((issue, i) => (
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
              )}

              {/* Sitemap + Robots */}
              {sitemapAudit && (
                <div className="grid grid-cols-2 gap-3 mt-1">
                  <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                    <p className="text-xs text-[var(--text-tertiary)] mb-1.5">sitemap.xml</p>
                    {(sitemapAudit as Record<string,unknown>).sitemap_found ? (
                      <div>
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <CheckCircle size={12} style={{ color: "var(--lime)" }} />
                          <span className="text-sm font-medium">{(sitemapAudit as Record<string,unknown>).urls_in_sitemap as number} URL</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={12} style={{ color: "#F5A623" }} />
                        <span className="text-sm" style={{ color: "#F5A623" }}>Не знайдено</span>
                      </div>
                    )}
                  </div>
                  <div className="rounded-xl px-3.5 py-3" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                    <p className="text-xs text-[var(--text-tertiary)] mb-1.5">robots.txt</p>
                    {(sitemapAudit as Record<string,unknown>).robots_found ? (
                      (sitemapAudit as Record<string,unknown>).robots_blocks_important_pages ? (
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle size={12} style={{ color: "#F5675A" }} />
                          <span className="text-sm" style={{ color: "#F5675A" }}>Блокує індексацію</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <CheckCircle size={12} style={{ color: "var(--lime)" }} />
                          <span className="text-sm font-medium">Ок</span>
                        </div>
                      )
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle size={12} style={{ color: "#F5A623" }} />
                        <span className="text-sm" style={{ color: "#F5A623" }}>Не знайдено</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <EmptyData text="SEO аудит запускається щодня о 3:00. Дані з&apos;являться після першого сканування" />
          )}
        </div>

        {/* ── Competitor Changes ── */}
        {competitors && competitors.length > 0 && (
          <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <Eye size={14} className="text-[var(--text-tertiary)]" /> Конкуренти
              </h2>
              <Link href={`/dashboard/sites/${id}/competitor`}
                className="text-xs text-[var(--cyan)] hover:opacity-80 transition-opacity">
                Налаштувати →
              </Link>
            </div>
            <div className="space-y-2">
              {competitors.map((comp) => {
                const recentChange = competitorChanges?.find(c => c.competitor_id === comp.id);
                return (
                  <div key={comp.id} className="flex items-center justify-between rounded-xl px-3.5 py-2.5"
                    style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {comp.display_name || new URL(comp.url).hostname}
                      </p>
                      <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5 truncate">{comp.url}</p>
                    </div>
                    <div className="shrink-0 ml-4 text-right">
                      {recentChange ? (
                        <div>
                          <span className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623" }}>
                            Зміни
                          </span>
                          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                            {fmtDate(recentChange.detected_at)}
                          </p>
                        </div>
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

        {/* ── AI Insights ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-5 flex items-center gap-2">
            <Sparkles size={14} className="text-[var(--text-tertiary)]" /> AI-аналіз
          </h2>
          {aiInsights && aiInsights.length > 0 ? (
            <div className="space-y-3">
              {aiInsights.map((insight, i) => (
                <InsightCard key={i} insight={insight} />
              ))}
            </div>
          ) : (
            <EmptyData text="AI-інсайти з'являться після першого повного сканування" />
          )}
        </div>

        {/* ── SSL card ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Shield size={14} className="text-[var(--text-tertiary)]" /> SSL сертифікат
          </h2>
          {ssl ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {ssl.days_until_expiry != null && ssl.days_until_expiry > 0
                  ? <CheckCircle size={16} style={{ color: "var(--lime)" }} />
                  : <AlertTriangle size={16} style={{ color: "#F5675A" }} />}
                <div>
                  <p className="text-sm font-medium">
                    {ssl.days_until_expiry === 999
                      ? "SSL активний"
                      : ssl.days_until_expiry != null && ssl.days_until_expiry > 0
                      ? `Дійсний ще ${ssl.days_until_expiry} днів`
                      : "Проблема з сертифікатом"}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                    Перевірено {fmtDate(ssl.last_checked_at)}
                  </p>
                </div>
              </div>
              {ssl.days_until_expiry != null && ssl.days_until_expiry !== 999 && ssl.days_until_expiry <= 30 && ssl.days_until_expiry > 0 && (
                <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623" }}>
                  Скоро закінчується
                </span>
              )}
            </div>
          ) : (
            <EmptyData text="SSL перевіряється при кожному uptime-скані" />
          )}
        </div>

        {/* ── Reports ── */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <FileText size={14} className="text-[var(--text-tertiary)]" /> PDF звіти
          </h2>
          {reports && reports.length > 0 ? (
            <div className="space-y-2">
              {reports.map((report) => (
                <ReportRow key={report.id} report={report} />
              ))}
            </div>
          ) : (
            <EmptyData text="Перший місячний звіт згенерується автоматично в кінці місяця" />
          )}
        </div>

      </main>

      {/* Qoraxus AI-асистент (Growth+) */}
      <QoraxusChat
        siteId={site.id}
        siteName={site.display_name}
        accessToken={accessToken}
      />
    </div>
  );
}

// ─── sub-components ──────────────────────────────────────────

function StatCard({ icon, label, value, valueColor }: {
  icon: React.ReactNode; label: string; value: string; valueColor?: string;
}) {
  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
      <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)] mb-2">
        {icon} {label}
      </div>
      <div className="font-display text-xl font-semibold tabular-nums" style={{ color: valueColor ?? "var(--text-primary)" }}>
        {value}
      </div>
    </div>
  );
}

function UptimeBars({ checks }: { checks: { status: string }[] }) {
  // Останні 96 блоків (8 годин по 5хв) — або менше якщо даних немає
  const display = checks.slice(0, 96).reverse();
  if (!display.length) return <EmptyData text="Дані з'являться після першого сканування" />;
  return (
    <div className="flex gap-0.5 flex-wrap">
      {display.map((c, i) => (
        <div
          key={i}
          className="h-5 w-1.5 rounded-sm transition-opacity"
          style={{ background: c.status === "up" ? "var(--lime)" : "#F5675A" }}
          title={c.status === "up" ? "Онлайн" : "Офлайн"}
        />
      ))}
    </div>
  );
}

function SpeedChart({ checks }: { checks: { load_time_ms: number; checked_at: string }[] }) {
  if (!checks.length) return <EmptyData text="Дані з'являться після першого сканування" />;
  const values = [...checks].reverse().map(c => c.load_time_ms);
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-0.5 h-16">
      {values.slice(-60).map((v, i) => {
        const h = Math.max((v / max) * 100, 4);
        const color = v > 3000 ? "#F5675A" : v > 1500 ? "#F5A623" : "var(--lime)";
        return (
          <div
            key={i}
            className="flex-1 rounded-sm min-w-[3px] transition-all"
            style={{ height: `${h}%`, background: color }}
            title={`${v}мс`}
          />
        );
      })}
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
      <div className="flex items-center gap-4 mb-3">
        <div
          className="text-3xl font-display font-bold tabular-nums"
          style={{ color: scoreColor(data.performance_score) }}
        >
          {data.performance_score ?? "—"}
        </div>
        <div className="text-xs text-[var(--text-tertiary)]">/ 100</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <MetricPill label="LCP" value={data.lcp_ms ? `${(data.lcp_ms / 1000).toFixed(1)}с` : "—"}
          good={data.lcp_ms !== null && data.lcp_ms <= 2500} warn={data.lcp_ms !== null && data.lcp_ms <= 4000} />
        <MetricPill label="INP" value={data.inp_ms ? `${data.inp_ms}мс` : "—"}
          good={data.inp_ms !== null && data.inp_ms <= 200} warn={data.inp_ms !== null && data.inp_ms <= 500} />
        <MetricPill label="CLS" value={data.cls_score != null ? data.cls_score.toFixed(3) : "—"}
          good={data.cls_score !== null && data.cls_score <= 0.1} warn={data.cls_score !== null && data.cls_score <= 0.25} />
      </div>
    </div>
  );
}

function MetricPill({ label, value, good, warn }: { label: string; value: string; good: boolean; warn: boolean }) {
  const color = good ? "var(--lime)" : warn ? "#F5A623" : value === "—" ? "var(--text-tertiary)" : "#F5675A";
  return (
    <div className="rounded-lg px-2.5 py-2 text-center" style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
      <div className="text-[var(--text-tertiary)] mb-0.5">{label}</div>
      <div className="font-mono font-medium" style={{ color }}>{value}</div>
    </div>
  );
}

function InsightCard({ insight }: {
  insight: {
    severity: string; problem_summary: string; plain_explanation: string;
    estimated_monthly_loss_usd: number | null; recommendation: string;
  }
}) {
  const isWarning = insight.severity === "warning";
  const isCritical = insight.severity === "critical";
  const borderColor = isCritical ? "rgba(245,103,90,0.4)" : isWarning ? "rgba(245,166,35,0.3)" : "var(--border-hairline)";
  const bg = isCritical ? "rgba(245,103,90,0.05)" : isWarning ? "rgba(245,166,35,0.05)" : "transparent";
  const severityColor = isCritical ? "#F5675A" : isWarning ? "#F5A623" : "var(--cyan)";

  return (
    <div className="rounded-xl border p-4" style={{ borderColor, background: bg }}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono uppercase tracking-wide" style={{ color: severityColor }}>
              {isCritical ? "Критично" : isWarning ? "Увага" : "Інфо"}
            </span>
            {insight.estimated_monthly_loss_usd && (
              <span className="text-xs px-2 py-0.5 rounded-md font-mono" style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
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
      </div>
    </div>
  );
}

function ReportRow({ report }: {
  report: { id: string; report_type: string; period_start: string | null; period_end: string | null; pdf_url: string | null; created_at: string }
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
        <a
          href={report.pdf_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
          style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--cyan)" }}
        >
          PDF ↓
        </a>
      )}
    </div>
  );
}

function EmptyData({ text }: { text: string }) {
  return (
    <p className="text-sm text-[var(--text-tertiary)] py-3">{text}</p>
  );
}

function SeoMetaCell({
  label,
  value,
  length,
  minLen,
  maxLen,
}: {
  label: string;
  value: string | null;
  length: number | null;
  minLen: number;
  maxLen: number;
}) {
  const ok = value && length != null && length >= minLen && length <= maxLen;
  const tooShort = value && length != null && length < minLen;
  const tooLong = value && length != null && length > maxLen;
  const missing = !value;

  const color = ok
    ? "var(--lime)"
    : tooShort || tooLong
    ? "#F5A623"
    : "#F5675A";

  return (
    <div
      className="rounded-xl p-3 col-span-1"
      style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
    >
      <p className="text-xs text-[var(--text-tertiary)] mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {ok ? (
          <CheckCircle size={12} style={{ color }} />
        ) : (
          <AlertTriangle size={12} style={{ color }} />
        )}
        <span className="text-sm font-medium" style={{ color: ok ? "var(--text-primary)" : color }}>
          {missing
            ? "Відсутній"
            : tooShort
            ? `Короткий (${length})`
            : tooLong
            ? `Довгий (${length})`
            : `${length} симв.`}
        </span>
      </div>
    </div>
  );
}
