"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Activity, Clock } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

interface UptimeCheck {
  status: string;
  response_time_ms: number | null;
  checked_at: string;
}

interface LiveUptimePanelProps {
  siteId: string;
  initialChecks: UptimeCheck[];
  initialIsUp: boolean;
  supabaseUrl: string;
  supabaseAnonKey: string;
}

const REFRESH_MS = 30_000;
const POINTS = 48;

export function LiveUptimePanel({
  siteId,
  initialChecks,
  initialIsUp,
}: LiveUptimePanelProps) {
  const [checks, setChecks] = useState<UptimeCheck[]>(initialChecks);
  const [isUp, setIsUp] = useState(initialIsUp);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [ticking, setTicking] = useState(false);

  const refresh = useCallback(async () => {
    setTicking(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("uptime_checks")
        .select("status, response_time_ms, checked_at")
        .eq("site_id", siteId)
        .order("checked_at", { ascending: false })
        .limit(288);

      if (error || !data) return;
      setChecks(data);
      setIsUp(data[0]?.status === "up");
      setLastRefreshed(new Date());
    } catch { /* keep old data */ } finally {
      setTicking(false);
    }
  }, [siteId]);

  useEffect(() => {
    const t = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(t);
  }, [refresh]);

  const uptimePct = calcPct(checks);
  const latestMs = checks[0]?.response_time_ms ?? null;
  const points = checks.slice(0, POINTS).reverse();

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {/* ── Uptime history ── */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border-hairline)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium flex items-center gap-2 text-[var(--text-primary)]">
            <Activity size={14} style={{ color: "var(--text-tertiary)" }} />
            Uptime (останні 4г)
          </span>
          <div className="flex items-center gap-2.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: isUp ? "var(--lime)" : "#F5675A",
                boxShadow: isUp
                  ? "0 0 6px rgba(214,255,63,0.6)"
                  : "0 0 6px rgba(245,103,90,0.6)",
                animation: "pulse 2s infinite",
              }}
            />
            <span
              className="text-xs font-mono"
              style={{ color: isUp ? "var(--lime)" : "#F5675A" }}
            >
              {isUp ? "Онлайн" : "Офлайн"}
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: "var(--text-tertiary)", opacity: 0.5 }}
            >
              ↻{ticking ? " …" : ` ${ago(lastRefreshed)}`}
            </span>
          </div>
        </div>

        <UptimeLineChart points={points} isUp={isUp} />

        <p className="text-xs text-[var(--text-tertiary)] mt-2.5">
          Кожен блок = 5 хв · {checks.length} перевірок · авто-оновлення 30с
        </p>
      </div>

      {/* ── Live stat cards ── */}
      <div className="flex flex-col gap-4">
        <div
          className="rounded-2xl border p-5 flex-1"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-hairline)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Activity size={14} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-xs text-[var(--text-tertiary)]">Uptime 24г</span>
          </div>
          <p
            className="font-display text-3xl font-bold tracking-tight"
            style={{ color: isUp ? "var(--lime)" : "#F5675A" }}
          >
            {uptimePct}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {checks.filter(c => c.status === "up").length} / {checks.length} перевірок
          </p>
        </div>

        <div
          className="rounded-2xl border p-5 flex-1"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-hairline)" }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Clock size={14} style={{ color: "var(--text-tertiary)" }} />
            <span className="text-xs text-[var(--text-tertiary)]">Остання відповідь</span>
          </div>
          <p className="font-display text-3xl font-bold tracking-tight">
            {latestMs != null ? (
              <>
                {latestMs}
                <span className="text-base font-normal text-[var(--text-tertiary)] ml-1">мс</span>
              </>
            ) : "—"}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {checks[0] ? fmtTime(checks[0].checked_at) : "немає даних"}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Line chart component ──────────────────────────────────────
