import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { GraphCanvasUI } from "./GraphCanvasUI";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LayoutTemplate, Network, ArrowLeft } from "lucide-react";

export const metadata = { title: "Diagram Mode — Qorax Creator" };

// Diagram Mode / KG Visualization (MODULE_ROADMAP.md, "Qorax
// Creator", "найдешевший MVP-кандидат" серед режимів Canvas) —
// на відміну від Website Mode, тут немає окремих "дощок" на режим:
// Knowledge Graph один на організацію (той самий kg_nodes/kg_edges,
// що вже споживає AI Chat через buildGraphContext), тож ця сторінка
// показує весь граф організації напряму, без проміжного canvas_boards
// запису. Read-only на цьому кроці — застосування діаграми до
// реальної БД (як згадувалось для попередньої версії Database
// Builder) свідомо НЕ MVP, той самий ризик пошкодження production
// без рев'ю.
export default async function GraphModePage() {
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
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="shrink-0" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/creator" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
              <ArrowLeft size={14} /> Creator
            </Link>
            <span className="text-white/10">/</span>
            <QoraxLogo size="sm" />
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <Link href="/creator" className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5 transition-colors">
              <LayoutTemplate size={14} /> Website
            </Link>
            <span className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg" style={{ background: "rgba(140,246,255,0.1)", color: "var(--cyan)" }}>
              <Network size={14} /> Diagram
            </span>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <GraphCanvasUI organizationId={membership.organization_id} />
      </div>
    </div>
  );
}
