"use client";

/**
 * CreatorCanvasPreview — mockup of the infinite-canvas board with
 * draggable-looking blocks, same glassmorphism language as the rest
 * of the landing preview panels.
 */

const BLOCKS = [
  { label: "Hero-блок", x: 8, y: 12, w: 42, h: 26, accent: "var(--purple)" },
  { label: "Галерея", x: 54, y: 8, w: 38, h: 34, accent: "var(--cyan)" },
  { label: "CTA", x: 8, y: 46, w: 30, h: 18, accent: "var(--lime)" },
  { label: "Відгуки", x: 42, y: 50, w: 50, h: 20, accent: "var(--purple)" },
];

export function CreatorCanvasPreview() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 60px rgba(191, 90, 242, 0.06), 0 20px 60px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
          </div>
          <span className="font-mono text-xs text-[var(--text-tertiary)]">Website Mode · Дошка</span>
        </div>
      </div>

      <div className="relative h-56 sm:h-64" style={{ background: "rgba(255,255,255,0.015)" }}>
        {/* Grid dots background */}
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.08) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
          }}
        />
        {BLOCKS.map((b) => (
          <div
            key={b.label}
            className="absolute rounded-lg flex items-center justify-center px-2"
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              width: `${b.w}%`,
              height: `${b.h}%`,
              background: `${b.accent}14`,
              border: `1px solid ${b.accent}40`,
            }}
          >
            <span className="text-[10px] sm:text-[11px] font-medium truncate" style={{ color: b.accent }}>
              {b.label}
            </span>
          </div>
        ))}
      </div>

      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(255, 255, 255, 0.02)" }}
      >
        <span className="text-xs text-[var(--text-secondary)]">Нескінченне полотно, будь-який тип контенту</span>
        <span className="font-mono text-xs" style={{ color: "var(--purple)" }}>4 блоки</span>
      </div>
    </div>
  );
}
