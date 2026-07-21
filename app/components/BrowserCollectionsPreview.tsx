"use client";

/**
 * BrowserCollectionsPreview — mockup of saved Collections (competitor
 * sites, references, ideas), same card language as AiInsightPreview.
 */

const ITEMS = [
  { label: "Конкурент А — Landing", tag: "референс" },
  { label: "Стаття про UX-тренди", tag: "ідея" },
  { label: "Конкурент Б — Pricing", tag: "референс" },
];

export function BrowserCollectionsPreview() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 40px rgba(140, 246, 255, 0.05)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium"
          style={{ background: "rgba(140,246,255,0.12)", border: "1px solid rgba(140,246,255,0.25)", color: "var(--cyan)" }}
        >
          ✦ COLLECTIONS
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">Проєкт «Ребрендинг»</span>
      </div>

      <div className="space-y-2 mb-4">
        {ITEMS.map((item) => (
          <div
            key={item.label}
            className="rounded-lg px-3 py-2.5 flex items-center justify-between"
            style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
          >
            <span className="text-xs text-[var(--text-secondary)] truncate">{item.label}</span>
            <span className="font-mono text-[10px] shrink-0 ml-2" style={{ color: "var(--cyan)" }}>{item.tag}</span>
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
        Одним кліком — прямо у Qorax Creator чи Office через Smart Capture.
      </p>
    </div>
  );
}
