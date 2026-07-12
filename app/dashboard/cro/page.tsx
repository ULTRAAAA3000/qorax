import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Target, ArrowLeft } from "lucide-react";

export const metadata = { title: "CRO — Qorax" };

// CRO (MODULE_ROADMAP.md розділ 9; EXECUTION_PLAN.md Фаза 2.6) —
// четвертий і останній модуль хвилі 2. Site-scoped (як Rank), не
// organization-рівня (як CRM/Social) — той самий UI-патерн, що
// app/dashboard/rank/page.tsx: список сайтів → детальна сторінка сайту.

export default async function CroPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const [{ data: sites }, platformModules] = await Promise.all([
    supabase
      .from("sites")
      .select("id, url, display_name")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    getPlatformModules(membership.organization_id),
  ]);

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
              <Target size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">CRO</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Воронка конверсії: перегляди → CTA → форма → відправка. Доступно на тарифі Growth і вище.
            </p>
          </div>

          {(!sites || sites.length === 0) && (
            <div className="glow-card p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">У вас ще немає доданих сайтів.</p>
              <Link href="/dashboard/sites/new" className="mt-4 inline-block glow-button text-sm !py-2 !px-4">
                Додати сайт →
              </Link>
            </div>
          )}

          {sites && sites.length > 0 && (
            <div className="space-y-2">
              {sites.map(site => (
                <Link
                  key={site.id}
                  href={`/dashboard/cro/${site.id}`}
                  className="glow-card p-4 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Target size={16} className="shrink-0" style={{ color: "var(--cyan)" }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{site.display_name || site.url}</p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">{site.url}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-tertiary)] shrink-0 group-hover:text-[var(--cyan)] transition-colors">
                    Переглянути →
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
