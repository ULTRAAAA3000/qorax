import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import {
  Activity, Zap, Shield, AlertTriangle, CheckCircle,
  Clock, ExternalLink, Sparkles,
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
import { SidebarNavLink } from "./SidebarNavLink";
import { IncidentTimeline } from "./IncidentTimeline";
import { getSiteDetailData } from "./getSiteDetailData";
import { FixRequestButton } from "./FixRequestButton";
import {
  KpiTile, Section, SpeedLineChart, CwvBlock, SeoCell, SeoCheckCell,
  SitemapCell, InsightCard, ReportRow, EmptySlot, fmtDate,
} from "./SiteDetailUI";

export const dynamic = "force-dynamic";
export const metadata = { title: "Моніторинг сайту — Qorax" };

function fmtMs(ms: number | null) {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
}

export default async function SiteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSiteDetailData(id);

  if ("redirectToLogin" in data) redirect("/login");
  if ("notFound" in data) notFound();

  const {
    site, hostname, accessToken, canUseGsc, statusPageData,
    uptimeChecks, speedChecks, ssl,
    aiInsights, reports, seoAudit, sitemapAudit, competitors,
    competitorChanges, brokenLinks, historyIncidents,
    isUp, latestSpeed, mobileCwv, desktopCwv,
    supabaseUrl, supabaseAnonKey, workerUrl,
    uptimePct, sslOk, seoIssueCount,
  } = data;

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
              <SidebarNavLink key={item.id} href={`#${item.id}`} label={item.label} icon={item.icon}
                badge={item.badge} badgeRed={item.badgeRed} />
            ))}

            <p className="text-[10px] font-medium uppercase tracking-widest px-2 mt-4 mb-2"
              style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>SEO & Аналітика</p>
            {navItems.slice(4, 7).map(item => (
              <SidebarNavLink key={item.id} href={`#${item.id}`} label={item.label} icon={item.icon}
                badge={item.badge} badgeRed={item.badgeRed} />
            ))}

            <p className="text-[10px] font-medium uppercase tracking-widest px-2 mt-4 mb-2"
              style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}>Безпека & Інше</p>
            {navItems.slice(7).map(item => (
              <SidebarNavLink key={item.id} href={`#${item.id}`} label={item.label} icon={item.icon}
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
                {aiInsights.map((insight, i) => (
                  <InsightCard key={insight.id ?? i} insight={insight} siteId={site.id} canOrderFix={canUseGsc} />
                ))}
              </div>
            ) : (
              <EmptySlot text="AI-інсайти з'являться після першого повного сканування" />
            )}
            {canUseGsc && (
              <div className="mt-4 pt-4" style={{ borderTop: "1px solid var(--border-hairline)" }}>
                <FixRequestButton siteId={site.id} variant="full" />
              </div>
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
