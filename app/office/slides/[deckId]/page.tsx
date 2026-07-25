import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { SlidesEditorUI } from "./SlidesEditorUI";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

// Той самий підхід, що /office/[docId]/page.tsx і
// /office/sheets/[sheetId]/page.tsx — повноекранний layout без
// OfficeHeader-табів.
export default async function SlidesDeckPage({ params }: { params: Promise<{ deckId: string }> }) {
  const { deckId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: deck } = await supabase
    .from("office_slides")
    .select("id, title, slides, organization_id")
    .eq("id", deckId)
    .single();
  if (!deck) notFound();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)" }}>
      <header className="shrink-0" style={{ background: "rgba(10,10,10,0.9)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="px-4 sm:px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/office/slides" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors shrink-0">
              <ArrowLeft size={14} /> Презентації
            </Link>
            <span className="text-white/10">/</span>
            <QoraxLogo size="sm" />
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <SlidesEditorUI deckId={deck.id} initialTitle={deck.title} initialSlides={deck.slides} organizationId={deck.organization_id} />
      </div>
    </div>
  );
}
