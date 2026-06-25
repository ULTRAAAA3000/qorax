import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPanel } from "./AdminPanel";
import { UsersTable } from "./UsersTable";

export const metadata = { title: "Адмін панель — Qorax" };

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  if (profile?.platform_role !== "admin") redirect("/dashboard");

  // Статистика
  const [
    { count: sitesCount },
    { count: usersCount },
    { count: checksCount },
    { count: activeTrials },
    { count: paidSubs },
  ] = await Promise.all([
    supabase.from("sites").select("*", { count: "exact", head: true }),
    supabase.from("profiles").select("*", { count: "exact", head: true }),
    supabase.from("uptime_checks").select("*", { count: "exact", head: true }),
    supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "trialing"),
    supabase.from("subscriptions").select("*", { count: "exact", head: true }).eq("status", "active"),
  ]);

  // Список користувачів з планами
  const { data: orgs } = await supabase
    .from("organizations")
    .select(`
      id,
      name,
      created_at,
      organization_members(user_id, role),
      subscriptions(status, trial_ends_at, plans(code, name))
    `)
    .order("created_at", { ascending: false })
    .limit(50);

  // Список всіх планів для dropdown
  const { data: plans } = await supabase
    .from("plans")
    .select("id, code, name")
    .order("price_usd");

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

        {/* Статистика */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Користувачів", value: usersCount ?? 0, accent: false },
            { label: "Сайтів", value: sitesCount ?? 0, accent: false },
            { label: "Тріалів", value: activeTrials ?? 0, accent: false },
            { label: "Платних", value: paidSubs ?? 0, accent: true },
            { label: "Uptime-перевірок", value: (checksCount ?? 0).toLocaleString(), accent: false },
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

        {/* Список користувачів */}
        <UsersTable orgs={orgs ?? []} plans={plans ?? []} />

        {/* Ручний запуск cron */}
        <AdminPanel />
      </main>
    </div>
  );
}
