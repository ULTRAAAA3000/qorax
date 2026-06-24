import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, Zap } from "lucide-react";
import { UpgradeButtons } from "./UpgradeButtons";

export const metadata = { title: "Обрати план — Qorax" };

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    price: 49,
    highlight: false,
    features: [
      "1 сайт",
      "Uptime кожні 5 хвилин",
      "Швидкість + графік",
      "SSL / домен алерти",
      "Биті посилання",
      "AI пояснення проблем",
      "Місячний PDF звіт",
      "Email алерти",
    ],
  },
  {
    code: "growth",
    name: "Growth",
    price: 99,
    highlight: true,
    features: [
      "1 сайт",
      "Всі функції Starter",
      "Core Web Vitals",
      "Meta / Schema checker",
      "AI Revenue Impact ($)",
      "1 конкурент моніторинг",
      "Telegram алерти",
      "Живий дашборд",
    ],
  },
  {
    code: "agency",
    name: "Agency",
    price: 199,
    highlight: false,
    features: [
      "До 5 сайтів",
      "Всі функції Growth",
      "White-label звіти",
      "AI генерація контенту",
      "Моніторинг конкурентів",
      "+$29/міс за доп. сайт",
      "Пріоритетна підтримка",
    ],
  },
];

export default async function UpgradePage({
  searchParams,
}: {
  searchParams: Promise<{ stripe?: string }>;
}) {
  const { stripe } = await searchParams;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: { session } } = await supabase.auth.getSession();

  // Поточний план
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const { data: subscription } = membership
    ? await supabase
        .from("subscriptions")
        .select("status, trial_ends_at, stripe_customer_id, plans(code, name)")
        .eq("organization_id", membership.organization_id)
        .single()
    : { data: null };

  // @ts-expect-error
  const currentPlanCode: string = subscription?.plans?.code ?? "free";
  const hasStripeCustomer = !!(subscription as { stripe_customer_id?: string } | null)?.stripe_customer_id;

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

      <main className="mx-auto max-w-5xl px-6 sm:px-8 py-16">
        {/* Stripe success/cancel banner */}
        {stripe === "success" && (
          <div className="mb-8 rounded-2xl border px-5 py-4 flex items-center gap-3"
            style={{ borderColor: "rgba(214,255,63,0.4)", background: "rgba(214,255,63,0.06)" }}>
            <Zap size={16} style={{ color: "var(--lime)" }} />
            <p className="text-sm">
              <span className="font-medium" style={{ color: "var(--lime)" }}>Оплата успішна!</span>
              {" "}Ваш план активовано. Може знадобитись кілька секунд для оновлення.
            </p>
          </div>
        )}
        {stripe === "cancel" && (
          <div className="mb-8 rounded-2xl border hairline px-5 py-4">
            <p className="text-sm text-[var(--text-secondary)]">Оплату скасовано. Ваш поточний план залишається активним.</p>
          </div>
        )}

        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-semibold mb-3">Оберіть план</h1>
          <p className="text-[var(--text-secondary)] text-sm">
            Поточний план:{" "}
            <span className="font-medium" style={{ color: "var(--lime)" }}>
              {currentPlanCode.charAt(0).toUpperCase() + currentPlanCode.slice(1)}
            </span>
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5 mb-10">
          {PLANS.map((plan) => {
            const isCurrent = currentPlanCode === plan.code;
            return (
              <div
                key={plan.code}
                className="rounded-2xl border p-6 flex flex-col"
                style={{
                  borderColor: plan.highlight ? "var(--lime)" : "var(--border-hairline)",
                  background: plan.highlight ? "rgba(214,255,63,0.04)" : "var(--bg-raised)",
                }}
              >
                {plan.highlight && (
                  <div className="text-xs font-mono mb-3 px-2.5 py-1 rounded-lg self-start"
                    style={{ background: "rgba(214,255,63,0.15)", color: "var(--lime)" }}>
                    Популярний
                  </div>
                )}
                {isCurrent && (
                  <div className="text-xs font-mono mb-3 px-2.5 py-1 rounded-lg self-start"
                    style={{ background: "rgba(140,246,255,0.1)", color: "var(--cyan)" }}>
                    Поточний план
                  </div>
                )}
                <div className="mb-1">
                  <span className="font-display text-lg font-semibold">{plan.name}</span>
                </div>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="font-display text-3xl font-bold">${plan.price}</span>
                  <span className="text-sm text-[var(--text-tertiary)]">/міс</span>
                </div>
                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                      <Check size={13} style={{ color: "var(--lime)", flexShrink: 0, marginTop: 2 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                <UpgradeButtons
                  planCode={plan.code}
                  planName={plan.name}
                  isCurrent={isCurrent}
                  isHighlight={plan.highlight}
                  accessToken={session?.access_token ?? ""}
                  hasStripeCustomer={hasStripeCustomer}
                />
              </div>
            );
          })}
        </div>

        {/* Manage existing subscription */}
        {hasStripeCustomer && (
          <div className="text-center">
            <UpgradeButtons
              planCode="portal"
              planName="Управляти підпискою"
              isCurrent={false}
              isHighlight={false}
              accessToken={session?.access_token ?? ""}
              hasStripeCustomer={hasStripeCustomer}
              isPortalButton
            />
            <p className="text-xs text-[var(--text-tertiary)] mt-2">
              Скасування, зміна плану, історія платежів
            </p>
          </div>
        )}

        <p className="text-center text-xs text-[var(--text-tertiary)] mt-8">
          Є питання? Пишіть на{" "}
          <a href="mailto:hello@qorax.app" className="text-[var(--cyan)] hover:opacity-80">
            hello@qorax.app
          </a>
        </p>
      </main>
    </div>
  );
}
