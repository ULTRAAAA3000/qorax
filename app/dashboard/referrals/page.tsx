import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ReferralDashboard } from "./ReferralDashboard";

export const metadata = { title: "Партнерська програма — Qorax" };

export default async function ReferralsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";
  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-4xl px-6 sm:px-8 h-16 flex items-center gap-4">
          <Link href="/dashboard" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <QoraxLogo size="sm" />
          <span className="text-sm text-[var(--text-tertiary)]">Партнерська програма</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 sm:px-8 py-10 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold mb-2">Партнерська програма</h1>
          <p className="text-sm text-[var(--text-secondary)] leading-relaxed max-w-xl">
            Поділіться своїм посиланням — за кожного клієнта, який зареєструється за ним і оплатить
            підписку протягом 30 днів, ви отримаєте 25% від суми першого платежу.
          </p>
        </div>

        <ReferralDashboard accessToken={accessToken} workerUrl={workerUrl} />
      </main>
    </div>
  );
}
