"use client";

/**
 * OfficeDocsPreview — mockup of a Docs editor with AI Writer
 * suggestion, same glassmorphism panel language as LiveMonitorPanel.
 */

import type { Locale } from "@/app/lib/i18n";

const COPY: Record<Locale, { filename: string; aiSuggestion: string; footer: string; saved: string }> = {
  uk: {
    filename: "Комерційна пропозиція.docx",
    aiSuggestion: "AI Writer: додати абзац про переваги — на основі вашого Brand Kit",
    footer: "AI Writer готує текст за вас",
    saved: "● збережено",
  },
  en: {
    filename: "Sales Proposal.docx",
    aiSuggestion: "AI Writer: add a benefits paragraph — based on your Brand Kit",
    footer: "AI Writer drafts the text for you",
    saved: "● saved",
  },
};

export function OfficeDocsPreview({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 60px rgba(214, 255, 63, 0.05), 0 20px 60px rgba(0, 0, 0, 0.3)",
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
          <span className="font-mono text-xs text-[var(--text-tertiary)]">{t.filename}</span>
        </div>
      </div>

      <div className="px-5 py-5 space-y-2.5">
        <div className="h-3 rounded-full w-[85%]" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="h-3 rounded-full w-[92%]" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="h-3 rounded-full w-[70%]" style={{ background: "rgba(255,255,255,0.1)" }} />

        <div
          className="rounded-lg px-3 py-2.5 mt-3 flex items-start gap-2"
          style={{ background: "rgba(214,255,63,0.06)", border: "1px solid rgba(214,255,63,0.2)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full mt-1.5 shrink-0" style={{ background: "var(--lime)" }} />
          <span className="text-xs text-[var(--text-secondary)] leading-relaxed">
            {t.aiSuggestion}
          </span>
        </div>

        <div className="h-3 rounded-full w-[60%] mt-3" style={{ background: "rgba(255,255,255,0.06)" }} />
      </div>

      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(255, 255, 255, 0.02)" }}
      >
        <span className="text-xs text-[var(--text-secondary)]">{t.footer}</span>
        <span className="font-mono text-xs" style={{ color: "var(--lime)" }}>{t.saved}</span>
      </div>
    </div>
  );
}
