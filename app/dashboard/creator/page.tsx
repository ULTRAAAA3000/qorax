import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { CreatorBoardsListUI } from "./CreatorBoardsListUI";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LayoutTemplate } from "lucide-react";

export const metadata = { title: "Qorax Creator — Qorax" };

// Qorax Creator (MODULE_ROADMAP.md, "Qorax Creator — візуальна
// платформа створення"). MVP цієї сторінки — ТІЛЬКИ Website Mode:
// список дощок, на кожній дошці один embedded_editor вузол, що
// показує вже наявний Sites-редактор у рамці на canvas. Organization-
// рівня (той самий рівень, що Team Workspace, не project/site-рівня).
export default async function CreatorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const platformModules = await getPlatformModules(membership.organization_id);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard/home" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> До Audit
          </Link>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <LayoutTemplate size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">Qorax Creator</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Візуальне полотно. Website Mode — вбудований Sites-редактор прямо на дошці.
            </p>
          </div>

          <CreatorBoardsListUI organizationId={membership.organization_id} />
        </main>
      </div>
    </div>
  );
}
