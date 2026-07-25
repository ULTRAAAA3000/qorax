import type { Metadata } from "next";
import { Reveal } from "@/app/components/Reveal";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { createClient } from "@/app/lib/supabase/server";
import { CHECKOUT_DISABLED } from "@/app/lib/checkoutFlag";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata: Metadata = {
  title: "Pricing — Qorax | Website Monitoring for Small Business",
  description: "Plans from $12.99/mo. Free forever tier, no card required. Automated technical monitoring, SEO audits, and AI insights for your website.",
  alternates: {
    canonical: `${SITE_URL}/en/pricing`,
    languages: {
      uk: `${SITE_URL}/pricing`,
      en: `${SITE_URL}/en/pricing`,
      "x-default": `${SITE_URL}/pricing`,
    },
  },
};

const LS_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qoraxus";
const LS_VARIANTS: Record<string, string> = {
  Starter: process.env.LS_VARIANT_BUSINESS_STARTER ?? "",
  Pro: process.env.LS_VARIANT_BUSINESS_PRO ?? "",
  Agency: process.env.LS_VARIANT_BUSINESS_AGENCY ?? "",
};
function lsUrl(plan: string): string {
  const vid = LS_VARIANTS[plan];
  return vid ? `https://${LS_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${vid}` : `/register?plan=${plan.toLowerCase()}`;
}

const FAQ = [
  { q: "Is there a free plan?", a: "Yes, Free forever — 1 site, daily monitoring, basic SEO audit, 20 AI requests/mo. No time limit, no card required." },
  { q: "Can I change plans anytime?", a: "Yes, upgrade or downgrade instantly through LemonSqueezy checkout." },
  { q: "What counts as a \"site\" for pricing?", a: "One domain or subdomain. For example, site.com and blog.site.com count as two separate sites." },
  { q: "How does billing work?", a: "Monthly by card via LemonSqueezy. Cancel anytime from your account." },
  { q: "Do you offer agency discounts?", a: "Agency is built for unlimited sites with white-label reports. For larger volumes, reach out to us directly." },
];

