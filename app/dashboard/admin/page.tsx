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

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .single();

  if (profile?.platform_role !== "admin") redirect("/dashboard");

  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

  // Отримуємо статистику через worker API (там є service role key)
  let stats = { users: 0, sites: 0, trials: 0, paid: 0, checks: 0 };
  try {
    const res = await fetch(`${workerUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (res.ok) stats = await res.json();
  } catch { /* показуємо нулі */ }

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
            { label: "Користувачів", value: stats.users, accent: false },
            { label: "Сайтів", value: stats.sites, accent: false },
            { label: "Тріалів", value: stats.trials, accent: false },
            { label: "Платних", value: stats.paid, accent: true },
            { label: "Uptime-перевірок", value: stats.checks.toLocaleString(), accent: false },
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

        <UsersTable accessToken={accessToken} workerUrl={workerUrl} />
        <AdminPanel />
      </main>
    </div>
  );
}

  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

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

        {/* Клієнти — завантажуються client-side через API worker (service role там вже є) */}
        <UsersTable accessToken={accessToken} workerUrl={workerUrl} />

        <AdminPanel />
      </main>
    </div>
  );
}
