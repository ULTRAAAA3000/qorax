"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Clock, AlertTriangle } from "lucide-react";

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

const REFRESH_INTERVAL_MS = 30_000;
const BAR_COUNT = 48; // відображаємо останні 48 перевірок (~4 год при 5хв)

export function LiveUptimePanel({
  siteId,
  initialChecks,
  initialIsUp,
  supabaseUrl,
  supabaseAnonKey,
}: LiveUptimePanelProps) {
  const [checks, setChecks] = useState<UptimeCheck[]>(initialChecks);
  const [isUp, setIsUp] = useState(initialIsUp);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [refreshing, setRefreshing] = useState(false);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const resp = await fetch(
        `${supabaseUrl}/rest/v1/uptime_checks?select=status,response_time_ms,checked_at&site_id=eq.${siteId}&order=checked_at.desc&limit=288`,
        {
          headers: {
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        }
      );
      if (!resp.ok) return;
      const data = (await resp.json()) as UptimeCheck[];
      setChecks(data);
      setIsUp(data[0]?.status === "up");
      setLastRefreshed(new Date());
    } catch { /* network error — keep old data */ } finally {
      setRefreshing(false);
    }
  }, [siteId, supabaseUrl, supabaseAnonKey]);

  useEffect(() => {
    const interval = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const uptimePct = calcUptimePct(checks);
  const latestMs = checks[0]?.response_time_ms ?? null;
  const displayChecks = checks.slice(0, BAR_COUNT).reverse();

  return (
    <div className="space-y-4">
      {/* Status banner */}
      {!isUp && (
        <div
          className="rounded-2xl border px-5 py-4 flex items-center gap-3"
          style={{ borderColor: "#F5675A", background: "rgba(245,103,90,0.08)" }}
        >
          <AlertTriangle size={16} style={{ color: "#F5675A" }} className="shrink-0" />
          <p className="text-sm">
            <span style={{ color: "#F5675A" }} className="font-medium">
              Сайт недоступний
            </span>
          </p>
        </div>
      )}

      {/* Stat cards row */}
      <div className="grid grid-cols-2 gap-3">
        <div
          className="rounded-2xl border p-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-hairline)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Activity size={14} className="text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-tertiary)]">Uptime 24г</span>
          </div>
          <p
            className="font-display text-2xl font-bold"
            style={{ color: isUp ? "var(--lime)" : "#F5675A" }}
          >
            {uptimePct}
          </p>
        </div>

        <div
          className="rounded-2xl border p-4"
          style={{ background: "var(--bg-raised)", borderColor: "var(--border-hairline)" }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Clock size={14} className="text-[var(--text-tertiary)]" />
            <span className="text-xs text-[var(--text-tertiary)]">Відповідь</span>
          </div>
          <p className="font-display text-2xl font-bold">
            {latestMs != null ? `${latestMs}мс` : "—"}
          </p>
        </div>
      </div>

      {/* Uptime bar chart */}
      <div
        className="rounded-2xl border p-5"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border-hairline)" }}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-medium flex items-center gap-2">
            <Activity size={14} className="text-[var(--text-tertiary)]" />
            Uptime (останні 4г)
          </span>
          <div className="flex items-center gap-3">
            {/* Live pulse */}
            <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{
                  background: isUp ? "var(--lime)" : "#F5675A",
                  animation: "pulse 2s infinite",
                }}
              />
              {isUp ? "Онлайн" : "Офлайн"}
            </span>
            <span
              className="text-xs font-mono"
              style={{ color: refreshing ? "var(--lime)" : "var(--text-tertiary)", opacity: refreshing ? 1 : 0.5 }}
            >
              {refreshing ? "↻" : `↻ ${fmtTimeAgo(lastRefreshed)}`}
            </span>
          </div>
        </div>

        {/* Bars */}
        <div className="flex items-end gap-0.5 h-10">
          {displayChecks.length === 0
            ? Array.from({ length: BAR_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm"
                  style={{ height: "100%", background: "var(--bg)", opacity: 0.3 }}
                />
              ))
            : displayChecks.map((check, i) => (
                <div
                  key={i}
                  title={`${fmtCheckedAt(check.checked_at)} — ${check.status === "up" ? `${check.response_time_ms}мс` : "Офлайн"}`}
                  className="flex-1 rounded-sm transition-colors"
                  style={{
                    height: check.status === "up"
                      ? `${calcBarHeight(check.response_time_ms)}%`
                      : "100%",
                    minHeight: "20%",
                    background: check.status === "up" ? "var(--lime)" : "#F5675A",
                    opacity: check.status === "up" ? 0.85 : 1,
                  }}
                />
              ))}
        </div>

        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Кожен блок = 5 хвилин · {checks.length} перевірок · оновлення кожні 30с
        </p>
      </div>
    </div>
  );
}

// ─── Utils ───────────────────────────────────────────────────

function calcUptimePct(checks: UptimeCheck[]): string {
  if (!checks.length) return "—";
  const upCount = checks.filter((c) => c.status === "up").length;
  return `${((upCount / checks.length) * 100).toFixed(1)}%`;
}

function calcBarHeight(ms: number | null): number {
  if (ms == null) return 30;
  // нормалізуємо: <200мс = 40%, 200-1000мс = 40-85%, >1000мс = 85-100%
  if (ms < 200) return 40;
  if (ms < 1000) return 40 + ((ms - 200) / 800) * 45;
  return Math.min(100, 85 + ((ms - 1000) / 2000) * 15);
}

function fmtTimeAgo(date: Date): string {
  const secs = Math.round((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return "щойно";
  if (secs < 60) return `${secs}с тому`;
  return `${Math.round(secs / 60)}хв тому`;
}

function fmtCheckedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("uk-UA", {
    hour: "2-digit",
    minute: "2-digit",
  });
}
