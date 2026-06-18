import { createClient } from "@/app/lib/supabase/server";
import { signOut } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";

export const metadata = {
  title: "Дашборд — Qorax",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; new?: string; site?: string }>;
}) {
  const supabase = await createClient();
  const params = await searchParams;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Отримуємо organization поточного користувача
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  // Отримуємо організацію окремо
  const { data: org } = membership
    ? await supabase
        .from("organizations")
        .select("name, org_type, site_limit")
        .eq("id", membership.organization_id)
        .single()
    : { data: null };

  // Отримуємо сайти
  const { data: sites } = await supabase
    .from("sites")
    .select("id, url, display_name, monitoring_enabled, created_at")
    .eq("organization_id", membership?.organization_id ?? "")
    .order("created_at", { ascending: false });

  const profile = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  const firstName =
    profile.data?.full_name?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "друже";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-[var(--text-tertiary)]">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              >
                Вийти
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10">
        {/* Welcome banner */}
        {params.welcome === "1" && (
          <div
            className="rounded-2xl border px-6 py-4 mb-8 flex items-center gap-3"
            style={{
              borderColor: "var(--lime)",
              background: "rgba(214,255,63,0.06)",
            }}
          >
            <span style={{ color: "var(--lime)" }}>✓</span>
            <p className="text-sm">
              Ласкаво просимо, {firstName}! Акаунт створено. Додайте перший сайт, щоб розпочати моніторинг.
            </p>
          </div>
        )}

        {params.new === "1" && (
          <div
            className="rounded-2xl border px-6 py-4 mb-8 flex items-center gap-3"
            style={{
              borderColor: "var(--cyan)",
              background: "rgba(140,246,255,0.06)",
            }}
          >
            <span style={{ color: "var(--cyan)" }}>●</span>
            <p className="text-sm">
              Сайт додано — моніторинг розпочато. Перші дані з&apos;являться протягом кількох хвилин.
            </p>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold">Ваші сайти</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {sites?.length ?? 0} з {org?.site_limit ?? 1} сайтів
            </p>
          </div>
          <Link
            href="/dashboard/sites/new"
            className="text-sm font-medium rounded-xl px-5 py-2.5"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            + Додати сайт
          </Link>
        </div>

        {/* Sites list */}
        {!sites || sites.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="grid gap-4">
            {sites.map((site) => (
              <SiteCard key={site.id} site={site} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-12 text-center">
      <div className="font-mono text-4xl mb-4 text-[var(--text-tertiary)]">⊡</div>
      <h2 className="font-display text-lg font-medium mb-2">Сайтів ще немає</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-6 max-w-xs mx-auto">
        Додайте перший сайт щоб Qorax почав стежити за його швидкістю, SSL та SEO.
      </p>
      <Link
        href="/dashboard/sites/new"
        className="inline-flex text-sm font-medium rounded-xl px-6 py-3"
        style={{ background: "var(--lime)", color: "#0c111d" }}
      >
        Додати перший сайт
      </Link>
    </div>
  );
}

function SiteCard({
  site,
}: {
  site: {
    id: string;
    url: string;
    display_name: string;
    monitoring_enabled: boolean;
    created_at: string;
  };
}) {
  const hostname = new URL(site.url).hostname;
  const addedDate = new Date(site.created_at).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-6 flex items-center justify-between gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div
          className="h-2.5 w-2.5 rounded-full shrink-0"
          style={{
            background: site.monitoring_enabled
              ? "var(--lime)"
              : "var(--text-tertiary)",
          }}
        />
        <div className="min-w-0">
          <div className="font-medium text-[var(--text-primary)] truncate">
            {site.display_name}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5">
            {hostname}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-5 shrink-0">
        <span className="text-xs text-[var(--text-tertiary)] hidden sm:block">
          Додано {addedDate}
        </span>
        <Link
          href={`/dashboard/sites/${site.id}`}
          className="text-sm text-[var(--cyan)] hover:opacity-80 transition-opacity"
        >
          Деталі →
        </Link>
      </div>
    </div>
  );
}
