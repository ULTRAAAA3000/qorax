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
const BARS = 48;

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
      // Використовуємо Supabase client з сесією — обходить RLS через авторизований токен
      const supabase = createClient();
      const { data, error } = await supabase
        .from("uptime_checks")
        .select("status, response_time_ms, checked_at")
        .eq("site_id", siteId)
        .order("checked_at", { ascending: false })
        .limit(288);

      if (error || !data) return; // тримаємо старі дані при помилці
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
  const bars = checks.slice(0, BARS).reverse();

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
            {/* live dot */}
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

        {/* Bars */}
        <div className="flex items-end gap-px h-9">
          {bars.length === 0
            ? Array.from({ length: BARS }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-[2px]"
                  style={{ height: "30%", background: "var(--bg)", opacity: 0.4 }}
                />
              ))
            : bars.map((c, i) => (
                <div
                  key={i}
                  title={`${fmtTime(c.checked_at)} · ${c.status === "up" ? `${c.response_time_ms}мс` : "Офлайн"}`}
                  className="flex-1 rounded-[2px] transition-colors"
                  style={{
                    height: c.status === "up" ? `${barH(c.response_time_ms)}%` : "100%",
                    minHeight: "18%",
                    background: c.status === "up" ? "var(--lime)" : "#F5675A",
                    opacity: c.status === "up" ? 0.8 : 1,
                  }}
                />
              ))}
        </div>
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

function calcPct(checks: UptimeCheck[]): string {
  if (!checks.length) return "—";
  const up = checks.filter(c => c.status === "up").length;
  return `${((up / checks.length) * 100).toFixed(1)}%`;
}

function barH(ms: number | null): number {
  if (ms == null) return 30;
  if (ms < 200) return 35;
  if (ms < 1000) return 35 + ((ms - 200) / 800) * 45;
  return Math.min(100, 80 + ((ms - 1000) / 2000) * 20);
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
