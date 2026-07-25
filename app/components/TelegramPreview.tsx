"use client";

/**
 * TelegramPreview — glassmorphism card, стиль якого узгоджений з
 * AiInsightPreview/LiveMonitorPanel (той самий glassmorphism +
 * градієнтні акценти лендінгу). Показує макет карткового
 * повідомлення бота (за прикладом з документа Артема: "SEO Score
 * 92 ↑ +3") і саму кнопку підключення — TelegramConnectButton
 * без organizationId (лендінг, незалогінений відвідувач), просто
 * відкриває бота ознайомчо.
 */

import { TelegramConnectButton } from "./TelegramConnectButton";
import type { Locale } from "@/app/lib/i18n";

const COPY: Record<Locale, {
  badge: string; time: string; greeting: string;
  seo: string; pageSpeed: string; errors: string;
  hint: string; question: string;
}> = {
  uk: {
    badge: "✦ QORAX BOT", time: "сьогодні, 09:15", greeting: "Доброго ранку! Сьогодні:",
    seo: "SEO Score", pageSpeed: "PageSpeed", errors: "Помилок",
    hint: "AI аналізує моніторинг, швидкість і історію та відповідає простою мовою.",
    question: "«Чому впали позиції?»",
  },
  en: {
    badge: "✦ QORAX BOT", time: "today, 9:15 AM", greeting: "Good morning! Today:",
    seo: "SEO Score", pageSpeed: "PageSpeed", errors: "Errors",
    hint: "AI analyzes monitoring, speed, and history data, then answers in plain language.",
    question: "\u201CWhy did rankings drop?\u201D",
  },
};

export function TelegramPreview({ lang = "uk" }: { lang?: Locale }) {
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
          style={{ background: "rgba(140,246,255,0.1)", border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }}
        >
          {t.badge}
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{t.time}</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        {t.greeting}
      </p>

      <div
        className="rounded-xl px-4 py-3 mb-3 space-y-2"
        style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">{t.seo}</span>
          <span className="font-mono text-lg tabular font-semibold" style={{ color: "var(--lime)" }}>
            92 <span className="text-xs">↑ +3</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">{t.pageSpeed}</span>
          <span className="font-mono text-sm tabular text-[var(--text-primary)]">98</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">{t.errors}</span>
          <span className="font-mono text-sm tabular text-[var(--text-primary)]">1</span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)] mb-4">
        {lang === "uk" ? "Запитайте боту напряму: " : "Ask the bot directly: "}
        <span className="text-[var(--text-secondary)]">{t.question}</span> — {t.hint}
      </p>

      <TelegramConnectButton />
    </div>
  );
}
