// Skeleton — примітиви для skeleton-завантаження (Артем: "skeleton-
// загрузки" — фаза 3 мікроанімацій). Замінює Loader2-спінери на
// формо-подібні заглушки контенту в головних списках кожного
// продукту: людина одразу бачить структуру екрана, а не порожнечу
// з крутиком по центру — відчувається швидше й якісніше, навіть
// якщо реальний час завантаження той самий.
//
// Базовий блок — Tailwind `animate-pulse` (нативний клас, вже
// використовується в проєкті для live-індикаторів), не нова
// анімаційна бібліотека. Кольори узгоджені з DESIGN_SYSTEM.md —
// той самий `rgba(255,255,255,0.04–0.06)`, що вже прийнятий для
// неактивних/hover фонів по всьому UI.

interface SkeletonBlockProps {
  className?: string;
  style?: React.CSSProperties;
}

/** Найпростіший прямокутний блок-заглушка — цеглинка для складніших форм нижче. */
export function SkeletonBlock({ className = "", style }: SkeletonBlockProps) {
  return (
    <div
      className={`animate-pulse rounded-md ${className}`}
      style={{ background: "rgba(255,255,255,0.05)", ...style }}
    />
  );
}

/** Рядок картки сайту (Dashboard, /dashboard/sites) — icon+text ліворуч, статус-бейджі праворуч. */
export function SkeletonSiteCard() {
  return (
    <div
      className="rounded-2xl p-5 flex items-center justify-between gap-4"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}
    >
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <SkeletonBlock className="h-9 w-9 rounded-xl shrink-0" />
        <div className="min-w-0 flex-1 space-y-2">
          <SkeletonBlock className="h-4 w-40" />
          <SkeletonBlock className="h-3 w-56" />
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <SkeletonBlock className="h-6 w-16 rounded-full" />
        <SkeletonBlock className="h-8 w-20 rounded-xl" />
      </div>
    </div>
  );
}

/** Список карток сайтів — кілька SkeletonSiteCard підряд. */
export function SkeletonSiteList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonSiteCard key={i} />
      ))}
    </div>
  );
}

/** Рядок тредa (Mail) — avatar-крапка, відправник+тема, дата. */
export function SkeletonMailThread() {
  return (
    <div className="px-4 py-3 flex items-center gap-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <SkeletonBlock className="h-2 w-2 rounded-full shrink-0" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <SkeletonBlock className="h-3 w-32" />
        <SkeletonBlock className="h-3 w-full max-w-xs" />
      </div>
      <SkeletonBlock className="h-3 w-10 shrink-0" />
    </div>
  );
}

export function SkeletonMailList({ count = 6 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonMailThread key={i} />
      ))}
    </div>
  );
}

/** Картка дошки/документа (Creator, Office) — превʼю-прямокутник + назва+дата знизу. */
export function SkeletonBoardCard() {
  return (
    <div className="rounded-2xl p-3 space-y-3" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <SkeletonBlock className="h-28 w-full rounded-xl" />
      <div className="space-y-1.5 px-1">
        <SkeletonBlock className="h-3.5 w-3/4" />
        <SkeletonBlock className="h-2.5 w-1/3" />
      </div>
    </div>
  );
}

export function SkeletonBoardGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonBoardCard key={i} />
      ))}
    </div>
  );
}

/** Рядок таблиці (CRM/Social/загальні списки) — кілька колонок-прямокутників. */
export function SkeletonTableRow({ columns = 4 }: { columns?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {Array.from({ length: columns }).map((_, i) => (
        <SkeletonBlock key={i} className={`h-3.5 ${i === 0 ? "w-1/4" : "flex-1 max-w-[140px]"}`} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonTableRow key={i} columns={columns} />
      ))}
    </div>
  );
}

/** Компактний рядок для вузьких бічних панелей (Browser sidebar, Collections тощо). */
export function SkeletonCompactRow() {
  return (
    <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
      <SkeletonBlock className="h-6 w-6 rounded-md shrink-0" />
      <SkeletonBlock className="h-3 flex-1" />
    </div>
  );
}

export function SkeletonCompactList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCompactRow key={i} />
      ))}
    </div>
  );
}
