import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { CommerceDashboardUI } from "./CommerceDashboardUI";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ShoppingCart } from "lucide-react";

export default async function CommerceProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, domain, organization_id")
    .eq("id", projectId)
    .single();

  if (!project || project.organization_id !== membership.organization_id) notFound();

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const platformModules = await getPlatformModules(membership.organization_id);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard/commerce" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> Всі магазини
          </Link>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-3xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <ShoppingCart size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">{project.name}</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              {project.domain ? `${project.domain}.qorax.app` : "Ще не опубліковано"}
            </p>
          </div>

          <CommerceDashboardUI projectId={projectId} accessToken={accessToken} />
        </main>
      </div>
    </div>
  );
}
