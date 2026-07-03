import { AlertTriangle, CheckCircle, Clock, ChevronRight, FileText } from "lucide-react";

function scoreColor(score: number | null): string {
  if (score === null) return "var(--text-tertiary)";
  if (score >= 90) return "var(--lime)";
  if (score >= 50) return "#F5A623";
  return "#F5675A";
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("uk-UA", {
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

// ─── Sidebar primitives ────────────────────────────────────────

export function KpiTile({ label, value, ok }: { label: string; value: string; ok: boolean }) {
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

// ─── Section wrapper ───────────────────────────────────────────

export function Section({ id, icon, title, badge, badgeRed, accent, action, children }: {
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

export function SpeedLineChart({ checks }: { checks: { load_time_ms: number; checked_at: string }[] }) {
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

export function CwvBlock({ label, data }: {
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

export function SeoCell({ label, length, min, max, exists }: {
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

export function SeoCheckCell({ label, ok, warn, value }: { label: string; ok: boolean; warn: boolean; value: string }) {
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

export function SitemapCell({ label, found, value, danger }: { label: string; found: boolean; value: string; danger: boolean }) {
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

export function InsightCard({ insight }: {
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

export function ReportRow({ report }: {
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

export function EmptySlot({ text }: { text: string }) {
  return (
    <div className="rounded-xl px-4 py-4 flex items-center gap-2.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
      <Clock size={13} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{text}</p>
    </div>
  );
}
