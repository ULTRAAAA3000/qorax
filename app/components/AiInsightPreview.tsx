"use client";

/**
 * AiInsightPreview — a real-looking slice of the AI explanation feature.
 * Same philosophy as LiveMonitorPanel: show the actual artifact the
 * product produces, not an icon that merely symbolizes "AI".
 */

export function AiInsightPreview() {
  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5 sm:p-6">
      <div className="flex items-center gap-2 mb-4">
        <span
          className="font-mono text-[10px] tracking-wide px-2 py-1 rounded-full"
          style={{ background: "var(--bg-raised-2)", color: "var(--cyan)", border: "1px solid var(--border-hairline-strong)" }}
        >
          AI-АНАЛІЗ
        </span>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)]">щойно</span>
      </div>

      <p className="text-sm leading-relaxed text-[var(--text-secondary)] mb-4">
        Головна сторінка завантажується <span className="text-[var(--text-primary)] font-medium">4.2 секунди</span> — це
        вдвічі довше, ніж у середнього конкурента у вашій ніші.
      </p>

      <div className="rounded-xl border hairline bg-[var(--bg-raised-2)] px-4 py-3 mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs text-[var(--text-tertiary)]">Орієнтовні втрати</span>
          <span className="font-mono text-lg tabular" style={{ color: "var(--lime)" }}>
            −$210<span className="text-xs text-[var(--text-tertiary)]"> / міс</span>
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
