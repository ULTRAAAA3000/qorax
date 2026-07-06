// ============================================================
// formatRelativeTime.ts — "5 хвилин тому" замість абсолютних дат
// для свіжих подій. Старіші дати (>7 днів) показуємо як звичайну
// дату — відносний формат для місяців тому не incrementally корисний.
// ============================================================

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";

  let date: Date;
  try {
    date = new Date(iso);
    if (isNaN(date.getTime())) return "—";
  } catch {
    return "—";
  }

  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 0) return "щойно"; // clock skew — не показуємо "в майбутньому"
  if (diffSec < 45) return "щойно";
  if (diffSec < 90) return "хвилину тому";

  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} хв тому`;

  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} год тому`;

  const diffDays = Math.round(diffHr / 24);
  if (diffDays === 1) return "вчора";
  if (diffDays < 7) return `${diffDays} дні тому`;

  // Старше тижня — звичайна дата, відносний формат вже не інформативний
  return date.toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
}
