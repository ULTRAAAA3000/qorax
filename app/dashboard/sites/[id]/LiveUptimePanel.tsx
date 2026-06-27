"use client";

import { useState, useEffect, useCallback } from "react";
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

        {/* Line chart */}
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
  const W = 480;
  const H = 72;
  const PAD = { top: 6, bottom: 6, left: 0, right: 0 };

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

  // Normalize response times for Y axis
  const upPoints = points.filter(p => p.status === "up" && p.response_time_ms != null);
  const maxMs = upPoints.length > 0
    ? Math.max(...upPoints.map(p => p.response_time_ms!), 500)
    : 500;

  const chartH = H - PAD.top - PAD.bottom;
  const chartW = W - PAD.left - PAD.right;

  const coords = points.map((p, i) => {
    const x = PAD.left + (i / (points.length - 1)) * chartW;
    const ms = p.response_time_ms ?? maxMs;
    const y = p.status === "up"
      ? PAD.top + chartH - (ms / maxMs) * chartH * 0.85 - chartH * 0.1
      : PAD.top + chartH - 2;
    return { x, y, up: p.status === "up", ms: p.response_time_ms, time: p.checked_at };
  });

  // Build smooth path using cubic bezier
  const linePath = coords.reduce((acc, pt, i) => {
    if (i === 0) return `M ${pt.x} ${pt.y}`;
    const prev = coords[i - 1];
    const cpx = (prev.x + pt.x) / 2;
    return `${acc} C ${cpx} ${prev.y} ${cpx} ${pt.y} ${pt.x} ${pt.y}`;
  }, "");

  // Area fill path
  const areaPath = `${linePath} L ${coords[coords.length - 1].x} ${H} L ${coords[0].x} ${H} Z`;

  const color = isUp ? "#D6FF3F" : "#F5675A";
  const gradId = `uptime-grad-${isUp ? "up" : "down"}`;
  const glowId = `uptime-glow`;

  // Offline segments as red overlays
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

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, display: "block", overflow: "visible" }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
          <filter id={glowId} x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Offline zones */}
        {offlineRanges.map((r, i) => (
          <rect
            key={i}
            x={r.x1} y={0}
            width={Math.max(r.x2 - r.x1, 4)} height={H}
            fill="rgba(245,103,90,0.08)"
            rx="2"
          />
        ))}

        {/* Grid lines */}
        {[0.25, 0.5, 0.75].map(y => (
          <line
            key={y}
            x1={0} y1={PAD.top + chartH * (1 - y)}
            x2={W} y2={PAD.top + chartH * (1 - y)}
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="1"
          />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Main line */}
        <path
          d={linePath}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter={`url(#${glowId})`}
          style={{ opacity: 0.9 }}
        />

        {/* Latest point dot */}
        {coords.length > 0 && (
          <>
            <circle
              cx={coords[coords.length - 1].x}
              cy={coords[coords.length - 1].y}
              r="3"
              fill={color}
              filter={`url(#${glowId})`}
            />
            <circle
              cx={coords[coords.length - 1].x}
              cy={coords[coords.length - 1].y}
              r="6"
              fill="none"
              stroke={color}
              strokeWidth="1"
              opacity="0.3"
            />
          </>
        )}
      </svg>
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
