import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { BenchmarkUI } from "./BenchmarkUI";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BarChart2 } from "lucide-react";

// Org-scoped сторінка (не per-site, як analytics/[siteId] чи cro/[siteId]) —
// той самий верхньорівневий layout, що app/dashboard/crm/page.tsx
// (requireOrgAccess() у worker, не requireOrgAccessForSite).

export default async function BenchmarkPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const { data: org } = await supabase
    .from("organizations")
    .select("industry, country, business_size")
    .eq("id", membership.organization_id)
    .single();

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
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-3xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <BarChart2 size={20} style={{ color: "var(--lime)" }} />
              <h1 className="font-display text-2xl font-semibold">Benchmarking</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">Порівняння ваших показників з ринком — за галуззю, країною та розміром бізнесу</p>
          </div>

          <BenchmarkUI
            organizationId={membership.organization_id}
            accessToken={accessToken}
            hasProfile={Boolean(org?.industry || org?.country || org?.business_size)}
          />
        </main>
      </div>
    </div>
  );
}
