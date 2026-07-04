"use client";
import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface BusinessMetrics {
  mrr: number;
  mrrGrowthPct: number | null;
  mrrByPlan: Record<string, { count: number; mrr: number }>;
  arpu: number;
  activeCount: number;
  trialingCount: number;
  pastDueCount: number;
  canceledCount: number;
  churnRatePct: number;
  churnRatePrevPct: number;
  canceledLast30dCount: number;
  conversionRatePct: number | null;
  endingSoonCount: number;
}

interface Props { accessToken: string; workerUrl: string; }

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  growth: "Growth",
  agency: "Agency",
  unknown: "Інше",
};

function TrendBadge({ current, previous, invert }: { current: number; previous: number; invert?: boolean }) {
  const diff = current - previous;
  if (Math.abs(diff) < 0.1) {
    return <span className="text-xs flex items-center gap-1 text-[var(--text-tertiary)]"><Minus size={11} /> без змін</span>;
  }
  // invert: для churn зростання — це погано (червоне), для MRR зростання — добре (лайм)
  const isGood = invert ? diff < 0 : diff > 0;
  const color = isGood ? "var(--lime)" : "#F5675A";
  const Icon = diff > 0 ? TrendingUp : TrendingDown;
  return (
    <span className="text-xs flex items-center gap-1" style={{ color }}>
      <Icon size={11} /> {diff > 0 ? "+" : ""}{diff.toFixed(1)}%
    </span>
  );
}

export function BusinessMetricsPanel({ accessToken, workerUrl }: Props) {
  const [metrics, setMetrics] = useState<BusinessMetrics | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${workerUrl}/api/admin/business-metrics`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => setMetrics(d as BusinessMetrics))
      .catch(() => setError(true));
  }, [accessToken, workerUrl]);

  if (error) {
    return (
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <p className="text-sm text-[var(--text-tertiary)]">Не вдалося завантажити бізнес-метрики</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* MRR hero + key numbers */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4 sm:col-span-1">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">MRR</p>
          <p className="font-display text-2xl font-bold tabular-nums" style={{ color: "var(--lime)" }}>
            {metrics ? `$${metrics.mrr.toLocaleString()}` : <span className="text-[var(--text-tertiary)] text-lg">…</span>}
          </p>
          {metrics && metrics.mrrGrowthPct !== null && (
            <div className="mt-1"><TrendBadge current={metrics.mrrGrowthPct} previous={0} /></div>
          )}
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">ARPU</p>
          <p className="font-display text-2xl font-bold tabular-nums">
            {metrics ? `$${metrics.arpu}` : <span className="text-[var(--text-tertiary)] text-lg">…</span>}
          </p>
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">Churn (30д)</p>
          <p className="font-display text-2xl font-bold tabular-nums" style={{ color: metrics && metrics.churnRatePct > 5 ? "#F5675A" : "var(--text-primary)" }}>
            {metrics ? `${metrics.churnRatePct}%` : <span className="text-[var(--text-tertiary)] text-lg">…</span>}
          </p>
          {metrics && (
            <div className="mt-1"><TrendBadge current={metrics.churnRatePct} previous={metrics.churnRatePrevPct} invert /></div>
          )}
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">Trial → Paid</p>
          <p className="font-display text-2xl font-bold tabular-nums">
            {metrics?.conversionRatePct !== null && metrics?.conversionRatePct !== undefined
              ? `${metrics.conversionRatePct}%`
              : <span className="text-[var(--text-tertiary)] text-lg">—</span>}
          </p>
        </div>
      </div>

      {/* Breakdown by plan + subscription counts */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">MRR за планом</p>
          {!metrics ? (
            <p className="text-sm text-[var(--text-tertiary)]">…</p>
          ) : Object.keys(metrics.mrrByPlan).length === 0 ? (
            <p className="text-sm text-[var(--text-tertiary)]">Немає активних підписок</p>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(metrics.mrrByPlan)
                .sort((a, b) => b[1].mrr - a[1].mrr)
                .map(([code, data]) => (
                  <div key={code} className="flex items-center justify-between">
                    <span className="text-sm">{PLAN_LABELS[code] ?? code} <span className="text-[var(--text-tertiary)]">×{data.count}</span></span>
                    <span className="text-sm font-mono font-medium">${data.mrr.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">Стан підписок</p>
          {!metrics ? (
            <p className="text-sm text-[var(--text-tertiary)]">…</p>
          ) : (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-sm">Активні</span>
                <span className="text-sm font-mono font-medium" style={{ color: "var(--lime)" }}>{metrics.activeCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm">На тріалі</span>
                <span className="text-sm font-mono font-medium">{metrics.trialingCount}</span>
              </div>
              {metrics.pastDueCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Прострочені</span>
                  <span className="text-sm font-mono font-medium" style={{ color: "#F5A623" }}>{metrics.pastDueCount}</span>
                </div>
              )}
              {metrics.endingSoonCount > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Скасовуються скоро</span>
                  <span className="text-sm font-mono font-medium" style={{ color: "#F5A623" }}>{metrics.endingSoonCount}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2" style={{ borderTop: "1px solid var(--border-hairline)" }}>
                <span className="text-sm text-[var(--text-tertiary)]">Скасовано (всього)</span>
                <span className="text-sm font-mono text-[var(--text-tertiary)]">{metrics.canceledCount}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
