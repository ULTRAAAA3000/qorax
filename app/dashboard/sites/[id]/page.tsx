import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Activity, Zap, Shield, AlertTriangle, CheckCircle,
  Clock, TrendingUp, ExternalLink, ChevronRight, Sparkles,
  FileText, Search, Eye, ArrowLeft,
} from "lucide-react";
import { ReportButton } from "./ReportButton";
import { LiveUptimePanel } from "./LiveUptimePanel";
import { QoraxusChat } from "./QoraxusChat";

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
async function safe<T = any>(p: PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  try { const r = await p; return r.data ?? []; } catch { return []; }
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

  let hostname = site.url;
  try { hostname = new URL(site.url).hostname; } catch { /* keep raw */ }

  const [
    uptimeChecks, openIncidents, speedChecks, cwvChecks, sslArr,
    aiInsights, reports, seoAuditArr, sitemapAuditArr, competitors,
    competitorChanges, brokenLinks,
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

  // Quick stats for top bar
  const uptimePct = uptimeChecks.length
    ? ((uptimeChecks.filter(c => c.status === "up").length / uptimeChecks.length) * 100).toFixed(1)
    : null;
  const sslOk = ssl && (ssl.days_until_expiry === 999 || (ssl.days_until_expiry ?? 0) > 0);
  const criticalInsights = aiInsights.filter(i => i.severity === "critical").length;

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Navbar ── */}
      <header className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.8)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><QoraxLogo size="sm" /></Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <Link href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <ArrowLeft size={13} /> Сайти
            </Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <span className="text-sm text-[var(--text-primary)] truncate max-w-[180px]">{site.display_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/dashboard/sites/${site.id}/competitor`}
              className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors hidden sm:block">
              Конкуренти
            </Link>
            <a href={site.url} target="_blank" rel="noopener noreferrer"
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5">
              <ExternalLink size={14} />
            </a>
            <ReportButton siteId={site.id} />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-5">

        {/* ── Site hero ── */}
        <div className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-4"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-4 flex-1 min-w-0">
            {/* Status badge */}
            <div className="relative shrink-0">
              <div className="h-11 w-11 rounded-xl flex items-center justify-center"
                style={{
                  background: isUp ? "rgba(214,255,63,0.08)" : "rgba(245,103,90,0.08)",
                  border: `1px solid ${isUp ? "rgba(214,255,63,0.2)" : "rgba(245,103,90,0.2)"}`,
                }}>
                <Activity size={18} style={{ color: isUp ? "var(--lime)" : "#F5675A" }} />
              </div>
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full"
                style={{ background: isUp ? "var(--lime)" : "#F5675A", boxShadow: `0 0 8px ${isUp ? "rgba(214,255,63,0.5)" : "rgba(245,103,90,0.5)"}` }}>
                {isUp && <div className="absolute inset-0 rounded-full animate-ping" style={{ background: "var(--lime)", opacity: 0.3 }} />}
              </div>
            </div>
            <div className="min-w-0">
              <h1 className="font-display text-lg sm:text-xl font-semibold truncate">{site.display_name}</h1>
              <p className="text-xs font-mono text-[var(--text-tertiary)] mt-0.5 truncate">{hostname}</p>
            </div>
          </div>

          {/* Quick stat pills */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            <StatPill
              label="Uptime"
              value={uptimePct ? `${uptimePct}%` : "—"}
              color={uptimePct && parseFloat(uptimePct) >= 99 ? "lime" : "orange"}
            />
            <StatPill
              label="Швидкість"
              value={fmtMs(latestSpeed?.load_time_ms ?? null)}
              color={(latestSpeed?.load_time_ms ?? 9999) <= 1500 ? "lime" : (latestSpeed?.load_time_ms ?? 9999) <= 3000 ? "orange" : "red"}
            />
            <StatPill
              label="SSL"
              value={sslOk ? "OK" : ssl ? "⚠" : "—"}
              color={sslOk ? "lime" : "red"}
            />
            {criticalInsights > 0 && (
              <StatPill label="AI Issues" value={`${criticalInsights} крит.`} color="red" />
            )}
          </div>
        </div>

        {/* ── Uptime monitor ── */}
        <Section icon={<Activity size={14} />} title="Живий моніторинг">
          <LiveUptimePanel
            siteId={site.id}
            initialChecks={uptimeChecks}
            initialIsUp={isUp}
            supabaseUrl={supabaseUrl}
            supabaseAnonKey={supabaseAnonKey}
          />
        </Section>

        {/* ── Speed trend ── */}
        <Section
          icon={<TrendingUp size={14} />}
          title="Час відповіді"
          badge={latestSpeed ? fmtMs(latestSpeed.load_time_ms) : undefined}
          badgeColor="mono"
        >
          <SpeedChart checks={speedChecks} />
          {speedChecks.length > 0 && (
            <p className="text-xs text-[var(--text-tertiary)] mt-3">
              Останні {speedChecks.length} замірів · щоденний скан о 3:00
            </p>
          )}
        </Section>

        {/* ── Core Web Vitals ── */}
        <Section icon={<Zap size={14} />} title="PageSpeed Insights">
          {mobileCwv || desktopCwv ? (
            <div className="grid sm:grid-cols-2 gap-5">
              {mobileCwv && <CwvBlock label="📱 Мобільний" data={mobileCwv} />}
              {desktopCwv && <CwvBlock label="🖥 Десктоп" data={desktopCwv} />}
            </div>
          ) : (
            <EmptySlot text="Дані з'являться після першого щоденного скану (о 3:00)" />
          )}
        </Section>

        {/* ── AI Insights ── */}
        <Section icon={<Sparkles size={14} />} title="AI Revenue Impact" accent="cyan">
          {aiInsights.length > 0 ? (
            <div className="space-y-3">
              {aiInsights.map((insight, i) => <InsightCard key={i} insight={insight} />)}
            </div>
          ) : (
            <EmptySlot text="AI-інсайти з'являться після першого повного сканування" />
          )}
        </Section>

        {/* ── SEO Audit ── */}
        <Section
          icon={<Search size={14} />}
          title="SEO аудит"
          badge={seoAudit ? fmtDate(seoAudit.checked_at) : undefined}
          badgeColor="mono"
        >
          {seoAudit ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <SeoCell label="Title" length={seoAudit.title_length} min={30} max={60} exists={!!seoAudit.title} />
                <SeoCell label="Description" length={seoAudit.meta_description_length} min={70} max={160} exists={!!seoAudit.meta_description} />
                <SeoCheckCell label="H1"
                  ok={seoAudit.has_h1 && seoAudit.h1_count === 1}
                  warn={seoAudit.has_h1 && seoAudit.h1_count > 1}
                  value={seoAudit.has_h1 ? `${seoAudit.h1_count} шт.` : "Немає"}
                />
                <SeoCheckCell label="Schema"
                  ok={seoAudit.has_schema_markup}
                  warn={false}
                  value={seoAudit.has_schema_markup ? "✓ OK" : "Немає"}
                />
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
                        <p className="text-sm text-[var(--text-secondary)]">{issue}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5 rounded-xl px-4 py-3"
                    style={{ background: "rgba(214,255,63,0.05)", border: "1px solid rgba(214,255,63,0.15)" }}>
                    <CheckCircle size={13} style={{ color: "var(--lime)" }} />
                    <p className="text-sm text-[var(--text-secondary)]">SEO мета-теги в нормі</p>
                  </div>
                );
              })()}

              {sitemapAudit && (
                <div className="grid grid-cols-2 gap-2.5">
                  <SitemapCell
                    label="sitemap.xml"
                    found={sitemapAudit.sitemap_found}
                    value={sitemapAudit.sitemap_found ? `${sitemapAudit.urls_in_sitemap ?? "?"} URL` : "Не знайдено"}
                    danger={!sitemapAudit.sitemap_found}
                  />
                  <SitemapCell
                    label="robots.txt"
                    found={sitemapAudit.robots_found && !sitemapAudit.robots_blocks_important_pages}
                    value={!sitemapAudit.robots_found ? "Не знайдено" : sitemapAudit.robots_blocks_important_pages ? "Блокує індексацію" : "OK"}
                    danger={sitemapAudit.robots_blocks_important_pages}
                  />
                </div>
              )}
            </div>
          ) : (
            <EmptySlot text="SEO аудит запускається щодня о 3:00" />
          )}
        </Section>

        {/* ── Broken Links ── */}
        <Section
          icon={<AlertTriangle size={14} />}
          title="Биті посилання"
          badge={brokenLinks.length > 0 ? `${brokenLinks.length} активних` : undefined}
          badgeColor="red"
        >
          {brokenLinks.length > 0 ? (
            <div className="space-y-2">
              {brokenLinks.map((link, i) => (
                <div key={link.id ?? i} className="flex items-center justify-between gap-4 rounded-xl px-4 py-2.5"
                  style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-xs font-mono truncate min-w-0 text-[var(--text-secondary)]">
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
        <Section icon={<Shield size={14} />} title="SSL сертифікат">
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
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
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
          <Section
            icon={<Eye size={14} />}
            title="Конкуренти"
            action={<Link href={`/dashboard/sites/${id}/competitor`} className="text-xs transition-opacity hover:opacity-70" style={{ color: "var(--cyan)" }}>Налаштувати →</Link>}
          >
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
                      <p className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5 truncate">{comp.url}</p>
                    </div>
                    <div className="shrink-0 ml-4">
                      {changed ? (
                        <span className="text-xs px-2.5 py-1 rounded-lg font-medium"
                          style={{ background: "rgba(245,166,35,0.1)", color: "#F5A623", border: "1px solid rgba(245,166,35,0.2)" }}>
                          ● Зміни
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--text-tertiary)]">Без змін</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {/* ── Reports ── */}
        <Section icon={<FileText size={14} />} title="PDF звіти">
          {reports.length > 0 ? (
            <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
              {reports.map((r) => <ReportRow key={r.id} report={r} />)}
            </div>
          ) : (
            <EmptySlot text="Перший місячний звіт згенерується автоматично в кінці місяця" />
          )}
        </Section>

      </main>

      <QoraxusChat siteId={site.id} siteName={site.display_name} accessToken={accessToken} />
    </div>
  );
}

// ─── Layout primitives ─────────────────────────────────────────

function Section({ icon, title, badge, badgeColor, accent, action, children }: {
  icon: React.ReactNode;
  title: string;
  badge?: string;
  badgeColor?: "mono" | "red" | "lime" | "cyan";
  accent?: "cyan" | "lime";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const badgeStyle = badgeColor === "red"
    ? { background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }
    : badgeColor === "lime"
    ? { background: "rgba(214,255,63,0.08)", color: "var(--lime)", border: "1px solid rgba(214,255,63,0.15)" }
    : badgeColor === "cyan"
    ? { background: "rgba(140,246,255,0.08)", color: "var(--cyan)", border: "1px solid rgba(140,246,255,0.15)" }
    : { color: "var(--text-tertiary)" };

  const accentBorder = accent === "cyan" ? "rgba(140,246,255,0.1)" : accent === "lime" ? "rgba(214,255,63,0.1)" : "rgba(255,255,255,0.06)";
  const accentBg = accent ? `rgba(${accent === "cyan" ? "140,246,255" : "214,255,63"},0.02)` : "rgba(255,255,255,0.02)";

  return (
    <div className="rounded-2xl p-5 sm:p-6"
      style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2.5">
          <span className="text-[var(--text-tertiary)]">{icon}</span>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {badge && (
            <span className="text-xs font-mono px-2.5 py-1 rounded-lg" style={badgeStyle}>{badge}</span>
          )}
          {action}
        </div>
      </div>
      {children}
    </div>
  );
}

function StatPill({ label, value, color }: { label: string; value: string; color: "lime" | "orange" | "red" | "mono" }) {
  const styles = {
    lime: { background: "rgba(214,255,63,0.08)", color: "var(--lime)", border: "1px solid rgba(214,255,63,0.2)" },
    orange: { background: "rgba(245,166,35,0.08)", color: "#F5A623", border: "1px solid rgba(245,166,35,0.2)" },
    red: { background: "rgba(245,103,90,0.08)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" },
    mono: { background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)", border: "1px solid rgba(255,255,255,0.08)" },
  };
  return (
    <div className="rounded-lg px-3 py-1.5" style={styles[color]}>
      <p className="text-[10px] font-mono text-[var(--text-tertiary)] mb-0.5">{label}</p>
      <p className="text-sm font-semibold leading-none">{value}</p>
    </div>
  );
}

// ─── Chart ─────────────────────────────────────────────────────

function SpeedChart({ checks }: { checks: { load_time_ms: number }[] }) {
  if (!checks.length) return <EmptySlot text="Дані з'являться після першого сканування" />;
  const vals = [...checks].reverse().map((c) => c.load_time_ms);
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-0.5 h-16 mt-1">
      {vals.slice(-60).map((v, i) => (
        <div key={i} className="flex-1 rounded-sm transition-opacity hover:opacity-80 min-w-[3px]"
          style={{
            height: `${Math.max((v / max) * 100, 4)}%`,
            background: v > 3000 ? "#F5675A" : v > 1500 ? "#F5A623" : "var(--lime)",
            opacity: 0.7 + (i / vals.length) * 0.3,
          }}
          title={`${v}мс`} />
      ))}
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
      <p className="text-xs text-[var(--text-tertiary)] mb-3">{label}</p>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-4xl font-display font-bold" style={{ color }}>{score ?? "—"}</span>
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
    <div className="rounded-lg px-2 py-2 text-center"
      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5">{label}</p>
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
      <p className="text-xs text-[var(--text-tertiary)] mb-2">{label}</p>
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
      <p className="text-xs text-[var(--text-tertiary)] mb-2">{label}</p>
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
      <p className="text-xs text-[var(--text-tertiary)] mb-1.5">{label}</p>
      <div className="flex items-center gap-1.5">
        {found ? <CheckCircle size={12} style={{ color }} /> : <AlertTriangle size={12} style={{ color }} />}
        <span className="text-sm font-medium" style={{ color: found ? "var(--text-primary)" : color }}>{value}</span>
      </div>
    </div>
  );
}

// ─── AI Insight card ───────────────────────────────────────────

function InsightCard({ insight }: {
  insight: {
    severity: string; problem_summary: string; plain_explanation: string;
    estimated_monthly_loss_usd: number | null; recommendation: string;
  };
}) {
  const crit = insight.severity === "critical";
  const warn = insight.severity === "warning";
  const accentColor = crit ? "#F5675A" : warn ? "#F5A623" : "var(--cyan)";
  const accentRgb = crit ? "245,103,90" : warn ? "245,166,35" : "140,246,255";
  return (
    <div className="rounded-xl p-4"
      style={{ background: `rgba(${accentRgb},0.04)`, border: `1px solid rgba(${accentRgb},0.15)` }}>
      <div className="flex items-center gap-2.5 mb-2">
        <span className="text-xs font-mono font-semibold uppercase" style={{ color: accentColor }}>
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
      <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{insight.plain_explanation}</p>
      <p className="text-xs text-[var(--text-tertiary)] mt-3 flex items-center gap-1">
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
          <FileText size={13} className="text-[var(--text-tertiary)]" />
        </div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{fmtDate(report.created_at)}</p>
        </div>
      </div>
      {report.pdf_url && (
        <a href={report.pdf_url} target="_blank" rel="noopener noreferrer"
          className="text-xs font-semibold px-3 py-1.5 rounded-lg hover:opacity-80 transition-opacity"
          style={{ background: "rgba(140,246,255,0.08)", border: "1px solid rgba(140,246,255,0.15)", color: "var(--cyan)" }}>
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
      <Clock size={13} className="text-[var(--text-tertiary)] shrink-0" />
      <p className="text-sm text-[var(--text-tertiary)]">{text}</p>
    </div>
  );
}

// Unused but kept
const _unused = { Activity, Clock };
void _unused;
