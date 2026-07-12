import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { ProjectsListUI } from "./ProjectsListUI";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Layout, ArrowLeft } from "lucide-react";

export const metadata = { title: "Sites — Qorax" };

// Sites-конструктор (MODULE_ROADMAP.md розділ 4; PLATFORM.md;
// DATA_MODEL.md розділ 2.1; EXECUTION_PLAN.md Фаза 3.1). Href
// '/dashboard/sites-builder' уже зареєстрований в platform_modules
// з міграції 0039 — навмисно НЕ '/dashboard/sites', бо той шлях
// зайнятий Audit-моніторингом (/dashboard/sites/[id]).
export default async function SitesBuilderPage() {
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
          <Link href="/dashboard" className="flex items-center gap-3">
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
              <Layout size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">Sites</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Конструктор сайтів з SEO-first підходом — створюйте й публікуйте сторінки без коду.
            </p>
          </div>

          <ProjectsListUI organizationId={membership.organization_id} />
        </main>
      </div>
    </div>
  );
}
