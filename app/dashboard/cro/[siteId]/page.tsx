import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { CroDetailUI } from "./CroDetailUI";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "CRO — Qorax" };

export default async function CroDetailPage({ params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name")
    .eq("id", siteId)
    .single();
  if (!site) redirect("/dashboard/cro");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-4xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard/cro" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> До CRO
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 sm:px-8 py-8">
        <CroDetailUI siteId={siteId} siteLabel={site.display_name || site.url} accessToken={accessToken} />
      </main>
    </div>
  );
}
