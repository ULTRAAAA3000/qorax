import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, User, CreditCard } from "lucide-react";
import { CopyButton } from "@/app/components/CopyButton";
import { NotificationSettingsForm } from "./NotificationSettingsForm";
import { WhiteLabelSettingsForm } from "./WhiteLabelSettingsForm";
import { TeamSettingsForm } from "./TeamSettingsForm";
import { DeveloperApiSettingsForm } from "./DeveloperApiSettingsForm";

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
    ? await supabase.from("organizations").select("id, name, org_type, site_limit, url, white_label_enabled, white_label_logo_url, white_label_company_name").eq("id", membership.organization_id).single()
    : { data: null };

  const { data: subscription } = membership
    ? await supabase.from("subscriptions").select("status, plans(code, name, price_usd)").eq("organization_id", membership.organization_id).single()
    : { data: null };

  const { data: notifSettings } = membership
    ? await supabase.from("notification_settings").select("*").eq("organization_id", membership.organization_id).single()
    : { data: null };

  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", user.id).single();

  // @ts-expect-error — Supabase повертає nested join як масив без !inner, тип не співпадає з фактичним об'єктом
  const planCode = subscription?.plans?.code ?? "starter";
  // @ts-expect-error — Supabase повертає nested join як масив без !inner, тип не співпадає з фактичним об'єктом
  const planName = subscription?.plans?.name ?? "Starter";
  const isTelegramAvailable = ["growth", "agency", "admin"].includes(planCode);
  const isActive = subscription?.status === "active";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Navbar */}
      <header className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.8)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/dashboard/home"><QoraxLogo size="sm" /></Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <Link href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <ArrowLeft size={13} /> Дашборд
            </Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <span className="text-sm text-[var(--text-primary)]">Налаштування</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 sm:px-8 py-8 space-y-4">
        <div className="mb-6">
          <h1 className="font-display text-xl font-semibold">Налаштування</h1>
          <p className="text-sm text-[var(--text-tertiary)] mt-0.5">{user.email}</p>
        </div>

        {/* Plan */}
        <div className="rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5 mb-4">
            <CreditCard size={14} className="text-[var(--text-tertiary)]" />
            <h2 className="text-sm font-semibold">Тариф</h2>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{planName}</p>
              <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
                {org?.site_limit === 999999 ? "Необмежена кількість сайтів" : `До ${org?.site_limit ?? 1} сайт(ів)`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs px-2.5 py-1 rounded-lg font-mono"
                style={{
                  background: isActive ? "rgba(214,255,63,0.08)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${isActive ? "rgba(214,255,63,0.2)" : "rgba(255,255,255,0.08)"}`,
                  color: isActive ? "var(--lime)" : "var(--text-tertiary)",
                }}>
                {isActive ? "Активний" : "—"}
              </span>
              <Link href="/dashboard/upgrade"
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                style={{ background: "var(--lime)", color: "#0a0a0a" }}>
                Змінити →
              </Link>
            </div>
          </div>
        </div>

        {/* Profile */}
        <div className="rounded-2xl p-5"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
          <div className="flex items-center gap-2.5 mb-4">
            <User size={14} className="text-[var(--text-tertiary)]" />
            <h2 className="text-sm font-semibold">Профіль</h2>
          </div>
          <div className="space-y-0 divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            <div className="flex items-center justify-between py-3 first:pt-0">
              <span className="text-sm text-[var(--text-tertiary)]">Ім&apos;я</span>
              <span className="text-sm">{profile?.full_name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between py-3">
              <span className="text-sm text-[var(--text-tertiary)]">Email</span>
              <span className="text-sm font-mono text-[var(--text-secondary)]">{user.email}</span>
            </div>
            {org?.id && (
              <div className="flex items-center justify-between py-3 last:pb-0 gap-3">
                <span className="text-sm text-[var(--text-tertiary)] shrink-0">Organization ID</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="text-xs font-mono text-[var(--text-secondary)] truncate" title={org.id}>{org.id}</span>
                  <CopyButton value={org.id} iconSize={12} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Support info — для звернень у підтримку */}
        <div className="rounded-2xl px-5 py-3.5 flex items-center justify-between"
          style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}>
          <span className="text-xs text-[var(--text-tertiary)]">
            Пишете в підтримку? Скопіюйте User ID — це прискорить діагностику.
          </span>
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-mono text-[var(--text-tertiary)] hidden sm:inline">{user.id.slice(0, 8)}…</span>
            <CopyButton value={user.id} iconSize={12} label="User ID" />
          </div>
        </div>

        {/* Agency white-label settings */}
        {org?.org_type === "agency" && (
          <WhiteLabelSettingsForm
            organizationId={org.id}
            initialEnabled={org.white_label_enabled ?? false}
            initialCompanyName={org.white_label_company_name}
            initialLogoUrl={org.white_label_logo_url}
            orgName={org.name}
          />
        )}

        {/* Team / invites */}
        <TeamSettingsForm hasAccess={["growth", "agency", "admin", "trial"].includes(planCode)} />

        {/* Notifications */}
        <NotificationSettingsForm
          organizationId={membership?.organization_id ?? ""}
          initialSettings={notifSettings}
          isTelegramAvailable={isTelegramAvailable}
          planName={planName}
          telegramBotName={process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? "QoraxBot"}
        />

        {/* Developer API — Qorax SEO Platform MVP */}
        <DeveloperApiSettingsForm />
      </main>
    </div>
  );
}
