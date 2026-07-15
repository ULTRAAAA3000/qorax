import { ProductComingSoon } from "@/app/components/ProductComingSoon";
import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { BrowserUI } from "./BrowserUI";
import { redirect } from "next/navigation";
import { Sparkles, ScanSearch, FolderOpen, Globe } from "lucide-react";

export const metadata = { title: "Qorax Browser" };

// Qorax Browser (MODULE_ROADMAP.md, "Qorax Browser — окремий продукт
// екосистеми") — ОКРЕМИЙ продукт, той самий рівень, що Creator і
// Office: власний топ-левел роут, БЕЗ Dashboard-каркасу. MVP
// (узгоджено з Артемом): лише URL bar + proxy-перегляд сайту + AI
// Sidebar ("що це за сайт?"). Незалогінений відвідувач бачить
// ProductComingSoon — той самий підхід, що вже прийнятий для
// /creator і /office.
export default async function BrowserPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return (
      <ProductComingSoon
        activePath="/browser"
        eyebrow="QORAX BROWSER"
        name="Qorax Browser"
        tagline="Досліджуйте інтернет"
        description="Робочий браузер для творців, маркетологів і підприємців: аналізує сайти, збирає ідеї та передає їх у решту екосистеми Qorax."
        accent="cyan"
        isLoggedIn={false}
        highlights={[
          { icon: Sparkles, title: "AI Sidebar", text: "AI на будь-якій сторінці — пояснює сайт, робить SEO-аудит, готує макет чи лист одним запитом." },
          { icon: ScanSearch, title: "Site Inspector", text: "Шрифти, кольори, компоненти, SEO, швидкість і технології будь-якого сайту в один клік." },
          { icon: FolderOpen, title: "Collections", text: "Конкуренти, референси, статті та ідеї одного проєкту в одному місці — заміна закладкам." },
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

