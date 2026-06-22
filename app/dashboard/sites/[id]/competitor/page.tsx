import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CompetitorManager } from "./CompetitorManager";

export const metadata = { title: "Конкуренти — Qorax" };

export default async function CompetitorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name")
    .eq("id", id)
    .single();
  if (!site) notFound();

  // Перевіряємо план — мониторинг конкурентов только для Growth+
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const { data: subscription } = membership
    ? await supabase
        .from("subscriptions")
        .select("plans(code)")
        .eq("organization_id", membership.organization_id)
        .single()
    : { data: null };

  // @ts-expect-error
  const planCode = subscription?.plans?.code ?? "starter";
  const isGrowthPlus = ["growth", "agency", "admin"].includes(planCode);

  const { data: competitors } = await supabase
    .from("competitor_sites")
    .select("id, url, display_name, last_checked_at")
    .eq("site_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link href={`/dashboard/sites/${id}`} className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            ← Назад
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 sm:px-8 py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold">Моніторинг конкурентів</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1 font-mono">{new URL(site.url).hostname}</p>
        </div>

        <CompetitorManager
          siteId={id}
          competitors={competitors ?? []}
          isGrowthPlus={isGrowthPlus}
          planCode={planCode}
        />
      </main>
    </div>
  );
}
