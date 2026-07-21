"use client";

/**
 * BrowserInspectorPreview — mockup of the Site Inspector panel with
 * AI Sidebar explanation, same glassmorphism panel language as
 * LiveMonitorPanel.
 */

const INSPECT_ROWS = [
  { label: "Технології", value: "Next.js, Tailwind" },
  { label: "Кольорова палітра", value: "5 кольорів" },
  { label: "SEO-оцінка", value: "82/100" },
  { label: "Швидкість", value: "1.8s" },
];

export function BrowserInspectorPreview() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 60px rgba(140, 246, 255, 0.06), 0 20px 60px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        className="flex items-center gap-2.5 px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
        </div>
        <span className="font-mono text-xs text-[var(--text-tertiary)]">competitor-site.com</span>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium"
            style={{ background: "rgba(140,246,255,0.12)", border: "1px solid rgba(140,246,255,0.25)", color: "var(--cyan)" }}
          >
            ✦ SITE INSPECTOR
          </span>
        </div>
        <div className="space-y-2">
          {INSPECT_ROWS.map((row) => (
            <div key={row.label} className="flex items-center justify-between">
              <span className="text-xs text-[var(--text-secondary)]">{row.label}</span>
              <span className="font-mono text-xs text-[var(--text-primary)]">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(255, 255, 255, 0.02)" }}
      >
        <span className="text-xs text-[var(--text-secondary)]">AI пояснює будь-який сайт за клік</span>
        <span className="font-mono text-xs" style={{ color: "var(--cyan)" }}>● live</span>
      </div>
    </div>
  );
}
