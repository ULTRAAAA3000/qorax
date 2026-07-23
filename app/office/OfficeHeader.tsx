"use client";

import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { FileText, Table2, Presentation } from "lucide-react";
import { useProductTour, type TourStep } from "@/app/lib/useProductTour";
import { TourButton } from "@/app/components/TourButton";

const OFFICE_TOUR_STEPS: TourStep[] = [
  // office-new-doc існує лише на /office (Docs list) — на /office/sheets
  // і /office/slides цього елемента немає, driver.js мовчки пропускає
  // відсутні кроки (skipMissingElement за замовчуванням), тур просто
  // почнеться з кроку 2. Прийнятно для першого проходу — окремі кроки
  // під Sheets/Slides списки лишаються майбутньою деталізацією.
  {
    element: '[data-tour="office-new-doc"]',
    title: "Створіть перший документ",
    description: "Почніть з чистого аркуша або оберіть готовий шаблон — договір, рахунок, комерційну пропозицію.",
    side: "bottom",
  },
  {
    element: '[data-tour="office-modes"]',
    title: "Docs, Sheets, Slides",
    description: "Три режими редактора в одному продукті — перемикайтесь між документами, таблицями і презентаціями.",
    side: "bottom",
  },
];

// Спільний хедер із перемикачем режимів для /office (Docs),
// /office/sheets (Sheets) і /office/slides (Slides) — той самий
// принцип "режим — не окремий застосунок", що вже описаний для
// Creator у MODULE_ROADMAP.md (тут поки що просто навігація між
// трьома списками, а не єдиний canvas-рушій — Office MVP значно
// простіший за довгострокове бачення Creator, це свідоме спрощення).
export function OfficeHeader({ active }: { active: "docs" | "sheets" | "slides" }) {
  const { startTour } = useProductTour("office", OFFICE_TOUR_STEPS);

  return (
    <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
        <QoraxLogo size="sm" />
        <div className="flex items-center gap-2">
          <nav className="flex items-center gap-1" data-tour="office-modes">
            <Link
              href="/office"
              className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              style={active === "docs" ? { background: "rgba(198,255,84,0.1)", color: "var(--lime)" } : { color: "var(--text-tertiary)" }}
            >
              <FileText size={13} /> Docs
            </Link>
            <Link
              href="/office/sheets"
              className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              style={active === "sheets" ? { background: "rgba(198,255,84,0.1)", color: "var(--lime)" } : { color: "var(--text-tertiary)" }}
            >
              <Table2 size={13} /> Sheets
            </Link>
            <Link
              href="/office/slides"
              className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors"
              style={active === "slides" ? { background: "rgba(198,255,84,0.1)", color: "var(--lime)" } : { color: "var(--text-tertiary)" }}
            >
              <Presentation size={13} /> Slides
            </Link>
          </nav>
          <TourButton onStart={startTour} />
        </div>
      </div>
    </header>
  );
}
