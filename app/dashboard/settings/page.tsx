import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { NotificationSettingsForm } from "./NotificationSettingsForm";

export const metadata = { title: "Налаштування — Qorax" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .single();

  const { data: org } = membership
    ? await supabase
        .from("organizations")
        .select("id, name, org_type, site_limit")
        .eq("id", membership.organization_id)
        .single()
    : { data: null };

  const { data: subscription } = membership
    ? await supabase
        .from("subscriptions")
        .select("status, plans(code, name, price_usd)")
        .eq("organization_id", membership.organization_id)
        .single()
    : { data: null };

  const { data: notifSettings } = membership
    ? await supabase
        .from("notification_settings")
        .select("*")
        .eq("organization_id", membership.organization_id)
        .single()
    : { data: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  // @ts-expect-error — Supabase вкладений join повертає об'єкт, не масив
  const planCode = subscription?.plans?.code ?? "starter";
  // @ts-expect-error
  const planName = subscription?.plans?.name ?? "Starter";
  const isTelegramAvailable = ["growth", "agency", "admin"].includes(planCode);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link href="/dashboard" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            ← Назад
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 sm:px-8 py-10 space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">Налаштування</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{user.email}</p>
        </div>

        {/* Plan info */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-4">Тариф</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{planName}</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                {org?.site_limit === 999999 ? "Необмежена кількість сайтів" : `До ${org?.site_limit ?? 1} сайт(ів)`}
              </p>
            </div>
            <span className="text-xs px-3 py-1.5 rounded-lg font-mono"
              style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--lime)" }}>
              {subscription?.status === "active" ? "Активний" : "—"}
            </span>
          </div>
        </div>

        {/* Profile */}
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-4">Профіль</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b hairline">
              <span className="text-sm text-[var(--text-secondary)]">Ім'я</span>
              <span className="text-sm">{profile?.full_name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-[var(--text-secondary)]">Email</span>
              <span className="text-sm font-mono">{user.email}</span>
            </div>
          </div>
        </div>

        {/* Notification settings — client form */}
        <NotificationSettingsForm
          organizationId={membership?.organization_id ?? ""}
          initialSettings={notifSettings}
          isTelegramAvailable={isTelegramAvailable}
          planName={planName}
        />
      </main>
    </div>
  );
}
