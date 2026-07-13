import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { AnalyticsDetailUI } from "./AnalyticsDetailUI";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, BarChart3 } from "lucide-react";

// Той самий патерн, що app/dashboard/rank/[siteId]/page.tsx — server
// component перевіряє доступ і передає siteId/accessToken у клієнтський
// UI-компонент, який вже сам ходить у worker API.

export default async function AnalyticsSiteDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name, organization_id")
    .eq("id", siteId)
    .single();

  if (!site || site.organization_id !== membership.organization_id) notFound();

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const platformModules = await getPlatformModules(membership.organization_id);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard/home" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard/analytics" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> Всі сайти
          </Link>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-3xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <BarChart3 size={20} style={{ color: "var(--lime)" }} />
              <h1 className="font-display text-2xl font-semibold">{site.display_name || site.url}</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">{site.url}</p>
          </div>

          <AnalyticsDetailUI siteId={siteId} accessToken={accessToken} />
        </main>
      </div>
    </div>
  );
}
