"use client";

/**
 * OfficeSheetsSlidesPreview — mockup showing Sheets formula result +
 * Slides AI-generated structure, same card language as AiInsightPreview.
 */

export function OfficeSheetsSlidesPreview() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 40px rgba(214, 255, 63, 0.05)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium"
          style={{ background: "rgba(214,255,63,0.12)", border: "1px solid rgba(214,255,63,0.25)", color: "var(--lime)" }}
        >
          ✦ SHEETS
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">=SUM(B2:B14)</span>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-4">
        {["Січень", "42 300", "+8%", "Лютий", "45 900", "+9%", "Березень", "51 200", "+11%"].map((cell, i) => (
          <div
            key={i}
            className="rounded-md px-2 py-1.5 text-[11px] text-center"
            style={{
              background: i % 3 === 2 ? "rgba(214,255,63,0.1)" : "rgba(255,255,255,0.04)",
              color: i % 3 === 2 ? "var(--lime)" : "var(--text-secondary)",
              border: "1px solid rgba(255,255,255,0.06)",
            }}
          >
            {cell}
          </div>
        ))}
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)] mb-3">
        Slides: AI будує структуру презентації за описом — від слайда до готового виступу.
      </p>

      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className="flex-1 aspect-[4/3] rounded-md flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <span className="text-[9px] font-mono text-[var(--text-tertiary)]">{n}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
