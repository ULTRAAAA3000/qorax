"use client";

/**
 * MailAiAgentPreview — glassmorphism card showing an AI-drafted reply
 * suggestion, same visual language as AiInsightPreview (Business).
 */

import type { Locale } from "@/app/lib/i18n";

const COPY: Record<Locale, { badge: string; sub: string; body: string; draft: string; footer: string }> = {
  uk: {
    badge: "✦ AI-АГЕНТ", sub: "чернетка відповіді",
    body: "Клієнт запитує про терміни доставки. AI підготував відповідь на основі останніх 3 подібних листів і тону вашого бренду.",
    draft: "«Доброго дня! Зазвичай доставка займає 2-3 робочі дні по Києву та 4-5 днів по Україні. Уточню точний термін для вашого замовлення...»",
    footer: "Один клік — і лист іде клієнту, або редагуйте перед відправкою.",
  },
  en: {
    badge: "✦ AI AGENT", sub: "draft reply",
    body: "A customer is asking about delivery times. AI drafted a reply based on the last 3 similar emails and your brand's tone.",
    draft: "\u201CHi! Delivery usually takes 2-3 business days locally and 4-5 days nationwide. Let me confirm the exact timing for your order...\u201D",
    footer: "One click sends it to the customer, or edit before sending.",
  },
};

export function MailAiAgentPreview({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
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
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t.sub}</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        {t.body}
      </p>

      <div
        className="rounded-xl px-4 py-3 mb-4"
        style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <p className="text-xs leading-relaxed text-[var(--text-primary)]">
          {t.draft}
        </p>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
        {t.footer}
      </p>
    </div>
  );
}
