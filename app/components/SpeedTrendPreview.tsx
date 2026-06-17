"use client";

/**
 * SpeedTrendPreview — a real chart artifact (speed-over-time), the kind
 * a Growth-plan dashboard actually renders. SVG polyline, no charting
 * library needed for a static illustrative dataset.
 */

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

export function SpeedTrendPreview() {
  const path = toPath(POINTS);
  const lastX = WIDTH;
  const lastY = HEIGHT - (POINTS[POINTS.length - 1] / MAX) * HEIGHT;

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-sm text-[var(--text-secondary)]">Швидкість завантаження</span>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">30 днів</span>
      </div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-mono text-2xl tabular text-[var(--text-primary)]">1.2s</span>
        <span className="font-mono text-xs" style={{ color: "var(--lime)" }}>
          −57%
        </span>
      </div>

      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="w-full h-auto" preserveAspectRatio="none">
        <defs>
          <linearGradient id="speedFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={`${path} L ${WIDTH} ${HEIGHT} L 0 ${HEIGHT} Z`} fill="url(#speedFade)" stroke="none" />
        <path d={path} fill="none" stroke="var(--cyan)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={lastX} cy={lastY} r="3.5" fill="var(--cyan)" />
      </svg>
    </div>
  );
}
