import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrendingUp, ArrowLeft, Search } from "lucide-react";

export const metadata = { title: "Rank — Qorax" };

export default async function RankPage() {
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
      .select("id, url, display_name, gsc_connections(is_active)")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    getPlatformModules(membership.organization_id),
  ]);

  const sitesWithGsc = (sites ?? []).filter(s => {
    const conn = Array.isArray(s.gsc_connections) ? s.gsc_connections[0] : s.gsc_connections;
    return conn?.is_active;
  });
  const sitesWithoutGsc = (sites ?? []).filter(s => !sitesWithGsc.includes(s));

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
              <TrendingUp size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">Rank</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Позиції у пошуку по обраних запитах — на основі даних Google Search Console.
            </p>
          </div>

          {sitesWithGsc.length === 0 && sitesWithoutGsc.length === 0 && (
            <div className="glow-card p-10 text-center">
              <p className="text-sm text-[var(--text-secondary)]">У вас ще немає доданих сайтів.</p>
              <Link href="/dashboard/sites/new" className="mt-4 inline-block glow-button text-sm !py-2 !px-4">
                Додати сайт →
              </Link>
            </div>
          )}

          {sitesWithGsc.length > 0 && (
            <div className="space-y-2">
              {sitesWithGsc.map(site => (
                <Link
                  key={site.id}
                  href={`/dashboard/rank/${site.id}`}
                  className="glow-card p-4 flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Search size={16} className="shrink-0" style={{ color: "var(--cyan)" }} />
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

          {sitesWithoutGsc.length > 0 && (
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)] mb-2 mt-6">
                Без підключення Google Search Console
              </p>
              <div className="space-y-2">
                {sitesWithoutGsc.map(site => (
                  <Link
                    key={site.id}
                    href={`/dashboard/sites/${site.id}#gsc`}
                    className="rounded-xl p-4 flex items-center justify-between"
                    style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate opacity-70">{site.display_name || site.url}</p>
                      <p className="text-xs text-[var(--text-tertiary)] truncate">{site.url}</p>
                    </div>
                    <span className="text-xs font-mono shrink-0" style={{ color: "var(--cyan)" }}>
                      Підключити GSC →
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
