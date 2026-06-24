import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check, ExternalLink } from "lucide-react";

export const metadata = { title: "Обрати план — Qorax" };

// LemonSqueezy variant IDs — заповнити після створення продуктів в LS Dashboard
// Dashboard → Products → Variants → Copy variant ID
const LS_VARIANTS: Record<string, string> = {
  starter: process.env.LS_VARIANT_STARTER ?? "",
  growth:  process.env.LS_VARIANT_GROWTH  ?? "",
  agency:  process.env.LS_VARIANT_AGENCY  ?? "",
};

const LS_STORE_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qorax";

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    price: 49,
    highlight: false,
    description: "Для малого бізнесу — упевненість що сайт працює",
    features: [
      "1 сайт",
      "Uptime кожні 5 хвилин",
      "Швидкість + графік",
      "SSL / домен алерти",
      "Биті посилання",
      "AI пояснення простою",
      "Місячний PDF звіт",
      "Email алерти",
    ],
  },
  {
    code: "growth",
    name: "Growth",
    price: 99,
    highlight: true,
    description: "Для серйозного бізнесу — повний контроль та AI-аналіз",
    features: [
      "1 сайт",
      "Всі функції Starter",
      "Core Web Vitals (LCP, INP, CLS)",
      "SEO аудит (meta, schema, sitemap)",
      "AI Revenue Impact ($)",
      "Конкурент моніторинг",
      "Qoraxus AI-асистент",
      "Telegram алерти",
    ],
  },
  {
    code: "agency",
    name: "Agency",
    price: 199,
    highlight: false,
    description: "Для агентств — до 5 сайтів клієнтів",
    features: [
      "До 5 сайтів",
      "Всі функції Growth",
      "White-label PDF звіти",
      "AI контент та SEO структура",
      "Конкурент моніторинг на кожен сайт",
      "+$29/міс за додатковий сайт",
      "Пріоритетна підтримка",
    ],
  },
];

export default async function UpgradePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Отримуємо поточний план та org_id
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const orgId = membership?.organization_id ?? "";

  // Поточна підписка
  const subQuery = await supabase
    .from("subscriptions")
    .select("status, ls_customer_portal_url, plans(code)")
    .eq("organization_id", orgId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const sub = subQuery.data;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPlan = (sub?.plans as any)?.code as string | undefined;
  const portalUrl = sub?.ls_customer_portal_url;
  const isActive = sub?.status === "active";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link href="/dashboard"
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            ← Назад
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 sm:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-semibold mb-3">Оберіть план</h1>
          <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto">
            14 днів тріалу вже включено при реєстрації. Оплата через LemonSqueezy — безпечно, картки будь-якого банку.
          </p>
          {isActive && portalUrl && (
            <a
              href={portalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-4 text-sm text-[var(--cyan)] hover:opacity-80 transition-opacity"
            >
              Управляти підпискою <ExternalLink size={13} />
            </a>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {PLANS.map((plan) => {
            const isCurrent = currentPlan === plan.code && isActive;
            const variantId = LS_VARIANTS[plan.code];
            // Checkout URL: https://store.lemonsqueezy.com/checkout/buy/{variant_id}?checkout[custom][org_id]={orgId}
            const checkoutUrl = variantId
              ? `https://${LS_STORE_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${variantId}?checkout[email]=${encodeURIComponent(user.email ?? "")}&checkout[custom][org_id]=${encodeURIComponent(orgId)}`
              : null;

            return (
              <div
                key={plan.code}
                className="rounded-2xl border p-6 flex flex-col"
                style={{
                  borderColor: plan.highlight
                    ? "var(--lime)"
                    : isCurrent
                    ? "rgba(140,246,255,0.3)"
                    : "var(--border-hairline)",
                  background: plan.highlight
                    ? "rgba(214,255,63,0.04)"
                    : "var(--bg-raised)",
                }}
              >
                {plan.highlight && !isCurrent && (
                  <div
                    className="text-xs font-mono mb-3 px-2.5 py-1 rounded-lg self-start"
                    style={{ background: "rgba(214,255,63,0.15)", color: "var(--lime)" }}
                  >
                    Популярний
                  </div>
                )}
                {isCurrent && (
                  <div
                    className="text-xs font-mono mb-3 px-2.5 py-1 rounded-lg self-start"
                    style={{ background: "rgba(140,246,255,0.12)", color: "var(--cyan)" }}
                  >
                    Поточний план
                  </div>
                )}

                <div className="mb-1">
                  <span className="font-display text-lg font-semibold">{plan.name}</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mb-4 leading-relaxed">
                  {plan.description}
                </p>
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

                {isCurrent ? (
                  <div
                    className="text-center text-sm font-medium rounded-xl py-3"
                    style={{ border: "1px solid var(--border-hairline)", color: "var(--text-tertiary)" }}
                  >
                    Активний
                  </div>
                ) : checkoutUrl ? (
                  <a
                    href={checkoutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-center text-sm font-medium rounded-xl py-3 transition-opacity hover:opacity-80"
                    style={
                      plan.highlight
                        ? { background: "var(--lime)", color: "#0c111d" }
                        : { border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }
                    }
                  >
                    Обрати {plan.name} →
                  </a>
                ) : (
                  <a
                    href="mailto:hello@qorax.app?subject=Підключення плану"
                    className="text-center text-sm font-medium rounded-xl py-3 transition-opacity hover:opacity-80"
                    style={
                      plan.highlight
                        ? { background: "var(--lime)", color: "#0c111d" }
                        : { border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }
                    }
                  >
                    Обрати {plan.name} →
                  </a>
                )}
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="mt-12 grid sm:grid-cols-2 gap-6">
          {[
            ["Як скасувати підписку?", "В будь-який момент через портал керування підпискою. Доступ зберігається до кінця оплаченого місяця."],
            ["Які способи оплати?", "Кредитні та дебетові картки будь-якого банку, включаючи українські. Через LemonSqueezy."],
            ["Чи є знижки?", "Річна підписка зі знижкою — скоро. Напишіть нам і домовимось індивідуально."],
            ["Що буде після тріалу?", "Автоматично переходить на безкоштовний план. Ми надішлемо нагадування за 7 і 3 дні."],
          ].map(([q, a]) => (
            <div key={q} className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
              <p className="text-sm font-medium mb-2">{q}</p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{a}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[var(--text-tertiary)] mt-8">
          Є питання?{" "}
          <a href="mailto:hello@qorax.app" className="text-[var(--cyan)] hover:opacity-80">
            hello@qorax.app
          </a>
        </p>
      </main>
    </div>
  );
}
