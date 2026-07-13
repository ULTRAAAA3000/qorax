import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart3, ArrowLeft } from "lucide-react";

// Структура повторює app/dashboard/rank/page.tsx (той самий патерн:
// список сайтів організації, розділений на "підключено"/"не підключено"
// за is_active з відповідної *_connections таблиці) — тут ga4_connections
// замість gsc_connections.

export const metadata = { title: "Analytics — Qorax" };

export default async function AnalyticsPage() {
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
      .select("id, url, display_name, ga4_connections(is_active)")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    getPlatformModules(membership.organization_id),
  ]);

  const sitesWithGa4 = (sites ?? []).filter(s => {
    const conn = Array.isArray(s.ga4_connections) ? s.ga4_connections[0] : s.ga4_connections;
    return conn?.is_active;
  });
  const sitesWithoutGa4 = (sites ?? []).filter(s => !sitesWithGa4.includes(s));

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
              <BarChart3 size={20} style={{ color: "var(--lime)" }} />
              <h1 className="font-display text-2xl font-semibold">Analytics</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Трафік і конверсії на основі даних Google Analytics 4.
            </p>
          </div>

          {sitesWithGa4.length === 0 && sitesWithoutGa4.length === 0 && (
            <div className="glow-card p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">У вас ще немає доданих сайтів.</p>
              <Link href="/dashboard/sites/new" className="mt-4 inline-block glow-button text-sm !py-2 !px-4">
                Додати сайт →
              </Link>
            </div>
          )}

          {sitesWithGa4.length > 0 && (
            <div className="space-y-2">
              {sitesWithGa4.map(site => (
                <Link
                  key={site.id}
                  href={`/dashboard/analytics/${site.id}`}
                  className="glow-card p-4 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 size={16} className="shrink-0" style={{ color: "var(--lime)" }} />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{site.display_name || site.url}</p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">{site.url}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono text-[var(--text-tertiary)] shrink-0 group-hover:text-[var(--lime)] transition-colors">
                    Переглянути →
                  </span>
                </Link>
              ))}
            </div>
          )}

          {sitesWithoutGa4.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)] mb-2 mt-6">
                Без підключення Google Analytics 4
              </p>
              <div className="space-y-2">
                {sitesWithoutGa4.map(site => (
                  <Link
                    key={site.id}
                    href={`/dashboard/analytics/${site.id}`}
                    className="rounded-xl p-4 flex items-center justify-between"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate opacity-70">{site.display_name || site.url}</p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">{site.url}</p>
                    </div>
                    <span className="text-xs font-mono shrink-0" style={{ color: "var(--lime)" }}>
                      Підключити GA4 →
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
