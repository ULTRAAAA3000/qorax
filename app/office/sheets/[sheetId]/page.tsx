import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { SheetEditorUI } from "./SheetEditorUI";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Той самий підхід, що /office/[docId]/page.tsx — повноекранний
// layout без OfficeHeader-табів (редактору сітки потрібен максимум
// горизонтального простору).
export default async function SheetPage({ params }: { params: Promise<{ sheetId: string }> }) {
  const { sheetId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: sheet } = await supabase
    .from("office_sheets")
    .select("id, title, data, organization_id")
    .eq("id", sheetId)
    .single();
  if (!sheet) notFound();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="shrink-0" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/office/sheets" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
              <ArrowLeft size={14} /> Таблиці
            </Link>
            <span className="text-white/10">/</span>
            <QoraxLogo size="sm" />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <SheetEditorUI sheetId={sheet.id} initialTitle={sheet.title} initialData={sheet.data} />
      </div>
    </div>
  );
}
