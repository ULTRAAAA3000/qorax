"use client";

// MODULE_ROADMAP.md розділ 16 "Predictive AI", Крок 3 (UI): картки
// прогнозу там, де вже є історичні графіки (не окрема сторінка).
// MVP показує тільки Risk/Opportunity Detection (Крок 5 того самого
// розділу) — сигнали "оцінка на основі тренду, не гарантія" (та сама
// вимога прозорості з Кроку 3).

import { useState, useEffect, useCallback } from "react";
import { TrendingUp, TrendingDown, Zap, X } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Prediction {
  id: string;
  prediction_type: "risk" | "opportunity";
  signal: string;
  predicted_value: {
    metric?: string;
    query?: string;
    current?: number;
    baseline?: number;
    change_pct?: number;
  };
  confidence: number | null;
  target_date: string;
  created_at: string;
}

interface Props {
  siteId: string;
  accessToken: string;
}

function signalLabel(p: Prediction): string {
  switch (p.signal) {
    case "keyword_position_drop":
      return `Позиція запиту "${p.predicted_value.query}" погіршилась`;
    case "keyword_position_rise":
      return `Позиція запиту "${p.predicted_value.query}" покращилась`;
    case "speed_degradation":
      return "Швидкість завантаження впала";
    default:
      return p.signal;
  }
}

function signalDetail(p: Prediction): string {
  const v = p.predicted_value;
  if (p.signal === "speed_degradation" && v.current != null && v.baseline != null) {
    const fmt = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
    return `Зараз ${fmt(v.current)}, норма за тиждень — ${fmt(v.baseline)}`;
  }
  if (v.current != null && v.baseline != null) {
    return `Зараз позиція ${v.current.toFixed(1)}, було в середньому ${v.baseline.toFixed(1)}`;
  }
  return "";
}

function PredictionCard({ prediction, onDismiss }: { prediction: Prediction; onDismiss: (id: string) => void }) {
  const isRisk = prediction.prediction_type === "risk";
  const color = isRisk ? "#F5675A" : "var(--lime)";
  const bg = isRisk ? "rgba(245,103,90,0.05)" : "rgba(214,255,63,0.05)";
  const border = isRisk ? "rgba(245,103,90,0.15)" : "rgba(214,255,63,0.12)";

  return (
    <div className="flex items-start gap-2.5 rounded-xl px-4 py-3" style={{ background: bg, border: `1px solid ${border}` }}>
      {prediction.signal === "speed_degradation"
        ? <Zap size={13} style={{ color, flexShrink: 0, marginTop: 2 }} />
        : isRisk
        ? <TrendingDown size={13} style={{ color, flexShrink: 0, marginTop: 2 }} />
        : <TrendingUp size={13} style={{ color, flexShrink: 0, marginTop: 2 }} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{signalLabel(prediction)}</p>
        <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{signalDetail(prediction)}</p>
      </div>
      <button onClick={() => onDismiss(prediction.id)} className="shrink-0 p-1 rounded-lg hover:bg-white/5 transition-colors">
        <X size={13} style={{ color: "var(--text-tertiary)" }} />
      </button>
    </div>
  );
}

export function PredictiveInsightsPanel({ siteId, accessToken }: Props) {
  const [predictions, setPredictions] = useState<Prediction[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/predictions`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setPredictions(data.predictions ?? []);
    } catch {
      setPredictions([]);
    }
  }, [siteId, accessToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function dismiss(id: string) {
    setPredictions(prev => prev?.filter(p => p.id !== id) ?? null);
    await fetch(`${API_BASE_URL}/api/sites/${siteId}/predictions/${id}/dismiss`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  }

  if (!predictions) {
    return <p className="text-sm text-[var(--text-tertiary)]">Завантаження...</p>;
  }

  if (predictions.length === 0) {
    return (
      <p className="text-sm text-[var(--text-tertiary)]">
        Немає активних сигналів. Детектори запускаються щоночі о 3:00 і аналізують позиції ключових слів і швидкість сайту.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {predictions.map(p => (
        <PredictionCard key={p.id} prediction={p} onDismiss={dismiss} />
      ))}
      <p className="text-xs pt-1" style={{ color: "var(--text-tertiary)" }}>
        Оцінка на основі тренду за останні дні, не гарантія майбутнього результату.
      </p>
    </div>
  );
}
