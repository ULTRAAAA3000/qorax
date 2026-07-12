"use client";

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, Search, MousePointer, Eye, BarChart2, RefreshCw, ExternalLink, Unlink } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface GscMetric {
  date: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  average_position: number | null;
  page_url: string | null;
  query: string | null;
}

interface Props {
  siteId: string;
  accessToken: string;
  workerUrl: string;
}

function fmt(n: number | null, digits = 0): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("uk-UA", { maximumFractionDigits: digits });
}
function fmtCtr(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmtPos(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1);
}

export function GscPanel({ siteId, accessToken, workerUrl }: Props) {
  const [status, setStatus] = useState<{
    connected: boolean;
    property_url: string | null;
    last_synced_at: string | null;
  } | null>(null);
  const [metrics, setMetrics] = useState<GscMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/gsc/status?site_id=${siteId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({ connected: false, property_url: null, last_synced_at: null });
    }
  }, [siteId, accessToken]);

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await fetch(`${workerUrl}/api/gsc/metrics?site_id=${siteId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) { setMetrics([]); return; }
      const data = await res.json() as GscMetric[];
      setMetrics(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("GSC metrics exception:", e);
      setMetrics([]);
    }
  }, [siteId, accessToken, workerUrl]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([fetchStatus(), fetchMetrics()]);
      setLoading(false);
    })();
  }, [fetchStatus, fetchMetrics]);

  async function handleSync() {
    setSyncing(true);
    try {
      await fetch(`${API_BASE_URL}/api/gsc/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId }),
      });
      await Promise.all([fetchStatus(), fetchMetrics()]);
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Відключити Google Search Console? Всі дані GSC для цього сайту буде видалено.")) return;
    setDisconnecting(true);
    try {
      await fetch(`${API_BASE_URL}/api/gsc/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ site_id: siteId }),
      });
      setStatus({ connected: false, property_url: null, last_synced_at: null });
      setMetrics([]);
    } finally {
      setDisconnecting(false);
    }
  }

  function handleConnect() {
    const authUrl = `${workerUrl}/api/gsc/auth?site_id=${encodeURIComponent(siteId)}&access_token=${encodeURIComponent(accessToken)}`;
    window.location.href = authUrl;
  }

  // ── Derived data ────────────────────────────────────────────────
  const dailyRows = metrics.filter((m) => !m.page_url && !m.query).sort((a, b) => a.date.localeCompare(b.date));
  const pageRows = metrics.filter((m) => !!m.page_url && !m.query).sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  const queryRows = metrics.filter((m) => !!m.query && !m.page_url).sort((a, b) => b.clicks - a.clicks).slice(0, 10);

  const totalClicks = dailyRows.reduce((s, r) => s + r.clicks, 0);
  const totalImpressions = dailyRows.reduce((s, r) => s + r.impressions, 0);
  const avgCtr = dailyRows.length ? dailyRows.reduce((s, r) => s + (r.ctr ?? 0), 0) / dailyRows.length : null;
  const avgPos = dailyRows.length ? dailyRows.reduce((s, r) => s + (r.average_position ?? 0), 0) / dailyRows.length : null;

  if (loading) {
    return (
      <div className="rounded-2xl p-6 flex items-center justify-center h-32"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="h-4 w-4 rounded-full border-2 animate-spin"
          style={{ borderColor: "var(--lime)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // ── Not connected ────────────────────────────────────────────────
  if (!status?.connected) {
    return (
      <div className="rounded-2xl p-6 text-center"
        style={{ background: "rgba(140,246,255,0.02)", border: "1px solid rgba(140,246,255,0.1)" }}>
        <div className="h-12 w-12 rounded-xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(140,246,255,0.08)", border: "1px solid rgba(140,246,255,0.15)" }}>
          <Search size={20} style={{ color: "var(--cyan)" }} />
        </div>
        <h3 className="font-display font-semibold mb-2">Підключіть Google Search Console</h3>
        <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-xs mx-auto leading-relaxed">
          Отримайте дані про кліки, покази, CTR та позиції у пошуку прямо від Google.
        </p>
        <button
          onClick={handleConnect}
          className="inline-flex items-center gap-2 text-sm font-semibold px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80"
          style={{ background: "rgba(140,246,255,0.1)", border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Підключити Google Search Console
        </button>
        <p className="text-xs text-[var(--text-tertiary)] mt-4">
          Потрібно підтвердити права на property в GSC
        </p>
      </div>
    );
  }

  // ── Connected — metrics dashboard ────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-mono text-[var(--text-tertiary)]">
            {status.property_url}
          </p>
          {status.last_synced_at && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              Оновлено {new Date(status.last_synced_at).toLocaleString("uk-UA", {
                day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
              })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSync}
            disabled={syncing}
            className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
            style={{ color: "var(--text-tertiary)" }}
            title="Синхронізувати"
          >
            <RefreshCw size={13} className={syncing ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:bg-white/5 disabled:opacity-50"
            style={{ color: "var(--text-tertiary)" }}
            title="Відключити GSC"
          >
            <Unlink size={13} />
          </button>
        </div>
      </div>

      {/* Summary stat pills */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <StatCard icon={<MousePointer size={13} />} label="Кліки (28д)" value={fmt(totalClicks)} color="lime" />
        <StatCard icon={<Eye size={13} />} label="Покази (28д)" value={fmt(totalImpressions)} color="cyan" />
        <StatCard icon={<BarChart2 size={13} />} label="Середній CTR" value={fmtCtr(avgCtr)} color="lime" />
        <StatCard icon={<TrendingUp size={13} />} label="Середня позиція" value={fmtPos(avgPos)} color="cyan" />
      </div>

      {/* Clicks chart */}
      {dailyRows.length > 0 && (() => {
        const vals = dailyRows.map(r => r.clicks);
        const maxV = Math.max(...vals, 1);
        const minV = Math.min(...vals);
        const range = maxV - minV || 1;
        const W = 600; const H = 72;
        const pad = { t: 6, b: 6 };
        const pts = vals.map((v, i) => ({
          x: (i / Math.max(vals.length - 1, 1)) * W,
          y: pad.t + (1 - (v - minV) / range) * (H - pad.t - pad.b),
          v,
        }));
        const pathD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        const areaD = pathD + ` L${pts[pts.length - 1].x},${H} L0,${H} Z`;
        return (
          <div className="rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
              <MousePointer size={11} /> Кліки за 28 днів
            </p>
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 72, overflow: "visible" }}>
              <defs>
                <linearGradient id="gscGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#D6FF3F" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#D6FF3F" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={areaD} fill="url(#gscGrad)" />
              <path d={pathD} fill="none" stroke="#D6FF3F" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              <circle cx={pts[pts.length - 1].x} cy={pts[pts.length - 1].y} r="3" fill="#D6FF3F" />
            </svg>
            <div className="flex justify-between mt-1.5">
              <span className="text-[10px] text-[var(--text-tertiary)]">{dailyRows[0]?.date}</span>
              <span className="text-[10px] text-[var(--text-tertiary)]">{dailyRows[dailyRows.length - 1]?.date}</span>
            </div>
          </div>
        );
      })()}

      {/* Top pages + Top queries side by side */}
      <div className="grid sm:grid-cols-2 gap-3">
        {/* Top pages */}
        <div className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-primary)]">
            <ExternalLink size={11} style={{ color: "var(--lime)" }} /> Топ сторінок
          </p>
          {pageRows.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Дані з&apos;являться після синхронізації</p>
          ) : (
            <div className="space-y-2.5">
              {pageRows.map((row, i) => {
                let label = row.page_url ?? "";
                try { label = new URL(label).pathname || "/"; } catch { /* keep */ }
                return (
                  <div key={i} className="flex items-center justify-between gap-2">
                    <p className="text-xs text-[var(--text-secondary)] truncate min-w-0"
                      title={row.page_url ?? ""}>{label}</p>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs font-mono" style={{ color: "var(--lime)" }}>{fmt(row.clicks)}</span>
                      <span className="text-[10px] text-[var(--text-tertiary)]">/{fmt(row.impressions)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top queries */}
        <div className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs font-semibold mb-3 flex items-center gap-1.5 text-[var(--text-primary)]">
            <Search size={11} style={{ color: "var(--cyan)" }} /> Топ запитів
          </p>
          {queryRows.length === 0 ? (
            <p className="text-xs text-[var(--text-tertiary)]">Дані з&apos;являться після синхронізації</p>
          ) : (
            <div className="space-y-2.5">
              {queryRows.map((row, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <p className="text-xs text-[var(--text-secondary)] truncate min-w-0"
                    title={row.query ?? ""}>{row.query}</p>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono" style={{ color: "var(--cyan)" }}>{fmt(row.clicks)}</span>
                    <span className="text-[10px] text-[var(--text-tertiary)]">pos {fmtPos(row.average_position)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: "lime" | "cyan";
}) {
  const c = color === "lime" ? "var(--lime)" : "var(--cyan)";
  const bg = color === "lime" ? "rgba(214,255,63,0.04)" : "rgba(140,246,255,0.04)";
  const border = color === "lime" ? "rgba(214,255,63,0.1)" : "rgba(140,246,255,0.1)";
  return (
    <div className="rounded-xl p-3.5"
      style={{ background: bg, border: `1px solid ${border}` }}>
      <div className="flex items-center gap-1.5 mb-2" style={{ color: "var(--text-tertiary)" }}>
        {icon}
        <span className="text-[10px] font-mono">{label}</span>
      </div>
      <p className="font-display text-xl font-bold" style={{ color: c }}>{value}</p>
    </div>
  );
}
