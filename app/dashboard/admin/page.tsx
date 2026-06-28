import { createClient } from "@/app/lib/supabase/server";
import { createServiceClient } from "@/app/lib/supabase/service";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPanel } from "./AdminPanel";
import { UsersTable } from "./UsersTable";

export const metadata = { title: "Адмін панель — Qorax" };

export default async function AdminPage() {
  // Авторизаційний клієнт (з сесією) — для перевірки ролі
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  if (profile?.platform_role !== "admin") redirect("/dashboard");

  // Service-клієнт (обходить RLS) — для адмін-запитів
  const sb = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function safeCount(query: any): Promise<number> {
    try {
      const { count } = await query;
      return count ?? 0;
    } catch {
      return 0;
    }
  }

  const [sitesCount, usersCount, activeTrials, paidSubs] = await Promise.all([
    safeCount(sb.from("sites").select("*", { count: "exact", head: true })),
    safeCount(sb.from("profiles").select("*", { count: "exact", head: true })),
    safeCount(sb.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "trialing")),
    safeCount(sb.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active")),
  ]);

  let checksCount = 0;
  try {
    const { count } = await sb.from("uptime_checks").select("*", { count: "exact", head: true });
    checksCount = count ?? 0;
  } catch {
    checksCount = 0;
  }

  // Організації з підписками та учасниками
  let orgsWithPlans: {
    id: string; name: string; created_at: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    organization_members: any[]; subscriptions: any[];
  }[] = [];
  let plans: { id: string; code: string; name: string }[] = [];

  try {
    const { data: orgs, error: orgsError } = await sb
      .from("organizations")
      .select(`
        id,
        name,
        created_at,
        organization_members(user_id, role),
        subscriptions(id, status, trial_ends_at, plan_id, created_at)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (orgsError) console.error("Admin orgs query error:", orgsError);

    const { data: plansData } = await sb
      .from("plans")
      .select("id, code, name")
      .order("price_usd");

    plans = plansData ?? [];
    const plansMap = Object.fromEntries(plans.map(p => [p.id, p]));

    orgsWithPlans = (orgs ?? []).map(org => ({
      ...org,
      subscriptions: (org.subscriptions ?? []).map((sub: { id: string; status: string; trial_ends_at: string | null; plan_id: string | null; created_at: string }) => ({
        ...sub,
        plans: sub.plan_id ? plansMap[sub.plan_id] ?? null : null,
      })),
    }));
  } catch (e) {
    console.error("Admin page orgs/plans query failed:", e);
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link href="/dashboard"
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            ← Дашборд
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10 space-y-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="font-display text-2xl font-semibold">Адмін панель</h1>
            <span className="text-xs px-2 py-0.5 rounded-md font-mono"
              style={{ background: "rgba(214,255,63,0.1)", border: "1px solid rgba(214,255,63,0.3)", color: "var(--lime)" }}>
              ADMIN
            </span>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">{user.email}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Користувачів", value: usersCount, accent: false },
            { label: "Сайтів", value: sitesCount, accent: false },
            { label: "Тріалів", value: activeTrials, accent: false },
            { label: "Платних", value: paidSubs, accent: true },
            { label: "Uptime-перевірок", value: checksCount.toLocaleString(), accent: false },
          ].map(s => (
            <div key={s.label} className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
              <p className="text-xs text-[var(--text-tertiary)] mb-1">{s.label}</p>
              <p className="font-display text-2xl font-bold tabular-nums"
                style={{ color: s.accent ? "var(--lime)" : "var(--text-primary)" }}>
                {s.value}
              </p>
            </div>
          ))}
        </div>

        <UsersTable orgs={orgsWithPlans} plans={plans} />
        <AdminPanel />
      </main>
    </div>
  );
}