export default async function PricingPageEn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgId = "";
  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    orgId = membership?.organization_id ?? "";
  }

  function checkoutUrl(plan: string): string {
    if (!user) return `/register?plan=${plan.toLowerCase()}`;
    const base = lsUrl(plan);
    if (!base.startsWith("http")) return base;
    const params = new URLSearchParams();
    if (user.email) params.set("checkout[email]", user.email);
    if (orgId) params.set("checkout[custom][org_id]", orgId);
    return params.toString() ? `${base}?${params.toString()}` : base;
  }

  // Free is intentionally not in PLANS — separate card, CTA always
  // goes to /register or /dashboard, never LemonSqueezy checkout
  // (Free is assigned automatically on signup, handle_new_user 0086).
  // Same structure as app/pricing/page.tsx (uk) — see that file for
  // the source of truth on prices/features if this drifts.
  const PLANS = [
    {
      name: "Starter",
      price: "$12.99",
      tagline: "For freelancers and small business",
      highlighted: false,
      features: [
        "Up to 10 sites, up to 50 projects", "Monitoring every 30 min", "500 keyword queries",
        "6 months of history", "AI — 500 requests", "PDF reports, integrations, automations",
      ],
      url: checkoutUrl("Starter"),
    },
    {
      name: "Pro",
      price: "$24.99",
      tagline: "For professionals",
      highlighted: true,
      features: [
        "Up to 100 sites, unlimited projects", "Monitoring every 5 min", "5,000 keyword queries, 2-year history",
        "AI — 5,000 requests", "White Label, API, AI Copilot", "Team up to 5 seats",
      ],
      url: checkoutUrl("Pro"),
    },
    {
      name: "Agency",
      price: "$59.99",
      tagline: "For agencies and teams",
      highlighted: false,
      features: [
        "Unlimited sites and projects", "Monitoring every minute", "Unlimited keyword queries, full history",
        "AI — 25,000 requests", "White Label, full API", "Team up to 25 seats, priority support",
      ],
      url: checkoutUrl("Agency"),
    },
  ];

  return (
    <main className="flex flex-col min-h-screen">
      <MarketingHeader isLoggedIn={!!user} activePath="/pricing" lang="en" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(214,255,63,0.06) 0%, transparent 60%)" }} />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}>
              ✦ PRICING
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              3–10× {" "}<span className="gradient-text">cheaper</span>{" "}than hiring a contractor
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              Start free, forever. No card required.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-6 sm:px-8 pb-24 w-full">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          <Reveal delay={0}>
            <div
              className="rounded-2xl p-7 sm:p-8 h-full flex flex-col"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-baseline justify-between mb-1">
                <h3 className="font-display text-xl font-medium">Free</h3>
              </div>
              <p className="text-sm text-[var(--text-secondary)] mb-6">Try it, no card needed</p>
              <div className="font-mono text-3xl tabular mb-7">
                <span className="text-[var(--text-primary)] font-bold">$0</span>
                <span className="text-sm text-[var(--text-tertiary)] font-sans font-normal">/mo</span>
              </div>
              <ul className="space-y-3 flex-1">
                {["1 site, daily monitoring", "Basic SEO Audit", "Rank up to 20 queries", "Analytics — 30-day history", "AI — 20 requests/mo", "Telegram Bot"].map(f => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: "var(--text-tertiary)" }} />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={user ? "/dashboard" : "/register"}
                className="mt-8 w-full py-3 rounded-xl text-sm font-medium transition-all text-center block ghost-button justify-center"
              >
                {user ? "Go to dashboard →" : "Sign up →"}
              </a>
            </div>
          </Reveal>

          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={(i + 1) * 0.08}>
              <div
                className={`rounded-2xl p-7 sm:p-8 h-full flex flex-col ${plan.highlighted ? "gradient-border" : ""}`}
                style={{
                  background: plan.highlighted ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                  border: plan.highlighted ? "none" : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: plan.highlighted ? "0 0 60px rgba(214,255,63,0.06), 0 0 120px rgba(140,246,255,0.04)" : "none",
                }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-display text-xl font-medium">{plan.name}</h3>
                  {plan.highlighted && (
                    <span className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium" style={{ background: "var(--gradient-primary)", color: "#0a0a0a" }}>
                      MOST POPULAR
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-6">{plan.tagline}</p>
                <div className="font-mono text-3xl tabular mb-7">
                  <span className={plan.highlighted ? "gradient-text font-bold" : "text-[var(--text-primary)] font-bold"}>{plan.price}</span>
                  <span className="text-sm text-[var(--text-tertiary)] font-sans font-normal">/mo</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                      <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: plan.highlighted ? "var(--cyan)" : "var(--text-tertiary)" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                {CHECKOUT_DISABLED ? (
                  <div
                    className="mt-8 w-full py-3 rounded-xl text-sm font-medium text-center block cursor-not-allowed"
                    style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}
                    title="Sign-ups open soon"
                  >
                    Sign-ups opening soon
                  </div>
                ) : (
                  <a
                    href={plan.url}
                    target={plan.url.startsWith("http") ? "_blank" : undefined}
                    rel={plan.url.startsWith("http") ? "noopener noreferrer" : undefined}
                    className={`mt-8 w-full py-3 rounded-xl text-sm font-medium transition-all text-center block ${plan.highlighted ? "glow-button justify-center" : "ghost-button justify-center"}`}
                  >
                    Choose {plan.name} →
                  </a>
                )}
              </div>
            </Reveal>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-24">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-12">
              Frequently asked questions
            </h2>
          </Reveal>
          <div className="max-w-2xl mx-auto space-y-4">
            {FAQ.map((item, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 className="font-medium mb-2">{item.q}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooterExpanded lang="en" />
    </main>
  );
}
