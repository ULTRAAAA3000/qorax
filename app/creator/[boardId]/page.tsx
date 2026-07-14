import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { BoardCanvasUI } from "./BoardCanvasUI";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Дошка Creator — окремий, повноекранний layout (без PlatformSidebar,
// той самий підхід, що ProjectEditorUI.tsx Sites-конструктора: canvas
// потребує максимум простору, не типовий dashboard-каркас).
export default async function BoardPage({ params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: board } = await supabase
    .from("canvas_boards")
    .select("id, title, organization_id")
    .eq("id", boardId)
    .single();
  if (!board) notFound();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="shrink-0" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/creator" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
              <ArrowLeft size={14} /> Дошки
            </Link>
            <span className="text-white/10">/</span>
            <QoraxLogo size="sm" />
            <span className="text-sm font-medium truncate">{board.title}</span>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <BoardCanvasUI boardId={board.id} organizationId={board.organization_id} />
      </div>
    </div>
  );
}
