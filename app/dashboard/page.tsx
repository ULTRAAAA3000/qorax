import { createClient } from "@/app/lib/supabase/server";
import { signOut } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Zap, Settings, LogOut, Plus } from "lucide-react";
import { SiteCard } from "./SiteCard";

export const metadata = { title: "Дашборд — Qorax" };

function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; new?: string; site?: string; plan?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const [{ data: org }, { data: subscription }, { data: sites }, profile] = await Promise.all([
    membership
      ? supabase.from("organizations").select("name, org_type, site_limit").eq("id", membership.organization_id).single()
      : Promise.resolve({ data: null }),
    membership
      ? supabase.from("subscriptions")
          .select("status, trial_ends_at, plans(code, name)")
          .eq("organization_id", membership.organization_id)
          .in("status", ["trialing", "active", "canceled", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
    supabase.from("sites")
      .select("id, url, display_name, monitoring_enabled, created_at")
      .eq("organization_id", membership?.organization_id ?? "")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("full_name, platform_role").eq("id", user.id).single(),
  ]);

  const firstName = profile.data?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "друже";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planCode = (subscription as any)?.plans?.code as string | undefined;
  const subStatus = subscription?.status;
  const trialEndsAt = subscription?.trial_ends_at ?? null;
  const daysLeft = trialDaysLeft(trialEndsAt);

  const isTrial = planCode === "trial" && subStatus === "trialing";
  const isTrialExpired = planCode === "trial" && subStatus === "canceled";
  const isFree = planCode === "free";
  const isPaid = subStatus === "active" && planCode !== "trial" && planCode !== "free";

  const planLabel = isPaid && planCode
    ? planCode.charAt(0).toUpperCase() + planCode.slice(1)
    : isTrial ? "Trial" : "Free";

  const planColor = isPaid ? "var(--lime)" : isTrial ? "var(--cyan)" : "var(--text-tertiary)";
  const planBg = isPaid ? "rgba(214,255,63,0.08)" : isTrial ? "rgba(140,246,255,0.08)" : "rgba(255,255,255,0.04)";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Navbar ── */}
      <header
        className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.8)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link href="/"><QoraxLogo size="sm" /></Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <Link
              href="/dashboard/upgrade"
              className="text-xs font-mono px-2.5 py-1 rounded-md transition-opacity hover:opacity-80"
              style={{ background: planBg, color: planColor, border: `1px solid ${planColor}30` }}
            >
              {planLabel}
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {!isPaid && (
              <Link href="/dashboard/upgrade"
                className="text-xs font-semibold px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 mr-1"
                style={{ background: "var(--lime)", color: "#0a0a0a" }}>
                Upgrade
              </Link>
            )}
            {profile.data?.platform_role === "admin" && (
              <Link href="/dashboard/admin"
                className="text-xs font-mono px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ background: "rgba(214,255,63,0.08)", color: "var(--lime)", border: "1px solid rgba(214,255,63,0.2)" }}>
                ADMIN
              </Link>
            )}
            <Link href="/dashboard/settings"
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5">
              <Settings size={15} />
            </Link>
            <form action={signOut}>
              <button type="submit"
                className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5">
                <LogOut size={15} />
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-5">

        {/* ── Welcome banner ── */}
        {params.welcome === "1" && !params.plan && (
          <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
            style={{ background: "rgba(214,255,63,0.06)", border: "1px solid rgba(214,255,63,0.2)" }}>
            <span className="h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}>✓</span>
            <p className="text-sm">
              Ласкаво просимо, <span className="font-medium">{firstName}</span>! 14-денний тріал активовано — додайте перший сайт.
            </p>
          </div>
        )}

        {params.welcome === "1" && params.plan && (
          <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
            style={{ background: "rgba(214,255,63,0.06)", border: "1px solid rgba(214,255,63,0.2)" }}>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--lime)" }}>Ласкаво просимо, {firstName}!</p>
              <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                Тріал активовано. Оберіть план <span className="font-medium">{params.plan.charAt(0).toUpperCase() + params.plan.slice(1)}</span> коли будете готові.
              </p>
            </div>
            <Link href={`/dashboard/upgrade?plan=${params.plan}`}
              className="shrink-0 text-sm font-medium px-4 py-2 rounded-xl hover:opacity-80 transition-opacity"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}>
              До оплати →
            </Link>
          </div>
        )}

        {params.new === "1" && (
          <div className="rounded-2xl px-5 py-4 flex items-center gap-3"
            style={{ background: "rgba(140,246,255,0.05)", border: "1px solid rgba(140,246,255,0.15)" }}>
            <span className="h-1.5 w-1.5 rounded-full animate-pulse shrink-0" style={{ background: "var(--cyan)" }} />
            <p className="text-sm">Сайт додано — моніторинг розпочато. Перші дані з&apos;являться за кілька хвилин.</p>
          </div>
        )}

        {/* ── Trial banner ── */}
        {isTrial && !isTrialExpired && (
          <div className="rounded-2xl px-5 py-4 flex items-center justify-between gap-4"
            style={{
              background: daysLeft <= 3 ? "rgba(245,166,35,0.05)" : "rgba(140,246,255,0.04)",
              border: `1px solid ${daysLeft <= 3 ? "rgba(245,166,35,0.25)" : "rgba(140,246,255,0.15)"}`,
            }}>
            <div className="flex items-center gap-2.5">
              <Clock size={14} style={{ color: daysLeft <= 3 ? "#F5A623" : "var(--cyan)", flexShrink: 0 }} />
              <p className="text-sm">
                {daysLeft > 0 ? (
                  <><span style={{ color: daysLeft <= 3 ? "#F5A623" : "var(--cyan)" }} className="font-medium">
                    Тріал: {daysLeft} {daysLeft === 1 ? "день" : daysLeft < 5 ? "дні" : "днів"}
                  </span>{" "}— повний доступ безкоштовно</>
                ) : (
                  <span style={{ color: "#F5A623" }} className="font-medium">Тріал закінчується сьогодні</span>
                )}
              </p>
            </div>
            <Link href="/dashboard/upgrade"
              className="shrink-0 text-xs font-semibold px-4 py-2 rounded-xl hover:opacity-80 transition-opacity"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}>
              Обрати план →
            </Link>
          </div>
        )}

        {/* ── Expired / Free banner ── */}
        {(isTrialExpired || (isFree && !isPaid)) && (
          <div className="rounded-2xl p-5"
            style={{ background: "rgba(245,103,90,0.04)", border: "1px solid rgba(245,103,90,0.2)" }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold mb-1" style={{ color: "#F5675A" }}>
                  {isTrialExpired ? "Тріал завершено" : "Безкоштовний план"}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {isTrialExpired
                    ? "Uptime перевіряється раз на 30 хв. Оберіть план щоб відновити повний доступ."
                    : "Uptime раз на 30 хв. Starter додає 5-хвилинні перевірки, SSL, швидкість та AI."}
                </p>
              </div>
              <Link href="/dashboard/upgrade"
                className="shrink-0 text-sm font-semibold px-5 py-2.5 rounded-xl hover:opacity-80 transition-opacity"
                style={{ background: "var(--lime)", color: "#0a0a0a" }}>
                Обрати план
              </Link>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {["⚡ Перевірки кожні 5 хв", "🔒 SSL і домен", "✦ AI Revenue Impact"].map(f => (
                <span key={f} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Page header ── */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <h1 className="font-display text-xl font-semibold">Ваші сайти</h1>
            <p className="text-sm text-[var(--text-tertiary)] mt-0.5">
              {sites?.length ?? 0} / {org?.site_limit ?? 1} сайтів
            </p>
          </div>
          <Link href="/dashboard/sites/new"
            className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-4 py-2.5 hover:opacity-90 transition-opacity"
            style={{ background: "var(--lime)", color: "#0a0a0a" }}>
            <Plus size={14} />
            Додати сайт
          </Link>
        </div>

        {/* ── Sites list ── */}
        {!sites || sites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            {sites.map((site, i) => <SiteCard key={site.id} site={site} index={i} />)}
          </div>
        )}

        {/* ── Upgrade nudge for late-trial ── */}
        {isTrial && daysLeft > 0 && daysLeft <= 7 && (
          <div className="rounded-2xl p-5 flex items-center justify-between gap-4"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(214,255,63,0.08)", border: "1px solid rgba(214,255,63,0.15)" }}>
                <Zap size={14} style={{ color: "var(--lime)" }} />
              </div>
              <div>
                <p className="text-sm font-medium">Продовжте без перерви</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Starter — $49/міс · відміна в будь-який момент</p>
              </div>
            </div>
            <Link href="/dashboard/upgrade"
              className="shrink-0 text-sm font-semibold px-4 py-2 rounded-xl hover:opacity-80 transition-opacity"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}>
              Перейти на Starter →
            </Link>
          </div>
        )}

      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl p-14 text-center"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
      <div
        className="h-14 w-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
        <span className="font-mono text-2xl text-[var(--text-tertiary)]">⊡</span>
      </div>
      <h2 className="font-display text-lg font-semibold mb-2">Сайтів ще немає</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-xs mx-auto">
        Додайте перший сайт — Qorax почне стежити за швидкістю, SSL та SEO.
      </p>
      <Link href="/dashboard/sites/new"
        className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl px-6 py-3 hover:opacity-90 transition-opacity"
        style={{ background: "var(--lime)", color: "#0a0a0a" }}>
        <Plus size={14} />
        Додати перший сайт
      </Link>
    </div>
  );
}
