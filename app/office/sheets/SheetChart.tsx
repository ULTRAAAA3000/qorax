"use client";

import { X } from "lucide-react";
import type { Cells, ChartSpec } from "./sheetFormulas";
import { getRangeValues, getRangeLabels } from "./sheetFormulas";

const COLORS = ["#C6FF54", "#8CF6FF", "#B98CF7", "#FF9F6B", "#6BD4FF", "#FF6B9F"];

// SheetChart — ручний inline SVG, той самий підхід, що вже
// прийнятий в AnalyticsDetailUI.tsx (<svg><path .../></svg> для
// sparkline-графіків) — не додавав recharts/chart.js: платформа
// вже має власну конвенцію для простих графіків, дотримано її, а
// не нову залежність. MVP: bar/line/pie над ОДНИМ діапазоном значень
// (не зведеними таблицями, не кількома серіями одразу).
export function SheetChart({ chart, cells, onDelete }: { chart: ChartSpec; cells: Cells; onDelete: () => void }) {
  const values = getRangeValues(cells, chart.valueRange);
  const labels = chart.labelRange ? getRangeLabels(cells, chart.labelRange) : values.map((_, i) => String(i + 1));

  return (
    <div className="glow-card p-4 relative" style={{ minWidth: 280 }}>
      <button onClick={onDelete} aria-label="Видалити діаграму" className="absolute top-2 right-2 p-1 rounded-lg hover:bg-white/5 text-[var(--text-tertiary)]">
        <X size={12} />
      </button>
      <p className="text-xs font-medium mb-3 pr-6">{chart.title || chart.valueRange}</p>
      {values.length === 0 || values.every(v => v === 0) ? (
        <p className="text-xs text-[var(--text-tertiary)] py-6 text-center">Немає даних у діапазоні {chart.valueRange}</p>
      ) : chart.type === "bar" ? (
        <BarChart values={values} labels={labels} />
      ) : chart.type === "line" ? (
        <LineChart values={values} labels={labels} />
      ) : (
        <PieChart values={values} labels={labels} />
      )}
    </div>
  );
}

function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 260, height = 140, padding = 4, barGap = 4;
  const max = Math.max(...values, 1);
  const barWidth = (width - padding * 2 - barGap * (values.length - 1)) / values.length;

  return (
    <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full">
      {values.map((v, i) => {
        const h = (v / max) * height;
        const x = padding + i * (barWidth + barGap);
        return (
          <g key={i}>
            <rect x={x} y={height - h} width={barWidth} height={h} rx={2} fill={COLORS[i % COLORS.length]} opacity={0.85} />
            <text x={x + barWidth / 2} y={height + 12} fontSize={8} textAnchor="middle" fill="var(--text-tertiary)">
              {(labels[i] ?? "").slice(0, 6)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const width = 260, height = 140, padding = 6;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values.map((v, i) => {
    const x = padding + i * stepX;
    const y = height - padding - ((v - min) / range) * (height - padding * 2);
    return { x, y };
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height + 16}`} className="w-full">
      <path d={path} fill="none" stroke="var(--lime)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={2.5} fill="var(--lime)" />)}
      {labels.map((l, i) => (
        <text key={i} x={points[i].x} y={height + 12} fontSize={8} textAnchor="middle" fill="var(--text-tertiary)">
          {l.slice(0, 6)}
        </text>
      ))}
    </svg>
  );
}

function PieChart({ values, labels }: { values: number[]; labels: string[] }) {
  const size = 140, r = 60, cx = size / 2, cy = size / 2;
  const total = values.reduce((a, b) => a + b, 0) || 1;

  // Накопичення кута через reduce, а не мутацію let-змінної всередині
  // map() — React Compiler (react-hooks/immutability) забороняє
  // переприсвоєння змінних під час рендеру, навіть локальних.
  const slices = values.reduce<Array<{ d: string; color: string; label: string; value: number; endAngle: number }>>((acc, v, i) => {
    const startAngle = acc.length === 0 ? -90 : acc[acc.length - 1].endAngle;
    const sliceAngle = (v / total) * 360;
    const endAngle = startAngle + sliceAngle;
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    const x1 = cx + r * Math.cos(startRad), y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad), y2 = cy + r * Math.sin(endRad);
    const largeArc = sliceAngle > 180 ? 1 : 0;
    const d = `M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${largeArc} 1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    acc.push({ d, color: COLORS[i % COLORS.length], label: labels[i], value: v, endAngle });
    return acc;
  }, []);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox={`0 0 ${size} ${size}`} style={{ width: 120, height: 120 }} className="shrink-0">
        {slices.map((s, i) => <path key={i} d={s.d} fill={s.color} opacity={0.85} />)}
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
            <span className="truncate">{s.label || `#${i + 1}`}: {s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
