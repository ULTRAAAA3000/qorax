"use client";

/**
 * BrowserCollectionsPreview — mockup of saved Collections (competitor
 * sites, references, ideas), same card language as AiInsightPreview.
 */

import type { Locale } from "@/app/lib/i18n";

const ITEMS: Record<Locale, Array<{ label: string; tag: string }>> = {
  uk: [
    { label: "Конкурент А — Landing", tag: "референс" },
    { label: "Стаття про UX-тренди", tag: "ідея" },
    { label: "Конкурент Б — Pricing", tag: "референс" },
  ],
  en: [
    { label: "Competitor A — Landing", tag: "reference" },
    { label: "Article on UX trends", tag: "idea" },
    { label: "Competitor B — Pricing", tag: "reference" },
  ],
};

const COPY: Record<Locale, { badge: string; project: string; hint: string }> = {
  uk: { badge: "✦ COLLECTIONS", project: "Проєкт «Ребрендинг»", hint: "Одним кліком — прямо у Qorax Creator чи Office через Smart Capture." },
  en: { badge: "✦ COLLECTIONS", project: "Project \u201CRebrand\u201D", hint: "One click — straight into Qorax Creator or Office via Smart Capture." },
};

export function BrowserCollectionsPreview({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const items = ITEMS[lang];
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
          {t.badge}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t.project}</span>
      </div>

      <div className="space-y-2 mb-4">
        {items.map((item) => (
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
        {t.hint}
      </p>
    </div>
  );
}