function UptimeLineChart({ points, isUp }: { points: UptimeCheck[]; isUp: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    x: number; y: number; ms: number | null; time: string; up: boolean;
  } | null>(null);
  const [svgWidth, setSvgWidth] = useState(480);

  useEffect(() => {
    if (!svgRef.current) return;
    const obs = new ResizeObserver(entries => {
      setSvgWidth(entries[0].contentRect.width);
    });
    obs.observe(svgRef.current);
    return () => obs.disconnect();
  }, []);

  const H = 96;
  const PAD = { top: 10, bottom: 10, left: 4, right: 4 };

  if (points.length < 2) {
    return (
      <div
        className="rounded-xl flex items-center justify-center"
        style={{ height: H, background: "rgba(255,255,255,0.03)" }}
      >
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          Збираємо дані…
        </span>
      </div>
    );
  }

  const W = svgWidth;
  const upPoints = points.filter(p => p.status === "up" && p.response_time_ms != null);
  const maxMs = upPoints.length > 0
    ? Math.max(...upPoints.map(p => p.response_time_ms!), 200)
    : 200;
  const minMs = upPoints.length > 0
    ? Math.min(...upPoints.map(p => p.response_time_ms!))
    : 0;
  const range = Math.max(maxMs - minMs, 100);

  const chartH = H - PAD.top - PAD.bottom;
  const chartW = W - PAD.left - PAD.right;

  const coords = points.map((p, i) => {
    const x = PAD.left + (i / (points.length - 1)) * chartW;
    let y: number;
    if (p.status !== "up" || p.response_time_ms == null) {
      y = PAD.top + chartH - 2;
    } else {
      const norm = (p.response_time_ms - minMs) / range;
      y = PAD.top + chartH * 0.9 - norm * chartH * 0.8;
    }
    return { x, y, up: p.status === "up", ms: p.response_time_ms, time: p.checked_at };
  });

  // Smooth bezier path
  const linePath = coords.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
    const prev = coords[i - 1];
    const cpx = (prev.x + pt.x) / 2;
    return `${acc} C ${cpx.toFixed(1)} ${prev.y.toFixed(1)} ${cpx.toFixed(1)} ${pt.y.toFixed(1)} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`;
  }, "");

  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`;

  const color = isUp ? "#D6FF3F" : "#F5675A";
  const colorRgb = isUp ? "214,255,63" : "245,103,90";

  // Offline zones
  const offlineRanges: { x1: number; x2: number }[] = [];
  let rangeStart: number | null = null;
  coords.forEach((pt, i) => {
    if (!pt.up && rangeStart === null) rangeStart = pt.x;
    if (pt.up && rangeStart !== null) {
      offlineRanges.push({ x1: rangeStart, x2: coords[i - 1]?.x ?? pt.x });
      rangeStart = null;
    }
  });
  if (rangeStart !== null) offlineRanges.push({ x1: rangeStart, x2: coords[coords.length - 1].x });

  const lastPt = coords[coords.length - 1];

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    // Find nearest point
    let best = 0;
    let bestDist = Infinity;
    coords.forEach((pt, i) => {
      const d = Math.abs(pt.x - (mx / rect.width) * W);
      if (d < bestDist) { bestDist = d; best = i; }
    });
    const pt = coords[best];
    setTooltip({ x: pt.x, y: pt.y, ms: pt.ms, time: pt.time, up: pt.up });
  };

  return (
    <div style={{ position: "relative", userSelect: "none" }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        style={{ display: "block", overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="ug-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.22" />
            <stop offset="70%" stopColor={color} stopOpacity="0.04" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id="ug-glow" x="-20%" y="-100%" width="140%" height="300%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="ug-dot-glow" x="-200%" y="-200%" width="500%" height="500%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <clipPath id="ug-clip">
            <rect x={PAD.left} y={PAD.top} width={chartW} height={chartH} />
          </clipPath>
        </defs>

        {/* Subtle grid */}
        {[0.2, 0.5, 0.8].map(f => (
          <line
            key={f}
            x1={PAD.left} y1={PAD.top + chartH * f}
            x2={W - PAD.right} y2={PAD.top + chartH * f}
            stroke={`rgba(${colorRgb},0.06)`}
            strokeWidth="1"
            strokeDasharray="3 6"
          />
        ))}

        {/* Offline zones */}
        {offlineRanges.map((r, i) => (
          <rect
            key={i}
            x={r.x1} y={PAD.top}
            width={Math.max(r.x2 - r.x1, 3)} height={chartH}
            fill="rgba(245,103,90,0.07)"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#ug-area)" clipPath="url(#ug-clip)" />

        {/* Glow line (thicker, blurred) */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.15"
          clipPath="url(#ug-clip)"
        />

        {/* Main line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#ug-glow)"
          clipPath="url(#ug-clip)"
        />

        {/* Tooltip crosshair */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x} y1={PAD.top}
              x2={tooltip.x} y2={H - PAD.bottom}
              stroke={`rgba(${colorRgb},0.3)`}
              strokeWidth="1"
              strokeDasharray="3 4"
            />
            <circle
              cx={tooltip.x} cy={tooltip.y} r="3.5"
              fill={tooltip.up ? color : "#F5675A"}
              filter="url(#ug-dot-glow)"
            />
          </>
        )}

        {/* Live dot at end */}
        {!tooltip && (
          <>
            <circle cx={lastPt.x} cy={lastPt.y} r="8"
              fill={`rgba(${colorRgb},0.12)`} />
            <circle cx={lastPt.x} cy={lastPt.y} r="4"
              fill={`rgba(${colorRgb},0.25)`} />
            <circle cx={lastPt.x} cy={lastPt.y} r="2.5"
              fill={color}
              filter="url(#ug-dot-glow)" />
          </>
        )}
      </svg>

      {/* Tooltip box */}
      {tooltip && (
        <div
          style={{
            position: "absolute",
            top: Math.max(0, tooltip.y - 52),
            left: Math.min(tooltip.x + 10, svgWidth - 110),
            background: "rgba(15,15,20,0.92)",
            border: `1px solid rgba(${colorRgb},0.25)`,
            borderRadius: 8,
            padding: "6px 10px",
            pointerEvents: "none",
            whiteSpace: "nowrap",
            backdropFilter: "blur(8px)",
          }}
        >
          <div style={{ fontSize: 11, color: tooltip.up ? color : "#F5675A", fontWeight: 600 }}>
            {tooltip.up ? "● Онлайн" : "● Офлайн"}
            {tooltip.ms != null && (
              <span style={{ color: "var(--text-secondary)", fontWeight: 400, marginLeft: 6 }}>
                {tooltip.ms} мс
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginTop: 2 }}>
            {fmtTime(tooltip.time)}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────
function calcPct(checks: UptimeCheck[]): string {
  if (!checks.length) return "—";
  const up = checks.filter(c => c.status === "up").length;
  return `${((up / checks.length) * 100).toFixed(1)}%`;
}

function ago(date: Date): string {
  const s = Math.round((Date.now() - date.getTime()) / 1000);
  if (s < 5) return "щойно";
  if (s < 60) return `${s}с`;
  return `${Math.round(s / 60)}хв`;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
}
