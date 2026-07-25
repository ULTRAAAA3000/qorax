"use client";

/**
 * BrowserInspectorPreview — mockup of the Site Inspector panel with
 * AI Sidebar explanation, same glassmorphism panel language as
 * LiveMonitorPanel.
 */

import type { Locale } from "@/app/lib/i18n";

const ROW_LABELS: Record<Locale, string[]> = {
  uk: ["Технології", "Кольорова палітра", "SEO-оцінка", "Швидкість"],
  en: ["Technologies", "Color palette", "SEO score", "Speed"],
};

const ROW_VALUES = ["Next.js, Tailwind", "5 кольорів", "82/100", "1.8s"];
const ROW_VALUES_EN = ["Next.js, Tailwind", "5 colors", "82/100", "1.8s"];

const COPY: Record<Locale, { domain: string; footer: string }> = {
  uk: { domain: "competitor-site.com", footer: "AI пояснює будь-який сайт за клік" },
  en: { domain: "competitor-site.com", footer: "AI explains any site with one click" },
};

export function BrowserInspectorPreview({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const values = lang === "uk" ? ROW_VALUES : ROW_VALUES_EN;
  const rows = ROW_LABELS[lang].map((label, i) => ({ label, value: values[i] }));

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
        <span className="font-mono text-xs text-[var(--text-tertiary)]">{t.domain}</span>
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
          {rows.map((row) => (
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
        <span className="text-xs text-[var(--text-secondary)]">{t.footer}</span>
        <span className="font-mono text-xs" style={{ color: "var(--cyan)" }}>● live</span>
      </div>
    </div>
  );
}
