"use client";

/**
 * CreatorBrandKitPreview — mockup of the reusable components +
 * brand kit palette, same card language as AiInsightPreview.
 */

const SWATCHES = [
  { color: "var(--lime)", label: "Основний" },
  { color: "var(--cyan)", label: "Другорядний" },
  { color: "var(--purple)", label: "Акцент" },
];

export function CreatorBrandKitPreview() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 40px rgba(191, 90, 242, 0.06)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium"
          style={{ background: "rgba(191,90,242,0.12)", border: "1px solid rgba(191,90,242,0.25)", color: "var(--purple)" }}
        >
          ✦ BRAND KIT
        </span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        Кольори, шрифти й компоненти бренду — застосовуються одразу
        на будь-якій дошці, без ручного підбору щоразу.
      </p>

      <div className="flex items-center gap-3 mb-4">
        {SWATCHES.map((s) => (
          <div key={s.label} className="flex-1 text-center">
            <div
              className="h-10 rounded-lg mb-1.5"
              style={{ background: s.color, boxShadow: `0 0 16px ${s.color}55` }}
            />
            <span className="text-[10px] text-[var(--text-tertiary)]">{s.label}</span>
          </div>
        ))}
      </div>

      <div
        className="rounded-xl px-4 py-3 flex items-center justify-between"
        style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <span className="text-xs text-[var(--text-secondary)]">Готові блоки</span>
        <span className="font-mono text-xs" style={{ color: "var(--purple)" }}>12 компонентів</span>
      </div>
    </div>
  );
}
