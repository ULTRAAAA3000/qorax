import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { DocEditorUI } from "./DocEditorUI";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Документ Office — окремий, повноекранний layout (без
// PlatformSidebar), той самий підхід, що дошка Creator
// (app/creator/[boardId]/page.tsx): редактор потребує максимум
// простору, не типовий dashboard-каркас.
export default async function DocPage({ params }: { params: Promise<{ docId: string }> }) {
  const { docId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: doc } = await supabase
    .from("office_documents")
    .select("id, title, content, organization_id")
    .eq("id", docId)
    .single();
  if (!doc) notFound();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="shrink-0" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/office" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
              <ArrowLeft size={14} /> Документи
            </Link>
            <span className="text-white/10">/</span>
            <QoraxLogo size="sm" />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <DocEditorUI docId={doc.id} initialTitle={doc.title} initialContent={doc.content} />
      </div>
    </div>
  );
}
