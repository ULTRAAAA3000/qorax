import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata = {
  title: "About — Qorax",
  description: "Qorax is built by a team from Ukraine who know firsthand what it means for a website to go down unnoticed.",
  alternates: {
    canonical: `${SITE_URL}/en/about`,
    languages: {
      uk: `${SITE_URL}/about`,
      en: `${SITE_URL}/en/about`,
      "x-default": `${SITE_URL}/about`,
    },
  },
};

// NOTE (i18n pass, not a content decision): team roster below is
// translated 1:1 from the uk page as-is. Flagged separately to
// Artem — this "team of 4" doesn't match Qorax's actual solo-founder
// structure per project memory, worth a look independent of i18n.
const TEAM = [
  {
    name: "Artem Koval",
    role: "Co-founder & CEO",
    bio: "10+ years in web development and digital agencies. Started Qorax after a client's online store went down for 4 hours unnoticed — costing them a sum comparable to a month's ad budget.",
    initials: "AK",
    accent: "lime",
  },
  {
    name: "Daria Lytvyn",
    role: "Co-founder & CTO",
    bio: "Distributed-systems architect. Before Qorax, built monitoring infrastructure for fintech startups in Berlin. Owns reliability: a service that monitors other sites can't go down itself.",
    initials: "DL",
    accent: "cyan",
  },
  {
    name: "Maksym Bondar",
    role: "Head of Product",
    bio: "Former product manager in B2B SaaS. Ran 200+ interviews with small-business owners and agencies. He's the one who pushed for Revenue Impact — translating technical issues into $ instead of \u201Cfix the title tag.\u201D",
    initials: "MB",
    accent: "lime",
  },
  {
    name: "Olena Rudenko",
    role: "Growth & Partnerships",
    bio: "Runs partnerships with agencies and freelancers across Ukraine. Previously CMO at several SaaS companies. Believes the best marketing is a product that explains itself.",
    initials: "OR",
    accent: "cyan",
  },
];

const VALUES = [
  {
    icon: "⚡",
    title: "Simplicity first",
    description:
      "A technical report a business owner can't understand is a waste of time. Every metric in Qorax is explained in plain language and tied to a dollar figure.",
  },
  {
    icon: "🛡",
    title: "Reliability, no compromises",
    description:
      "We can't monitor other sites while going down ourselves. Our infrastructure is built for 99.9% uptime — and we measure every single minute.",
  },
  {
    icon: "🇺🇦",
    title: "Made in Ukraine",
    description:
      "The team is spread across Kyiv, Dnipro, and Lviv. We're building a global product from Ukraine — and we're proud of it.",
  },
  {
    icon: "🔄",
    title: "Iteration, not perfectionism",
    description:
      "Weekly releases, real feedback from real customers, fast fixes. We don't wait for the perfect moment — we build and improve.",
  },
];

