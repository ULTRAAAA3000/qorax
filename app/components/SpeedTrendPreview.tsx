"use client";

/**
 * SpeedTrendPreview — glassmorphism chart card with gradient line,
 * animated endpoint glow, and area fill.
 */

import type { Locale } from "@/app/lib/i18n";

const POINTS = [2.8, 2.6, 3.1, 2.4, 1.9, 1.6, 1.4, 1.3, 1.2];
const WIDTH = 280;
const HEIGHT = 88;
const MAX = 3.4;

function toPath(points: number[]) {
  const step = WIDTH / (points.length - 1);
  return points
    .map((v, i) => `${i === 0 ? "M" : "L"} ${i * step} ${HEIGHT - (v / MAX) * HEIGHT}`)
    .join(" ");
}

const COPY: Record<Locale, { label: string; period: string }> = {
  uk: { label: "Швидкість завантаження", period: "30 днів" },
  en: { label: "Page load speed", period: "30 days" },
};

export function SpeedTrendPreview({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const path = toPath(POINTS);
  const lastX = WIDTH;
  const lastY = HEIGHT - (POINTS[POINTS.length - 1] / MAX) * HEIGHT;

  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(16px)",
      }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-[var(--text-secondary)]">{t.label}</span>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">{t.period}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-mono text-2xl tabular text-[var(--text-primary)]">1.2s</span>
        <span className="font-mono text-xs font-medium gradient-text">
          −57%
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="speedFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.15" />
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--lime)" />
            <stop offset="100%" stopColor="var(--cyan)" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`} fill="url(#speedFade)" stroke="none" />
        <path d={path} fill="none" stroke="url(#lineGradient)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="4" fill="var(--cyan)" />
        <circle cx={lastX} cy={lastY} r="8" fill="var(--cyan)" opacity="0.2">
          <animate attributeName="r" values="4;12;4" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.3;0;0.3" dur="2s" repeatCount="indefinite" />
        </circle>
      </svg>
    </div>
  );
}
