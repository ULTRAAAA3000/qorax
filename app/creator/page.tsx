import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { CreatorBoardsListUI } from "./CreatorBoardsListUI";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutTemplate, Network } from "lucide-react";

export const metadata = { title: "Qorax Creator" };

// Qorax Creator (MODULE_ROADMAP.md, "Qorax Creator — візуальна
// платформа створення") — ОКРЕМИЙ продукт екосистеми Qorax, той
// самий рівень, що Dashboard і майбутній Mail: власний топ-левел
// роут (/creator, не /dashboard/creator), БЕЗ Dashboard-каркасу
// (PlatformSidebar/platform_modules) — не модуль серед CRM/Commerce
// в сайдбарі. Дані (canvas_boards, organization_id) лишаються
// спільними з рештою платформи — саме це і дозволяє Website Mode
// показувати/редагувати ті самі project_pages, що Sites-конструктор
// у Dashboard, без дублювання. Основний вхід — майбутній лендінг
// (Артем зробить окремо); прямі переходи між продуктами — теж
// пізніший крок, свідомо не додано цим проходом.
export default async function CreatorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center">
          <QoraxLogo size="sm" />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <LayoutTemplate size={20} style={{ color: "var(--cyan)" }} />
            <h1 className="font-display text-2xl font-semibold">Qorax Creator</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Візуальне полотно. Website Mode — вбудований Sites-редактор прямо на дошці.
          </p>
        </div>

        {/* Перемикач режимів — MODULE_ROADMAP.md "Qorax Creator": режими
            канвасу для різних типів контенту. Website Mode (тут, дошки)
            і Diagram Mode (/creator/graph, Knowledge Graph) — перші два
            реалізовані режими, решта (Email/Presentation/Whiteboard/
            Social) — пізніші кроки, не додано цим проходом. */}
        <div className="flex items-center gap-1 p-1 rounded-xl w-fit" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <span className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(140,246,255,0.1)", color: "var(--cyan)" }}>
            <LayoutTemplate size={14} /> Website
          </span>
          <Link href="/creator/graph" className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors">
            <Network size={14} /> Diagram
          </Link>
        </div>

        <CreatorBoardsListUI organizationId={membership.organization_id} />
      </main>
    </div>
  );
}
