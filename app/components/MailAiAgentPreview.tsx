"use client";

/**
 * MailAiAgentPreview — glassmorphism card showing an AI-drafted reply
 * suggestion, same visual language as AiInsightPreview (Business).
 */

export function MailAiAgentPreview() {
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
          ✦ AI-АГЕНТ
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">чернетка відповіді</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        Клієнт запитує про терміни доставки. AI підготував відповідь на основі
        останніх 3 подібних листів і тону вашого бренду.
      </p>

      <div
        className="rounded-xl px-4 py-3 mb-4"
        style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <p className="text-xs leading-relaxed text-[var(--text-primary)]">
          «Доброго дня! Зазвичай доставка займає 2-3 робочі дні по Києву
          та 4-5 днів по Україні. Уточню точний термін для вашого замовлення...»
        </p>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
        Один клік — і лист іде клієнту, або редагуйте перед відправкою.
      </p>
    </div>
  );
}
