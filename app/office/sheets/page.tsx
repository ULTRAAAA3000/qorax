import { createClient } from "@/app/lib/supabase/server";
import { OfficeHeader } from "../OfficeHeader";
import { OfficeSheetsListUI } from "./OfficeSheetsListUI";
import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { redirect } from "next/navigation";
import { Table2 } from "lucide-react";

export const metadata = { title: "Qorax Office — Sheets" };

// Той самий підхід, що /office/page.tsx (Docs) — окремий топ-левел
// продукт, спільна сесія, ProductComingSoon для незалогінених.
export default async function OfficeSheetsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ProductComingSoon
        activePath="/office"
        eyebrow="QORAX OFFICE"
        name="Qorax Office"
        tagline="Працюйте з таблицями"
        description="Прості таблиці з формулами, CSV-імпортом/експортом і AI, що сам будує структуру за описом."
        accent="lime"
        isLoggedIn={false}
        highlights={[
          { icon: Table2, title: "Sheets", text: "Таблиці з базовими формулами, CSV та AI-генерацією структури." },
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
      <OfficeHeader active="sheets" />

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Table2 size={20} style={{ color: "var(--lime)" }} />
            <h1 className="font-display text-2xl font-semibold">Таблиці</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Прості таблиці з формулами SUM/AVERAGE/COUNT, CSV та AI-генерацією структури.
          </p>
        </div>

        <OfficeSheetsListUI organizationId={membership.organization_id} />
      </main>
    </div>
  );
}
