import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, Zap } from "lucide-react";
import { CustomerPortalButton } from "@/app/dashboard/upgrade/CustomerPortalButton";
import { CHECKOUT_DISABLED } from "@/app/lib/checkoutFlag";

// Спільний рушій сторінки вибору тарифу для БУДЬ-ЯКОГО з п'яти
// продуктів екосистеми (0086, PRICING.md Частина A) — раніше існував
// лише для Business (app/dashboard/upgrade/page.tsx), тепер
// переюзується Mail/Creator/Office/Browser замість копіювання того
// самого JSX ще 4 рази. Той самий принцип, що вже застосований для
// worker/src/lib/planTiers.ts (один спільний модуль замість N копій).
//
// LemonSqueezy variant id читається за конвенцією env-змінних
// `LS_VARIANT_{PRODUCT}_{TIER}` (напр. LS_VARIANT_MAIL_STARTER) —
// дозволяє одному компоненту обслуговувати всі продукти без
// продукт-специфічного коду тут.

export interface PlanCardDef {
  code: string; // напр. "mail_starter" — має співпадати з plans.code
  tier: "starter" | "pro" | "agency"; // визначає, яку env-змінну LS_VARIANT_* читати
  name: string; // "Starter"
  price: number;
  highlight: boolean;
  accent: "lime" | "cyan";
  description: string;
  features: string[];
}

export interface ProductUpgradePageProps {
  product: string; // "business" | "mail" | "creator" | "office" | "browser"
  productLabel: string; // показується в хлібних крихтах, напр. "Mail"
  backHref: string; // куди веде "← Назад", напр. "/mail"
  backLabel: string; // текст кнопки назад, напр. "Mail"
  homeHref: string; // куди веде логотип
  plans: PlanCardDef[];
  freeBlurb: string; // підзаголовок під "Оберіть план"
  freeFaqAnswer: string; // відповідь у FAQ на "Що з Free-планом?"
  recommendedPlanParam?: string;
}

function lsVariantEnvName(product: string, tier: string): string {
  return `LS_VARIANT_${product.toUpperCase()}_${tier.toUpperCase()}`;
}

