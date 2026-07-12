import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShoppingCart, ArrowLeft } from "lucide-react";

export const metadata = { title: "Commerce — Qorax" };

// Commerce (MODULE_ROADMAP.md розділ 6) — інтернет-магазини поверх
// Sites-конструктора (projects.id, НЕ sites.id — sites це моніторинг,
// критичне правило з PLATFORM.md). Список тут — усі projects
// організації; вибір конкретного веде на /dashboard/commerce/[projectId],
// де вже керування товарами/замовленнями/купонами.
export default async function CommercePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const [{ data: projects }, platformModules] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, status")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    getPlatformModules(membership.organization_id),
  ]);

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
              <ShoppingCart size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">Commerce</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Товари, замовлення та купони для магазинів на базі Sites-конструктора.
            </p>
          </div>

          {(projects ?? []).length === 0 && (
            <div className="glow-card p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">
                Спочатку створіть сайт у конструкторі — Commerce керує товарами для конкретного проєкту.
              </p>
              <Link href="/dashboard/sites-builder" className="mt-4 inline-block glow-button text-sm !py-2 !px-4">
                Перейти до Sites →
              </Link>
            </div>
          )}

          {(projects ?? []).length > 0 && (
            <div className="space-y-2">
              {(projects ?? []).map(project => (
                <Link
                  key={project.id}
                  href={`/dashboard/commerce/${project.id}`}
                  className="glow-card p-4 flex items-center justify-between group"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{project.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">
                      {project.domain ? `${project.domain}.qorax.app` : "Ще не опубліковано"}
                    </p>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-tertiary)] shrink-0 group-hover:text-[var(--cyan)] transition-colors">
                    Керувати товарами →
                  </span>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
