import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { BrowserUI } from "./BrowserUI";
import { redirect } from "next/navigation";
import { Globe } from "lucide-react";

export const metadata = { title: "Qorax Browser" };

// Qorax Browser (MODULE_ROADMAP.md, "Qorax Browser — окремий продукт
// екосистеми") — ОКРЕМИЙ продукт, той самий рівень, що Creator і
// Office: власний топ-левел роут, БЕЗ Dashboard-каркасу. MVP
// (узгоджено з Артемом): лише URL bar + proxy-перегляд сайту + AI
// Sidebar ("що це за сайт?").
//
// Незалогінений відвідувач одразу редиректиться на /login (той самий
// підхід, що вже був у /creator) — Артем явно попросив прибрати
// ProductComingSoon-заглушку для незалогінених: сесія Supabase
// спільна на весь домен (cookie path="/"), тому якщо вхід уже
// кешований в іншій вкладці/раніше, redirect на /login одразу ж сам
// поверне користувача назад сюди через middleware (user && pathname
// === "/login" → /dashboard, звідки Sidebar веде в реальний продукт).
// Якщо кешу немає — людина одразу бачить форму входу, а не маркетинг-
// текст "У розробці", який раніше вводив в оману, ніби продукту
// нема, хоча код давно готовий.
export default async function BrowserPage() {
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
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-full px-4 h-14 flex items-center gap-3">
          <QoraxLogo size="sm" />
          <div className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
            <Globe size={13} style={{ color: "var(--cyan)" }} />
            Browser
          </div>
        </div>
      </header>

      <BrowserUI organizationId={membership.organization_id} />
    </div>
  );
}

