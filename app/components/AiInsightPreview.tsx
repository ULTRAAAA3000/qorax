"use client";

/**
 * AiInsightPreview — glassmorphism card with gradient AI badge
 * and glow accents. Shows a believable AI analysis result.
 */

export function AiInsightPreview() {
  return (
    <div
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 0 40px rgba(191, 90, 242, 0.04)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span
          className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full gradient-text font-medium"
          style={{
            background: "rgba(191, 90, 242, 0.12)",
            border: "1px solid rgba(191, 90, 242, 0.25)",
            WebkitTextFillColor: "unset",
            color: "var(--purple)",
          }}
        >
          ✦ AI-АНАЛІЗ
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">щойно</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        Головна сторінка завантажується{" "}
        <span className="text-[var(--text-primary)] font-medium">4.2 секунди</span> — це
        вдвічі довше, ніж у середнього конкурента у вашій ніші.
      </p>

      <div
        className="rounded-xl px-4 py-3 mb-4"
        style={{
          background: "rgba(255, 255, 255, 0.04)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">Орієнтовні втрати</span>
          <span className="font-mono text-lg tabular gradient-text font-semibold">
            −$210<span className="text-xs text-[var(--text-tertiary)]" style={{ WebkitTextFillColor: "unset" }}> / міс</span>
          </span>
        </div>
      </div>

      <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
        Рекомендація: стиснути зображення на головній та підключити lazy-loading — це найбільший
        внесок у швидкість при найменших змінах коду.
      </p>
    </div>
  );
}