export default async function AboutPageEn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/about" lang="en" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at 30% 0%, rgba(140,246,255,0.06) 0%, transparent 55%), radial-gradient(ellipse at 70% 80%, rgba(214,255,63,0.04) 0%, transparent 50%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 sm:pb-20">
          <div className="max-w-2xl">
            <Reveal>
              <span
                className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  color: "var(--text-tertiary)",
                }}
              >
                ✦ ABOUT THE TEAM
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                We&apos;ve been{" "}
                <span className="gradient-text">on the other side of this problem</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Qorax came out of real pain: a client&apos;s site went down for four hours — and nobody noticed. Not the owner, not the agency. The first person to find out was a customer who left an angry review.
              </p>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mt-4 text-[var(--text-secondary)] leading-relaxed max-w-xl">
                That&apos;s when we decided to build the tool that should have existed all along: watch, notice, warn — and explain in plain language what it&apos;s costing you.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="relative">
        <div className="gradient-divider" />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-14 sm:py-16">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            {[
              { value: "2023", label: "Year founded" },
              { value: "4", label: "People on the team" },
              { value: "🇺🇦", label: "Team from Ukraine" },
              { value: "$0", label: "Outside funding" },
            ].map((stat, i) => (
              <Reveal key={stat.label} delay={i * 0.05}>
                <div className="text-center">
                  <div className="font-display text-3xl sm:text-4xl font-bold gradient-text mb-2">
                    {stat.value}
                  </div>
                  <div className="text-sm text-[var(--text-tertiary)]">{stat.label}</div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Vision — platform, not just a tool */}
      <section className="relative">
        <div className="gradient-divider" />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20">
          <div className="grid lg:grid-cols-[0.7fr_1.3fr] gap-10 items-start">
            <div>
              <Reveal>
                <span
                  className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)] mb-5"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                >
                  ✦ WHERE WE&apos;RE HEADED
                </span>
              </Reveal>
              <Reveal delay={0.04}>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
                  From a tool —{" "}
                  <span className="gradient-text">to an ecosystem</span>
                </h2>
              </Reveal>
            </div>
            <div>
              <Reveal delay={0.06}>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Monitoring was only the first step. We&apos;re building Qorax as a platform where a business can go through the entire journey in one place: build a presence online, keep control of its technical health, get AI help with content, see its search rankings, and understand where customers come from — without switching between five different services.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
                  Audit — monitoring, speed, SEO, and AI analysis — already works, and it&apos;s what our first customers use today. Sites, AI, Content, Rank, and Analytics are modules we&apos;re actively building right now, step by step, together with the people already on board.
                </p>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="relative">
        <div className="gradient-divider" />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20">
          <Reveal>
            <div className="mb-4">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                ✦ TEAM
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.04}>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold mb-12">
              Who builds Qorax
            </h2>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-5">
            {TEAM.map((member, i) => {
              const accentColor = member.accent === "lime" ? "var(--lime)" : "var(--cyan)";
              const accentRgb = member.accent === "lime" ? "214,255,63" : "140,246,255";
              return (
                <Reveal key={member.name} delay={0.06 * i}>
                  <div
                    className="rounded-2xl p-6 sm:p-7 h-full"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div
                        className="h-12 w-12 rounded-xl flex items-center justify-center font-display font-semibold text-sm shrink-0"
                        style={{
                          background: `rgba(${accentRgb}, 0.08)`,
                          border: `1px solid rgba(${accentRgb}, 0.2)`,
                          color: accentColor,
                        }}
                      >
                        {member.initials}
                      </div>
                      <div>
                        <div className="font-display font-semibold text-[var(--text-primary)]">
                          {member.name}
                        </div>
                        <div
                          className="text-xs font-mono mt-0.5"
                          style={{ color: accentColor }}
                        >
                          {member.role}
                        </div>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                      {member.bio}
                    </p>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="relative">
        <div className="gradient-divider" />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20">
          <Reveal>
            <div className="mb-4">
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                ✦ VALUES
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.04}>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold mb-12">
              What matters to us
            </h2>
          </Reveal>

          <div className="grid sm:grid-cols-2 gap-5">
            {VALUES.map((value, i) => (
              <Reveal key={value.title} delay={0.06 * i}>
                <div
                  className="rounded-2xl p-6"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  <div className="text-2xl mb-4">{value.icon}</div>
                  <h3 className="font-display text-lg font-semibold mb-2">
                    {value.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
                    {value.description}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Contact + CTA */}
      <section className="relative">
        <div className="gradient-divider" />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background: "radial-gradient(ellipse at center, rgba(214,255,63,0.04) 0%, transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20">
          <div className="grid sm:grid-cols-2 gap-10">
            <Reveal>
              <div>
                <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">
                  Get in touch
                </h2>
                <p className="text-[var(--text-secondary)] mb-6 leading-relaxed text-sm max-w-sm">
                  Have a question, an idea, or want to partner with us? Reach out directly — we reply within one business day.
                </p>
                <div className="space-y-3">
                  <a
                    href="mailto:hello@qorax.app"
                    className="flex items-center gap-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors group"
                  >
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      ✉
                    </span>
                    hello@qorax.app
                  </a>
                  <a
                    href="mailto:support@qorax.app"
                    className="flex items-center gap-3 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <span
                      className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
                    >
                      🛟
                    </span>
                    support@qorax.app
                  </a>
                </div>
              </div>
            </Reveal>

            <Reveal delay={0.08}>
              <div
                className="rounded-2xl p-7 h-full flex flex-col justify-between"
                style={{
                  background: "rgba(214,255,63,0.03)",
                  border: "1px solid rgba(214,255,63,0.12)",
                }}
              >
                <div>
                  <p className="font-mono text-xs text-[var(--lime)] mb-3">FREE FOREVER</p>
                  <h3 className="font-display text-xl font-semibold mb-2">
                    Try Qorax yourself
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    No card required. Free forever tier — see everything before you decide on an upgrade.
                  </p>
                </div>
                <a
                  href="/register"
                  className="glow-button text-sm !py-2.5 text-center mt-6 block"
                >
                  Try it for free →
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <SiteFooterExpanded lang="en" />
    </main>
  );
}
