import { Reveal } from "@/app/components/Reveal";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { createClient } from "@/app/lib/supabase/server";
import { Link2, Wallet, Users, Clock } from "lucide-react";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata = {
  title: "Partner Program — Qorax",
  description: "Refer a client, get 25% of their first payment. For web studios, freelancers, and agencies.",
  alternates: {
    canonical: `${SITE_URL}/en/partners`,
    languages: {
      uk: `${SITE_URL}/partners`,
      en: `${SITE_URL}/en/partners`,
      "x-default": `${SITE_URL}/partners`,
    },
  },
};

const STEPS = [
  {
    icon: Link2,
    title: "Get your link",
    text: "Sign up for Qorax — your personal referral link appears in your dashboard right away.",
  },
  {
    icon: Users,
    title: "Share it with clients",
    text: "Send the link to a client you're recommending website monitoring to — on your own site, in a proposal, wherever works.",
  },
  {
    icon: Clock,
    title: "The client signs up and pays",
    text: "If a client signs up through your link and pays for a subscription within 30 days, it's credited to you.",
  },
  {
    icon: Wallet,
    title: "You get a commission",
    text: "25% of the client's first payment is credited to you automatically. Payout is by transfer, as agreed.",
  },
];

const FAQ = [
  { q: "Who can become a partner?", a: "Anyone with a Qorax account — web studio owners, freelancers, agencies, or simply anyone who knows businesses with outdated websites." },
  { q: "How much do I earn?", a: "25% of the first payment from a client you referred. It's a one-time commission on the first month's payment, not recurring." },
  { q: "How long is my link valid?", a: "Attribution lasts 30 days from the click. If the client pays for a subscription within that window, the commission is yours." },
  { q: "When and how do I get paid?", a: "Payouts are processed manually by transfer, as agreed. You can see the status of every credit in your dashboard: pending → paid." },
  { q: "Can I refer myself?", a: "No, commission is only credited for genuine new clients who pay for a subscription on their own." },
];

export default async function PartnersPageEn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen">
      <MarketingHeader isLoggedIn={!!user} activePath="/partners" lang="en" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(140,246,255,0.06) 0%, transparent 60%)" }} />
        <div className="mx-auto max-w-4xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}>
              ✦ PARTNER PROGRAM
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              Refer a client —{" "}<span className="gradient-text">get 25%</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              For web studios, freelancers, and anyone working with businesses that need website monitoring.
              No minimum thresholds, no fine print.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <div className="mt-10 flex items-center justify-center gap-4">
              <a href={user ? "/dashboard/referrals" : "/register"} className="glow-button text-sm">
                {user ? "Go to partner dashboard" : "Get started →"}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 sm:px-8 pb-24 w-full">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-12">
            How it works
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <div className="rounded-2xl p-6 h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(140,246,255,0.1)" }}>
                  <step.icon size={18} style={{ color: "var(--cyan)" }} />
                </div>
                <p className="font-mono text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>STEP {i + 1}</p>
                <h3 className="font-medium mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Example calculation */}
        <Reveal delay={0.1}>
          <div className="mt-14 rounded-2xl p-8 sm:p-10 gradient-border" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-sm text-[var(--text-tertiary)] mb-1">For example</p>
                <p className="text-lg">
                  Client picks the <strong className="text-[var(--text-primary)]">Pro ($24.99/mo)</strong> plan
                </p>
              </div>
              <div className="text-center">
                <p className="font-mono text-4xl font-bold gradient-text">$6.25</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">your commission for this client</p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl px-6 sm:px-8 pb-24 w-full">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-12">
            Frequently asked questions
          </h2>
        </Reveal>
        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 className="font-medium mb-2">{item.q}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 sm:px-8 pb-24 w-full text-center">
        <Reveal>
          <div className="rounded-2xl p-10 sm:p-14" style={{ background: "rgba(214,255,63,0.04)", border: "1px solid rgba(214,255,63,0.15)" }}>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-3">
              Ready to start earning on referrals?
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
              Sign up for Qorax and get your referral link right away in your dashboard.
            </p>
            <a href={user ? "/dashboard/referrals" : "/register"} className="glow-button text-sm">
              {user ? "Go to partner dashboard" : "Create an account →"}
            </a>
          </div>
        </Reveal>
      </section>

      <SiteFooterExpanded lang="en" />
    </main>
  );
}
