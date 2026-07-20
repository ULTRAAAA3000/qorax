import { createClient } from "@/app/lib/supabase/server";
import { OfficeHeader } from "./OfficeHeader";
import { OfficeDocsListUI } from "./OfficeDocsListUI";
import { redirect } from "next/navigation";
import { FileText } from "lucide-react";

export const metadata = { title: "Qorax Office" };

// Qorax Office (MODULE_ROADMAP.md, "Qorax Office — окремий продукт
// екосистеми") — ОКРЕМИЙ продукт, той самий рівень, що Creator і
// Dashboard: власний топ-левел роут, БЕЗ Dashboard-каркасу. MVP —
// тільки Docs mode (найвищий пріоритет з плану Артема: "зручний
// редактор документів"), решта (Sheets/Slides/Whiteboard/PDF
// Studio/Templates) — не цей прохід.
//
// Незалогінений відвідувач одразу редиректиться на /login (той самий
// підхід, що вже був у /creator) — ProductComingSoon-заглушка
// прибрана за прямою вказівкою Артема: сесія Supabase спільна на
// весь домен, тому кешований вхід одразу поверне сюди через
// middleware, а без кешу людина одразу бачить форму входу, а не
// маркетинг-текст "У розробці", який вводив в оману.
export default async function OfficePage() {
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
      <OfficeHeader active="docs" />

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <FileText size={20} style={{ color: "var(--lime)" }} />
            <h1 className="font-display text-2xl font-semibold">Документи</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Редактор документів з AI Writer і бібліотекою шаблонів.
          </p>
        </div>

        <OfficeDocsListUI organizationId={membership.organization_id} />
      </main>
    </div>
  );
}
