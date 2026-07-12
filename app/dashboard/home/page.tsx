import { createClient } from "@/app/lib/supabase/server";
import { signOut } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ShieldCheck, TrendingUp, Users, FileText, Sparkles, Settings, LogOut, Gift,
  ArrowRight, AlertTriangle,
} from "lucide-react";

export const metadata = { title: "Головна — Qorax" };

// Головна сторінка при вході в акаунт (не Audit) — Артем: "надо как
// то сделать чтоб была главная связующая страница". /dashboard
// (Audit) свідомо НЕ переміщено на інший шлях — це мінімально
// інвазивний варіант: нова сторінка не займає /dashboard, не ламає
// existing посилання/закладки на Audit. Замість цього /dashboard/
// home стає новою точкою входу для звичайного логіну (signIn в
// auth-actions.ts), тоді як onboarding після РЕЄСТРАЦІЇ (welcome=1)
// свідомо лишається на /dashboard — там уже прив'язаний чеклист
// додавання першого сайту, який не має сенсу тут дублювати.
//
// Кнопка ADMIN перенесена сюди з шапки /dashboard/page.tsx (за
// проханням Артема "разместить там вход в админку а не в аудите").
export default async function DashboardHomePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  const organizationId = membership?.organization_id ?? null;

  const [profile, platformModules] = await Promise.all([
    supabase.from("profiles").select("full_name, platform_role").eq("id", user.id).single(),
    getPlatformModules(organizationId),
  ]);

  const firstName = profile.data?.full_name?.split(" ")[0] || user.email?.split("@")[0] || "друже";
  const isAdmin = profile.data?.platform_role === "admin";

  const liveModuleKeys = new Set(platformModules.filter(m => m.status === "live").map(m => m.key));

  // ── Збираємо сводку лише для тих модулів, що реально live ──────
  // Кожен блок — окремий легкий запит, виконується лише якщо
  // відповідний модуль увімкнено (не витрачаємо запити даремно на
  // модулі, які користувач не бачить).
  let siteIds: string[] = [];
  let auditSummary: { sitesCount: number; downCount: number; activeIssues: number } | null = null;
  if (organizationId && liveModuleKeys.has("audit")) {
    const { data: sites } = await supabase
      .from("sites")
      .select("id")
      .eq("organization_id", organizationId);
    siteIds = (sites ?? []).map(s => s.id);

    let downCount = 0;
    let activeIssues = 0;
    if (siteIds.length > 0) {
      const [{ data: openIncidents }, { count: issuesCount }] = await Promise.all([
        supabase.from("uptime_incidents").select("site_id").in("site_id", siteIds).is("resolved_at", null),
        supabase.from("ai_insights").select("id", { count: "exact", head: true }).in("site_id", siteIds).eq("is_resolved", false),
      ]);
      downCount = new Set((openIncidents ?? []).map(i => i.site_id)).size;
      activeIssues = issuesCount ?? 0;
    }
    auditSummary = { sitesCount: siteIds.length, downCount, activeIssues };
  }

  let crmSummary: { activeDeals: number } | null = null;
  if (organizationId && liveModuleKeys.has("crm")) {
    const { count } = await supabase
      .from("crm_deals")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .not("stage", "in", "(won,lost)");
    crmSummary = { activeDeals: count ?? 0 };
  }

  let rankSummary: { trackedQueries: number } | null = null;
  if (organizationId && liveModuleKeys.has("rank") && siteIds.length > 0) {
    const { count } = await supabase
      .from("rank_tracked_queries")
      .select("id", { count: "exact", head: true })
      .in("site_id", siteIds);
    rankSummary = { trackedQueries: count ?? 0 };
  }

  let tasksSummary: { pendingCount: number } | null = null;
  if (organizationId && liveModuleKeys.has("ai")) {
    const { count } = await supabase
      .from("ai_tasks")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status", ["pending", "in_progress"]);
    tasksSummary = { pendingCount: count ?? 0 };
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
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
          <Link href="/dashboard/home"><QoraxLogo size="sm" /></Link>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link href="/dashboard/admin"
                className="text-xs font-mono px-2.5 py-1.5 rounded-lg transition-colors hover:opacity-80"
                style={{ background: "rgba(214,255,63,0.08)", color: "var(--lime)", border: "1px solid rgba(214,255,63,0.2)" }}>
                ADMIN
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

        <main className="flex-1 min-w-0 mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <h1 className="font-display text-2xl font-semibold">
              Привіт, {firstName} 👋
            </h1>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              Ось що відбувається у вашому акаунті Qorax зараз.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {auditSummary && (
              <SummaryCard
                href="/dashboard"
                icon={ShieldCheck}
                label="Audit"
                accent="var(--lime)"
              >
                <p className="text-2xl font-display font-semibold">{auditSummary.sitesCount}</p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {auditSummary.sitesCount === 1 ? "сайт на моніторингу" : "сайтів на моніторингу"}
                </p>
                {auditSummary.downCount > 0 && (
                  <p className="text-xs mt-2 flex items-center gap-1.5" style={{ color: "#F5675A" }}>
                    <AlertTriangle size={11} />
                    {auditSummary.downCount} недоступн{auditSummary.downCount === 1 ? "ий" : "і"}
                  </p>
                )}
                {auditSummary.activeIssues > 0 && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-secondary)" }}>
                    {auditSummary.activeIssues} активних проблем
                  </p>
                )}
              </SummaryCard>
            )}

            {crmSummary && (
              <SummaryCard href="/dashboard/crm" icon={Users} label="CRM" accent="var(--cyan)">
                <p className="text-2xl font-display font-semibold">{crmSummary.activeDeals}</p>
                <p className="text-xs text-[var(--text-tertiary)]">активних угод</p>
              </SummaryCard>
            )}

            {rankSummary && (
              <SummaryCard href="/dashboard/rank" icon={TrendingUp} label="Rank" accent="#F5A623">
                <p className="text-2xl font-display font-semibold">{rankSummary.trackedQueries}</p>
                <p className="text-xs text-[var(--text-tertiary)]">запитів під моніторингом</p>
              </SummaryCard>
            )}

            {tasksSummary && (
              <SummaryCard href="/dashboard/ai" icon={Sparkles} label="Qorax AI" accent="var(--lime)">
                <p className="text-2xl font-display font-semibold">{tasksSummary.pendingCount}</p>
                <p className="text-xs text-[var(--text-tertiary)]">задач у роботі</p>
              </SummaryCard>
            )}

            <SummaryCard href="/dashboard/apps" icon={FileText} label="Усі додатки" accent="var(--text-tertiary)">
              <p className="text-sm text-[var(--text-secondary)]">
                Перегляньте всі модулі платформи — живі й ті, що скоро з&apos;являться.
              </p>
            </SummaryCard>
          </div>
        </main>
      </div>
    </div>
  );
}

function SummaryCard({
  href,
  icon: Icon,
  label,
  accent,
  children,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group rounded-2xl p-5 flex flex-col gap-3 transition-colors hover:opacity-90"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}
    >
      <div className="flex items-center justify-between">
        <span
          className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
          style={{ background: "rgba(255,255,255,0.04)", color: accent }}
        >
          <Icon size={16} />
        </span>
        <ArrowRight size={14} className="opacity-0 group-hover:opacity-60 transition-opacity" style={{ color: "var(--text-tertiary)" }} />
      </div>
      <div>
        <p className="text-xs font-mono mb-1.5" style={{ color: "var(--text-tertiary)" }}>{label}</p>
        {children}
      </div>
    </Link>
  );
}
