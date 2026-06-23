import { createClient } from "@/app/lib/supabase/server";
import { signOut } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock, Zap } from "lucide-react";

export const metadata = {
  title: "Дашборд — Qorax",
};

// Повертає кількість днів до закінчення тріалу (0 якщо вже закінчився)
function trialDaysLeft(trialEndsAt: string | null): number {
  if (!trialEndsAt) return 0;
  const ms = new Date(trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

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

  // Отримуємо організацію та підписку паралельно
  const [{ data: org }, { data: subscription }, { data: sites }, profile] = await Promise.all([
    membership
      ? supabase
          .from("organizations")
          .select("name, org_type, site_limit")
          .eq("id", membership.organization_id)
          .single()
      : Promise.resolve({ data: null }),
    membership
      ? supabase
          .from("subscriptions")
          .select("status, trial_ends_at, plans(code, name)")
          .eq("organization_id", membership.organization_id)
          .in("status", ["trialing", "active", "canceled", "past_due"])
          .order("created_at", { ascending: false })
          .limit(1)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from("sites")
      .select("id, url, display_name, monitoring_enabled, created_at")
      .eq("organization_id", membership?.organization_id ?? "")
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("full_name, platform_role")
      .eq("id", user.id)
      .single(),
  ]);

  const firstName =
    profile.data?.full_name?.split(" ")[0] ||
    user.email?.split("@")[0] ||
    "друже";

  // Визначаємо стан плану
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const planCode = (subscription as any)?.plans?.code as string | undefined;
  const subStatus = subscription?.status;
  const trialEndsAt = subscription?.trial_ends_at ?? null;
  const daysLeft = trialDaysLeft(trialEndsAt);

  const isTrial = planCode === "trial" && subStatus === "trialing";
  const isTrialExpired = planCode === "trial" && subStatus === "canceled";
  const isFree = planCode === "free";
  const isPaid = subStatus === "active" && planCode !== "trial" && planCode !== "free";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <div className="flex items-center gap-4">
            {profile.data?.platform_role === "admin" && (
              <Link href="/dashboard/admin" className="text-xs font-mono px-2 py-1 rounded-md transition-opacity hover:opacity-80"
                style={{ background: "rgba(214,255,63,0.1)", border: "1px solid rgba(214,255,63,0.3)", color: "var(--lime)" }}>
                ADMIN
              </Link>
            )}
            <Link href="/dashboard/settings" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              Налаштування
            </Link>
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

        {/* ── Welcome banner (після реєстрації) ── */}
        {params.welcome === "1" && (
          <div
            className="rounded-2xl border px-6 py-4 mb-6 flex items-center gap-3"
            style={{ borderColor: "var(--lime)", background: "rgba(214,255,63,0.06)" }}
          >
            <span style={{ color: "var(--lime)" }}>✓</span>
            <p className="text-sm">
              Ласкаво просимо, {firstName}! Ваш 14-денний тріал активовано. Додайте перший сайт, щоб розпочати моніторинг.
            </p>
          </div>
        )}

        {params.new === "1" && (
          <div
            className="rounded-2xl border px-6 py-4 mb-6 flex items-center gap-3"
            style={{ borderColor: "var(--cyan)", background: "rgba(140,246,255,0.06)" }}
          >
            <span style={{ color: "var(--cyan)" }}>●</span>
            <p className="text-sm">
              Сайт додано — моніторинг розпочато. Перші дані з&apos;являться протягом кількох хвилин.
            </p>
          </div>
        )}

        {/* ── Trial banner (активний тріал) ── */}
        {isTrial && !isTrialExpired && (
          <div
            className="rounded-2xl border px-6 py-4 mb-6 flex items-center justify-between gap-4"
            style={{
              borderColor: daysLeft <= 3 ? "rgba(245,166,35,0.5)" : "rgba(140,246,255,0.25)",
              background: daysLeft <= 3 ? "rgba(245,166,35,0.06)" : "rgba(140,246,255,0.04)",
            }}
          >
            <div className="flex items-center gap-3">
              <Clock size={15} style={{ color: daysLeft <= 3 ? "#F5A623" : "var(--cyan)", flexShrink: 0 }} />
              <p className="text-sm">
                {daysLeft > 0 ? (
                  <>
                    <span style={{ color: daysLeft <= 3 ? "#F5A623" : "var(--cyan)" }} className="font-medium">
                      Тріал: залишилось {daysLeft} {daysLeft === 1 ? "день" : daysLeft < 5 ? "дні" : "днів"}
                    </span>
                    {" — "}повний Starter доступ безкоштовно
                  </>
                ) : (
                  <span style={{ color: "#F5A623" }} className="font-medium">Тріал закінчується сьогодні</span>
                )}
              </p>
            </div>
            <Link
              href="/dashboard/upgrade"
              className="shrink-0 text-xs font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
              style={{ background: "var(--lime)", color: "#0c111d" }}
            >
              Обрати план →
            </Link>
          </div>
        )}

        {/* ── Trial expired banner ── */}
        {(isTrialExpired || (isFree && !isPaid)) && (
          <div
            className="rounded-2xl border px-6 py-5 mb-6"
            style={{ borderColor: "rgba(245,103,90,0.4)", background: "rgba(245,103,90,0.05)" }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-medium mb-1" style={{ color: "#F5675A" }}>
                  {isTrialExpired ? "Ваш тріал закінчився" : "Ви на безкоштовному плані"}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {isTrialExpired
                    ? "Моніторинг обмежено до базового uptime (раз на 30 хв). Оберіть план щоб відновити повний доступ — швидкість, SSL, AI-аналіз та алерти."
                    : "Uptime перевіряється раз на 30 хв. Стартер додає перевірку кожні 5 хв, SSL, швидкість та AI-інсайти."}
                </p>
              </div>
              <Link
                href="/dashboard/upgrade"
                className="shrink-0 text-sm font-medium px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80"
                style={{ background: "var(--lime)", color: "#0c111d" }}
              >
                Обрати план
              </Link>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3">
              <UpgradeFeature icon="⚡" text="Перевірка кожні 5 хвилин" />
              <UpgradeFeature icon="🔒" text="SSL та домен моніторинг" />
              <UpgradeFeature icon="✦" text="AI-аналіз та revenue impact" />
            </div>
          </div>
        )}

        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-2xl font-semibold">Ваші сайти</h1>
            <p className="text-sm text-[var(--text-secondary)] mt-0.5">
              {sites?.length ?? 0} з {org?.site_limit ?? 1} сайтів
              {isTrial && !isTrialExpired && (
                <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-md"
                  style={{ background: "rgba(140,246,255,0.1)", color: "var(--cyan)" }}>
                  Trial
                </span>
              )}
              {isFree && !isTrial && !isTrialExpired && (
                <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-md"
                  style={{ background: "rgba(255,255,255,0.06)", color: "var(--text-tertiary)" }}>
                  Free
                </span>
              )}
              {isPaid && planCode && (
                <span className="ml-2 text-xs font-mono px-2 py-0.5 rounded-md"
                  style={{ background: "rgba(214,255,63,0.1)", color: "var(--lime)" }}>
                  {planCode.charAt(0).toUpperCase() + planCode.slice(1)}
                </span>
              )}
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

        {/* Upgrade CTA at bottom for trial users с несколькими днями */}
        {isTrial && daysLeft > 0 && daysLeft <= 7 && (
          <div className="mt-8 rounded-2xl border hairline bg-[var(--bg-raised)] p-6 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Zap size={16} style={{ color: "var(--lime)", flexShrink: 0 }} />
              <div>
                <p className="text-sm font-medium">Продовжте без перерви</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Стартер — $49/міс · відміна в будь-який момент</p>
              </div>
            </div>
            <Link
              href="/dashboard/upgrade"
              className="shrink-0 text-sm font-medium px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80"
              style={{ background: "var(--lime)", color: "#0c111d" }}
            >
              Перейти на Starter →
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}

function UpgradeFeature({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
      <span>{icon}</span>
      <span>{text}</span>
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
