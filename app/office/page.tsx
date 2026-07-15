import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { OfficeDocsListUI } from "./OfficeDocsListUI";
import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

export const metadata = { title: "Qorax Office" };

// Qorax Office (MODULE_ROADMAP.md, "Qorax Office — окремий продукт
// екосистеми") — ОКРЕМИЙ продукт, той самий рівень, що Creator і
// Dashboard: власний топ-левел роут, БЕЗ Dashboard-каркасу. MVP —
// тільки Docs mode (найвищий пріоритет з плану Артема: "зручний
// редактор документів"), решта (Sheets/Slides/Whiteboard/PDF
// Studio/Templates) — не цей прохід. Незалогінений відвідувач і
// далі бачить ProductComingSoon (маркетинговий текст із опису
// плану) — реальний продукт відкривається лише для залогінених,
// той самий підхід, що вже прийнятий для /creator.
export default async function OfficePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ProductComingSoon
        activePath="/office"
        eyebrow="QORAX OFFICE"
        name="Qorax Office"
        tagline="Працюйте з документами"
        description="AI-простір для документів, таблиць і презентацій — не аналог Word, а помічник, що робить основну роботу за вас."
        accent="lime"
        isLoggedIn={false}
        highlights={[
          { icon: FileText, title: "Docs", text: "Редактор документів з AI Writer, що сам збирає готовий текст, таблиці та оформлення." },
        ]}
      />
    );
  }

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
            <FileText size={20} style={{ color: "var(--lime)" }} />
            <h1 className="font-display text-2xl font-semibold">Qorax Office</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Docs — редактор документів з AI Writer. Sheets, Slides та решта режимів — незабаром.
          </p>
        </div>

        <OfficeDocsListUI organizationId={membership.organization_id} />
      </main>
    </div>
  );
}
