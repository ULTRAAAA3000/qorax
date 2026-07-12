import { createClient } from "@/app/lib/supabase/server";
import { signOut } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Zap, Settings, LogOut, Plus, Gift } from "lucide-react";
import { SiteCard } from "./SiteCard";
import { SitesListControls } from "./SitesListControls";
import { OnboardingChecklist } from "./OnboardingChecklist";
import { PortfolioHealthCard } from "./PortfolioHealthCard";
import { PlatformSidebar } from "./PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";

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
      ? supabase.from("organizations").select("name, org_type, site_limit, onboarding_dismissed").eq("id", membership.organization_id).single()
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
      .select("id, url, display_name, monitoring_enabled, created_at, maintenance_until")
      .eq("organization_id", membership?.organization_id ?? "")
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("full_name, platform_role").eq("id", user.id).single(),
  ]);

  const platformModules = await getPlatformModules(membership?.organization_id ?? null);

  // Відкриті інциденти для всіх сайтів організації одним запитом —
  // потрібно для статусу up/down у списку (сортування, груповий badge).
  const siteIds = (sites ?? []).map(s => s.id);
  const { data: openIncidents } = siteIds.length
    ? await supabase
        .from("uptime_incidents")
        .select("site_id")
        .in("site_id", siteIds)
        .is("resolved_at", null)
    : { data: [] as { site_id: string }[] };

  const downSiteIds = new Set((openIncidents ?? []).map(i => i.site_id));

  const now = Date.now();
  const sitesWithStatus = (sites ?? []).map(site => {
    const inMaintenance = !!site.maintenance_until && new Date(site.maintenance_until).getTime() > now;
    const isDown = !inMaintenance && downSiteIds.has(site.id);
    return { ...site, isDown, inMaintenance };
  });
  const downCount = sitesWithStatus.filter(s => s.isDown).length;

  // ── Onboarding checklist ──
  // 3 кроки: додати сайт, дочекатись першої перевірки, email-алерт готовий.
  // Прогрес обчислюється на льоту з існуючих таблиць — окремого
  // сховища прогресу по кроках не потрібно, тільки прапорець "приховано".
  let hasFirstCheck = false;
  if (siteIds.length > 0) {
    const { count } = await supabase
      .from("uptime_checks")
      .select("id", { count: "exact", head: true })
      .in("site_id", siteIds)
      .limit(1);
    hasFirstCheck = (count ?? 0) > 0;
  }

  const { data: notifSettings } = membership
    ? await supabase
        .from("notification_settings")
        .select("email_enabled")
        .eq("organization_id", membership.organization_id)
        .maybeSingle()
    : { data: null };

  const onboardingSteps = {
    hasSite: sitesWithStatus.length > 0,
    hasFirstCheck,
    hasEmailAlert: notifSettings?.email_enabled ?? true, // true за замовчуванням навіть без рядка в БД
  };
  const onboardingDone = onboardingSteps.hasSite && onboardingSteps.hasFirstCheck && onboardingSteps.hasEmailAlert;
  const showOnboarding = !org?.onboarding_dismissed && !onboardingDone;

  // ── Portfolio health (7 днів) ──
  // Показуємо тільки коли є 2+ сайти — для одного сайту це дублює
  // детальну сторінку сайту без нової інформації.
  let portfolioHealth: {
    uptimePct: number | null;
    incidentsCount: number;
    avgSpeedMs: number | null;
    prevAvgSpeedMs: number | null;
    bestSite: { name: string; uptimePct: number } | null;
    worstSite: { name: string; uptimePct: number } | null;
  } | null = null;

  if (siteIds.length >= 2) {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

    const [{ data: uptimeChecks }, { data: incidents }, { data: speedChecks }, { data: prevSpeedChecks }] = await Promise.all([
      supabase
        .from("uptime_checks")
        .select("site_id, status")
        .in("site_id", siteIds)
        .gte("checked_at", weekAgo),
      supabase
        .from("uptime_incidents")
        .select("id")
        .in("site_id", siteIds)
        .gte("started_at", weekAgo),
      supabase
        .from("speed_checks")
        .select("load_time_ms")
        .in("site_id", siteIds)
        .gte("checked_at", weekAgo),
      supabase
        .from("speed_checks")
        .select("load_time_ms")
        .in("site_id", siteIds)
        .gte("checked_at", twoWeeksAgo)
        .lt("checked_at", weekAgo),
    ]);

    const checks = uptimeChecks ?? [];
    const totalChecks = checks.length;
    const upChecks = checks.filter(c => c.status === "up").length;
    const uptimePct = totalChecks > 0 ? (upChecks / totalChecks) * 100 : null;

    const speeds = (speedChecks ?? []).map(c => c.load_time_ms);
    const avgSpeedMs = speeds.length ? Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length) : null;
    const prevSpeeds = (prevSpeedChecks ?? []).map(c => c.load_time_ms);
    const prevAvgSpeedMs = prevSpeeds.length ? Math.round(prevSpeeds.reduce((a, b) => a + b, 0) / prevSpeeds.length) : null;

    // Найкращий/найгірший сайт за uptime — рахуємо тільки якщо >2 сайти,
    // на 2 сайтах "найкращий і найгірший" — це просто перерахування обох.
    let bestSite: { name: string; uptimePct: number } | null = null;
    let worstSite: { name: string; uptimePct: number } | null = null;
    if (siteIds.length > 2) {
      const perSite = new Map<string, { up: number; total: number }>();
      for (const c of checks) {
        const entry = perSite.get(c.site_id) ?? { up: 0, total: 0 };
        entry.total++;
        if (c.status === "up") entry.up++;
        perSite.set(c.site_id, entry);
      }
      const nameById = new Map(sitesWithStatus.map(s => [s.id, s.display_name]));
      const ranked = [...perSite.entries()]
        .filter(([, v]) => v.total >= 5) // достатньо даних для чесного порівняння
        .map(([siteId, v]) => ({ name: nameById.get(siteId) ?? siteId, uptimePct: (v.up / v.total) * 100 }))
        .sort((a, b) => a.uptimePct - b.uptimePct);
      if (ranked.length >= 2) {
        worstSite = ranked[0];
        bestSite = ranked[ranked.length - 1];
      }
    }

    portfolioHealth = {
      uptimePct,
      incidentsCount: (incidents ?? []).length,
      avgSpeedMs,
      prevAvgSpeedMs,
      bestSite,
      worstSite,
    };
  }

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
            <Link href="/dashboard/home"><QoraxLogo size="sm" /></Link>
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
            <Link href="/dashboard/referrals"
              className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5"
              title="Партнерська програма">
              <Gift size={15} />
            </Link>
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

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-5">

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
              {["Перевірки кожні 5 хв", "SSL і домен", "AI Revenue Impact"].map(f => (
                <span key={f} className="text-xs text-[var(--text-secondary)] flex items-center gap-1.5">{f}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── Onboarding checklist ── */}
        {showOnboarding && membership && (
          <OnboardingChecklist organizationId={membership.organization_id} steps={onboardingSteps} />
        )}

        {/* ── Portfolio health (2+ сайти) ── */}
        {portfolioHealth && (
          <PortfolioHealthCard
            uptimePct={portfolioHealth.uptimePct}
            incidentsCount={portfolioHealth.incidentsCount}
            avgSpeedMs={portfolioHealth.avgSpeedMs}
            prevAvgSpeedMs={portfolioHealth.prevAvgSpeedMs}
            bestSite={portfolioHealth.bestSite}
            worstSite={portfolioHealth.worstSite}
          />
        )}

        {/* ── Page header ── */}
        <div className="flex items-center justify-between pt-2">
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="font-display text-xl font-semibold">Ваші сайти</h1>
              {downCount > 0 && (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg"
                  style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.25)" }}>
                  <span className="h-1.5 w-1.5 rounded-full animate-pulse" style={{ background: "#F5675A" }} />
                  {downCount} {downCount === 1 ? "сайт" : "сайтів"} недоступн{downCount === 1 ? "ий" : "і"}
                </span>
              )}
            </div>
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
          <SitesListControls sites={sitesWithStatus} />
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
