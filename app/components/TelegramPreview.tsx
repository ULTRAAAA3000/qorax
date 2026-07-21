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

export function TelegramPreview() {
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
          ✦ QORAX BOT
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">сьогодні, 09:15</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        Доброго ранку! Сьогодні:
      </p>

      <div
        className="rounded-xl px-4 py-3 mb-3 space-y-2"
        style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">SEO Score</span>
          <span className="font-mono text-lg tabular font-semibold" style={{ color: "var(--lime)" }}>
            92 <span className="text-xs">↑ +3</span>
          </span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">PageSpeed</span>
          <span className="font-mono text-sm tabular text-[var(--text-primary)]">98</span>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">Помилок</span>
          <span className="font-mono text-sm tabular text-[var(--text-primary)]">1</span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)] mb-4">
        Запитайте боту напряму: <span className="text-[var(--text-secondary)]">«Чому впали позиції?»</span> — AI аналізує моніторинг, швидкість і історію та відповідає простою мовою.
      </p>

      <TelegramConnectButton />
    </div>
  );
}
