"use client";

import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { FileText, Table2 } from "lucide-react";

// Спільний хедер із перемикачем режимів для /office (Docs) і
// /office/sheets (Sheets) — той самий принцип "режим — не окремий
// застосунок", що вже описаний для Creator у MODULE_ROADMAP.md
// (тут поки що просто навігація між двома списками, а не єдиний
// canvas-рушій — Office MVP значно простіший за довгострокове
// бачення Creator, це свідоме спрощення).
export function OfficeHeader({ active }: { active: "docs" | "sheets" }) {
  return (
    <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
        <QoraxLogo size="sm" />
        <nav className="flex items-center gap-1">
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
        </nav>
      </div>
    </header>
  );
}