export async function ProductUpgradePage({
  product,
  productLabel,
  backHref,
  backLabel,
  homeHref,
  plans,
  freeBlurb,
  freeFaqAnswer,
  recommendedPlanParam,
}: ProductUpgradePageProps) {
  const LS_STORE_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qoraxus";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members").select("organization_id").eq("user_id", user.id).single();

  const orgId = membership?.organization_id ?? "";
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  // Business — єдиний продукт з "легасі" підписками (старі starter/
  // growth/agency/trial/free/enterprise коди, subscriptions.product
  // = NULL, бо ті plans-рядки теж мають product = NULL). Для Business
  // рахуємо і NULL, і 'business' активною підпискою — інакше
  // існуючий платний клієнт на легасі-плані побачив би "нема активної
  // підписки" на власній сторінці тарифів. Для решти продуктів
  // (з'явились лише в 0086, легасі-концепції не існує) — просто
  // product = eq.<product>.
  let subQuery = supabase
    .from("subscriptions")
    .select("status, ls_customer_portal_url, plans(code)")
    .eq("organization_id", orgId)
    .in("status", ["active", "trialing"]);

  subQuery = product === "business"
    ? subQuery.or("product.eq.business,product.is.null")
    : subQuery.eq("product", product);

  const subResult = await subQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

  const sub = subResult.data;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const currentPlan = (sub?.plans as any)?.code as string | undefined;
  const isActive = sub?.status === "active";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Navbar */}
      <header className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.8)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={homeHref}><QoraxLogo size="sm" /></Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <Link href={backHref}
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <ArrowLeft size={13} /> {backLabel}
            </Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <span className="text-sm text-[var(--text-primary)]">Тарифи</span>
          </div>
          {isActive && (
            <CustomerPortalButton orgId={orgId} accessToken={accessToken} product={product} />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 sm:px-8 py-10 sm:py-14">

        {/* Recommended plan banner */}
        {recommendedPlanParam && (
          <div className="mb-8 rounded-2xl px-5 py-4 flex items-center gap-3"
            style={{ background: "rgba(214,255,63,0.05)", border: "1px solid rgba(214,255,63,0.2)" }}>
            <span className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}>✓</span>
            <p className="text-sm">
              Ви обрали план{" "}
              <span className="font-semibold" style={{ color: "var(--lime)" }}>
                {recommendedPlanParam.charAt(0).toUpperCase() + recommendedPlanParam.slice(1)}
              </span>
              {" "}— натисніть кнопку нижче щоб перейти до оплати.
            </p>
          </div>
        )}

        {/* Header */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-mono mb-5"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}>
            <Zap size={11} style={{ color: "var(--lime)" }} /> {productLabel.toUpperCase()} — ТАРИФИ
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold mb-3">Оберіть план</h1>
          <p className="text-sm text-[var(--text-secondary)] max-w-sm mx-auto">{freeBlurb}</p>
        </div>

        {/* Plan cards */}
        <div className="grid sm:grid-cols-3 gap-4">
          {plans.map((plan) => {
            const isCurrent = currentPlan === plan.code && isActive;
            const isRecommended = recommendedPlanParam === plan.code;
            const variantId = process.env[lsVariantEnvName(product, plan.tier)] ?? "";
            const checkoutUrl = variantId
              ? `https://${LS_STORE_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${variantId}?checkout[email]=${encodeURIComponent(user.email ?? "")}&checkout[custom][org_id]=${encodeURIComponent(orgId)}`
              : null;

            const accentRgb = plan.highlight ? "214,255,63" : plan.accent === "cyan" ? "140,246,255" : "255,255,255";
            const accentColor = plan.highlight ? "var(--lime)" : plan.accent === "cyan" ? "var(--cyan)" : "var(--text-primary)";

            return (
              <div key={plan.code} className="relative rounded-2xl p-6 flex flex-col transition-all duration-200"
                style={{
                  background: plan.highlight
                    ? "rgba(214,255,63,0.03)"
                    : isCurrent
                    ? "rgba(140,246,255,0.03)"
                    : "rgba(255,255,255,0.02)",
                  border: `1px solid ${
                    plan.highlight ? "rgba(214,255,63,0.25)"
                    : isCurrent ? "rgba(140,246,255,0.2)"
                    : isRecommended ? "rgba(214,255,63,0.2)"
                    : "rgba(255,255,255,0.07)"}`,
                }}>

                {/* Badge */}
                {(plan.highlight || isCurrent || isRecommended) && (
                  <div className="absolute -top-3 left-5">
                    <span className="text-xs font-mono font-semibold px-3 py-1 rounded-full"
                      style={{
                        background: isCurrent ? "rgba(140,246,255,0.1)" : "rgba(214,255,63,0.12)",
                        border: `1px solid ${isCurrent ? "rgba(140,246,255,0.3)" : "rgba(214,255,63,0.3)"}`,
                        color: isCurrent ? "var(--cyan)" : "var(--lime)",
                      }}>
                      {isCurrent ? "● Поточний" : plan.highlight ? "✦ Популярний" : "→ Рекомендовано"}
                    </span>
                  </div>
                )}

                <div className="mt-2 mb-1">
                  <span className="font-display text-lg font-bold" style={{ color: accentColor }}>{plan.name}</span>
                </div>
                <p className="text-xs text-[var(--text-tertiary)] mb-5 leading-relaxed">{plan.description}</p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="font-display text-3xl sm:text-4xl font-bold">${plan.price}</span>
                  <span className="text-sm text-[var(--text-tertiary)]">/міс</span>
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                      <Check size={12} style={{ color: `rgba(${accentRgb},0.8)`, flexShrink: 0, marginTop: 3 }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {isCurrent ? (
                  <div className="text-center text-sm font-medium rounded-xl py-3"
                    style={{ border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }}>
                    Активний ✓
                  </div>
                ) : CHECKOUT_DISABLED ? (
                  <div className="text-center text-xs rounded-xl py-3 cursor-not-allowed"
                    style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)", background: "rgba(255,255,255,0.02)" }}
                    title="Платформа оновлюється — оформлення відкриється найближчим часом">
                    Скоро
                  </div>
                ) : checkoutUrl ? (
                  <a href={checkoutUrl} target="_blank" rel="noopener noreferrer"
                    className="text-center text-sm font-semibold rounded-xl py-3 block transition-all hover:opacity-90"
                    style={
                      plan.highlight
                        ? { background: "var(--lime)", color: "#0a0a0a" }
                        : plan.accent === "cyan"
                        ? { background: "rgba(140,246,255,0.08)", border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }
                        : { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-primary)" }
                    }>
                    Обрати {plan.name} →
                  </a>
                ) : (
                  <div className="text-center text-xs rounded-xl py-3"
                    style={{ border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A", background: "rgba(245,103,90,0.04)" }}>
                    LS_VARIANT не налаштовано
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* FAQ */}
        <div className="mt-10 sm:mt-12 grid sm:grid-cols-2 gap-3">
          {[
            ["Як скасувати?", "В будь-який момент через портал керування. Доступ зберігається до кінця місяця."],
            ["Які картки приймаються?", "Visa, Mastercard будь-якого банку, включно з українськими. Через LemonSqueezy."],
            ["Є знижки?", "Річна підписка зі знижкою — скоро. Напишіть нам і домовимось індивідуально."],
            ["Що з Free-планом?", freeFaqAnswer],
          ].map(([q, a]) => (
            <div key={q} className="rounded-xl p-4"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <p className="text-sm font-medium mb-1.5">{q}</p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{a}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[var(--text-tertiary)] mt-8">
          Є питання?{" "}
          <a href="mailto:hello@qorax.app" className="hover:opacity-80 transition-opacity" style={{ color: "var(--cyan)" }}>
            hello@qorax.app
          </a>
        </p>
      </main>
    </div>
  );
}
