"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, BarChart2, Gauge, MousePointerClick, FileText, Lock, Sparkles } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface BenchmarkResult {
  available: boolean;
  metric?: string;
  your_value?: number;
  market_average?: number | null;
  percentile?: number;
  sample_size?: number;
  ai_explanation?: string | null;
  error?: string;
}

interface Props {
  organizationId: string;
  accessToken: string;
  hasProfile: boolean;
}

const METRICS: { key: string; label: string; icon: typeof Gauge; unit: string; free: boolean }[] = [
  { key: "speed_ms", label: "Швидкість завантаження", icon: Gauge, unit: "мс", free: true },
  { key: "conversion_rate", label: "Конверсія відвідувачів", icon: MousePointerClick, unit: "%", free: true },
  { key: "article_length", label: "Довжина AI-статей", icon: FileText, unit: "слів", free: false },
];

// Процентильна шкала (0-100) — той самий підхід до кольорового кодування,
// що RankDetailUI.tsx використовує для тренду позиції: lime = добре,
// жовтий/помаранчевий = середньо, червоний = погано.
function percentileColor(p: number): string {
  if (p >= 66) return "var(--lime)";
  if (p >= 33) return "#E8B84B";
  return "#F5675A";
}

function PercentileBar({ percentile }: { percentile: number }) {
  return (
    <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
      <div
        className="h-full rounded-full transition-all"
        style={{ width: `${percentile}%`, background: percentileColor(percentile) }}
      />
    </div>
  );
}

function MetricCard({ metric, result, locked }: { metric: typeof METRICS[number]; result: BenchmarkResult | null; locked: boolean }) {
  const Icon = metric.icon;

  if (locked) {
    return (
      <div className="glow-card p-5 space-y-3 relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <Icon size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{metric.label}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-3">
          <Lock size={13} /> Доступно на тарифі Growth і вище
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="glow-card p-5 space-y-3">
        <div className="flex items-center gap-2.5">
          <Icon size={16} style={{ color: "var(--lime)" }} />
          <h3 className="text-sm font-medium">{metric.label}</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-3">
          <Loader2 size={13} className="animate-spin" /> Завантаження...
        </div>
      </div>
    );
  }

  if (!result.available) {
    return (
      <div className="glow-card p-5 space-y-2">
        <div className="flex items-center gap-2.5">
          <Icon size={16} style={{ color: "var(--text-tertiary)" }} />
          <h3 className="text-sm font-medium text-[var(--text-secondary)]">{metric.label}</h3>
        </div>
        <p className="text-xs text-[var(--text-tertiary)]">{result.error ?? "Немає даних"}</p>
      </div>
    );
  }

  const percentile = result.percentile ?? 50;

  return (
    <div className="glow-card p-5 space-y-3">
      <div className="flex items-center gap-2.5">
        <Icon size={16} style={{ color: "var(--lime)" }} />
        <h3 className="text-sm font-medium">{metric.label}</h3>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xl font-display font-semibold">
            {Math.round((result.your_value ?? 0) * 100) / 100} <span className="text-sm text-[var(--text-tertiary)] font-normal">{metric.unit}</span>
          </p>
          {result.market_average !== null && result.market_average !== undefined && (
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Ринок в середньому: {result.market_average} {metric.unit}</p>
          )}
        </div>
        <p className="text-lg font-semibold" style={{ color: percentileColor(percentile) }}>
          {percentile}%
        </p>
      </div>

      <PercentileBar percentile={percentile} />
      <p className="text-xs text-[var(--text-tertiary)]">
        Кращі за {percentile}% подібних бізнесів {result.sample_size ? `(вибірка: ${result.sample_size})` : ""}
      </p>

      {result.ai_explanation && (
        <div className="flex items-start gap-2 mt-2 pt-3 rounded-lg px-3 py-2.5" style={{ background: "rgba(198,255,84,0.05)", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
          <Sparkles size={13} style={{ color: "var(--lime)", marginTop: 2, flexShrink: 0 }} />
          <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{result.ai_explanation}</p>
        </div>
      )}
    </div>
  );
}

export function BenchmarkUI({ organizationId, accessToken, hasProfile }: Props) {
  const [results, setResults] = useState<Record<string, BenchmarkResult | null>>({});
  const [isFullTier, setIsFullTier] = useState<boolean | null>(null);

  const loadMetric = useCallback(async (metricKey: string) => {
    const res = await fetch(`${API_BASE_URL}/api/benchmarks/${metricKey}?organization_id=${organizationId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (res.status === 402) {
      setIsFullTier(false);
      return;
    }
    const data: BenchmarkResult = await res.json();
    setResults(prev => ({ ...prev, [metricKey]: data }));
  }, [organizationId, accessToken]);

  useEffect(() => {
    if (!hasProfile) return;
    (async () => {
      await Promise.all(METRICS.map(m => loadMetric(m.key)));
      setIsFullTier(prev => (prev === false ? false : true));
    })();
  }, [hasProfile, loadMetric]);

  if (!hasProfile) {
    return (
      <div className="glow-card p-6 text-center space-y-3">
        <BarChart2 size={28} style={{ color: "var(--text-tertiary)", margin: "0 auto" }} />
        <h2 className="text-base font-medium">Заповніть профіль організації</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
          Щоб порівняти ваші показники з ринком, вкажіть галузь, країну та розмір бізнесу в налаштуваннях організації.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-block mt-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "var(--lime)", color: "#0A0A0A" }}
        >
          Перейти в налаштування
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {METRICS.map(metric => (
        <MetricCard
          key={metric.key}
          metric={metric}
          result={results[metric.key] ?? null}
          locked={!metric.free && isFullTier === false}
        />
      ))}
    </div>
  );
}
