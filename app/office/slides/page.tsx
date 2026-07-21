import { createClient } from "@/app/lib/supabase/server";
import { OfficeHeader } from "../OfficeHeader";
import { OfficeSlidesListUI } from "./OfficeSlidesListUI";
import { redirect } from "next/navigation";
import { Presentation } from "lucide-react";

export const metadata = { title: "Qorax Office — Slides" };

// Той самий підхід, що /office/page.tsx (Docs) і /office/sheets/page.tsx:
// незалогінений відвідувач одразу редиректиться на /login, без
// ProductComingSoon-заглушки (прибрана за прямою вказівкою Артема).
export default async function OfficeSlidesPage() {
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
      <OfficeHeader active="slides" />

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <Presentation size={20} style={{ color: "var(--lime)" }} />
            <h1 className="font-display text-2xl font-semibold">Презентації</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Слайди з AI-генерацією структури та повноекранним режимом показу.
          </p>
        </div>

        <OfficeSlidesListUI organizationId={membership.organization_id} />
      </main>
    </div>
  );
}
