import Link from "next/link";
import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";
import { FeatureBento } from "@/app/components/FeatureBento";
import { PlatformModulesSection } from "@/app/components/PlatformModulesSection";
import { HowItWorksSection } from "@/app/components/HowItWorksSection";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata = {
  title: "Features — Qorax",
  description: "Monitoring, speed, SEO, AI analysis, competitor tracking, and automated reports for your website — all under one roof.",
  alternates: {
    canonical: `${SITE_URL}/en/features`,
    languages: {
      uk: `${SITE_URL}/features`,
      en: `${SITE_URL}/en/features`,
      "x-default": `${SITE_URL}/features`,
    },
  },
};

const FEATURE_GROUPS = [
  {
    eyebrow: "MONITORING",
    accent: "lime" as const,
    title: "Always know what's happening",
    description:
      "Uptime checks every 5 minutes, SSL alerts 30 and 7 days before expiry, automatic email and Telegram notifications — you find out about an issue before your client does.",
    bullets: [
      "Uptime every 5 minutes (Starter+)",
      "SSL: alert 30 and 7 days before expiry",
      "Incidents with timestamp and duration",
      "Email + Telegram notifications",
      "Live dashboard with a response chart",
    ],
  },
  {
    eyebrow: "SPEED",
    accent: "cyan" as const,
    title: "Speed is a chart, not a number",
    description:
      "Daily response-time measurements and Core Web Vitals via the Google PageSpeed Insights API. After a month you get a clear picture: what's getting worse, what's improving.",
    bullets: [
      "Response time — measured daily, kept for 30 days",
      "LCP, INP, CLS — mobile and desktop",
      "Performance Score by Google",
      "Color-coded indicators by Google's thresholds",
      "Trend chart right in the dashboard",
    ],
  },
  {
    eyebrow: "SEO",
    accent: "lime" as const,
    title: "SEO without the guesswork",
    description:
      "Daily checks of meta tags, H1, schema markup, sitemap.xml, and robots.txt. Concrete issues — not abstract recommendations.",
    bullets: [
      "Title, meta description — length and presence",
      "H1: present / missing / multiple",
      "Schema markup (JSON-LD, Microdata)",
      "sitemap.xml: found, URL count",
      "robots.txt: found, not blocking indexing",
    ],
  },
  {
    eyebrow: "AI ANALYSIS",
    accent: "cyan" as const,
    title: "Technical issues expressed in $",
    description:
      "Every issue found gets a plain-language AI explanation and an estimated monthly dollar impact. The business owner understands what to fix first.",
    bullets: [
      "Explanations with no technical jargon",
      "Estimated loss in $ per month",
      "Prioritized by severity: critical / warning / info",
      "A recommendation for every insight",
      "Qoraxus AI chat for follow-up questions (Growth+)",
    ],
  },
  {
    eyebrow: "COMPETITORS",
    accent: "lime" as const,
    title: "Know the moment a competitor changes something",
    description:
      "SHA-256 hash comparison of competitor pages. When they update their landing page, change prices, or launch a promo — you find out automatically.",
    bullets: [
      "Up to 1 competitor on Growth, more on Agency",
      "Daily change checks",
      "Email + Telegram when a change is detected",
      "Timestamp for every change",
      "No access to the competitor's site needed",
    ],
  },
  {
    eyebrow: "REPORTS",
    accent: "cyan" as const,
    title: "A client-ready PDF — no work on your end",
    description:
      "A monthly PDF report is generated automatically and emailed. For agencies — white-label with your own logo, no mention of Qorax.",
    bullets: [
      "Automatic monthly PDF",
      "Uptime, speed, SEO, AI insights",
      "White-label on the Agency plan",
      "One-off audit report on demand",
      "Download from the dashboard anytime",
    ],
  },
];

export default async function FeaturesPageEn() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/features" lang="en" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at 50% 0%, rgba(214,255,63,0.07) 0%, transparent 60%), radial-gradient(ellipse at 80% 50%, rgba(140,246,255,0.05) 0%, transparent 50%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 sm:pb-20 text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-tertiary)",
              }}
            >
              ✦ FEATURES
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight max-w-3xl mx-auto">
              Everything you need for a{" "}
              <span className="gradient-text">healthy website</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
              One platform with six modules instead of five separate tools. Monitoring, SEO, speed, competitor tracking, and AI analysis — already working. Coming next: sites, content, rankings, and analytics in one ecosystem.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 flex items-center justify-center gap-4">
              <Link
                href="/register"
                className="glow-button text-sm !py-2.5 !px-6"
              >
                Try it for free →
              </Link>
              <Link
                href="/en#audit"
                className="ghost-button text-sm !py-2.5 !px-6"
              >
                Quick audit
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* Feature groups — detailed breakdowns */}
      {FEATURE_GROUPS.map((group, i) => {
        const accentColor = group.accent === "lime" ? "var(--lime)" : "var(--cyan)";
        const accentRgb = group.accent === "lime" ? "214,255,63" : "140,246,255";
        const isEven = i % 2 === 0;

        return (
          <section key={group.eyebrow} className="relative">
            <div className="gradient-divider" />
            <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20">
              <div className={`grid lg:grid-cols-2 gap-12 lg:gap-20 items-center ${!isEven ? "lg:[&>*:first-child]:order-2 lg:[&>*:last-child]:order-1" : ""}`}>
                {/* Text */}
                <div>
                  <Reveal>
                    <span
                      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono mb-6"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: accentColor,
                      }}
                    >
                      ✦ {group.eyebrow}
                    </span>
                  </Reveal>
                  <Reveal delay={0.04}>
                    <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight max-w-md">
                      {group.title}
                    </h2>
                  </Reveal>
                  <Reveal delay={0.08}>
                    <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-sm">
                      {group.description}
                    </p>
                  </Reveal>
                </div>

                {/* Bullet card */}
                <Reveal delay={0.1} y={20}>
                  <div
                    className="rounded-2xl p-6 sm:p-8"
                    style={{
                      background: `rgba(${accentRgb}, 0.03)`,
                      border: `1px solid rgba(${accentRgb}, 0.12)`,
                    }}
                  >
                    <ul className="space-y-4">
                      {group.bullets.map((bullet, bi) => (
                        <li key={bi} className="flex items-start gap-3">
                          <span
                            className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                            style={{ background: accentColor }}
                          />
                          <span className="text-sm text-[var(--text-secondary)] leading-relaxed">
                            {bullet}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </Reveal>
              </div>
            </div>
          </section>
        );
      })}

      {/* Bento grid */}
      <FeatureBento lang="en" />

      {/* Platform-wide narrative — all 6 modules */}
      <PlatformModulesSection lang="en" />

      {/* How it works */}
      <HowItWorksSection lang="en" />

      {/* CTA */}
      <section className="relative overflow-hidden">
        <div className="gradient-divider" />
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(214,255,63,0.05) 0%, transparent 60%)",
          }}
        />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24 text-center">
          <Reveal>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-lg mx-auto leading-tight">
              Ready to see it in action?
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="mt-4 text-[var(--text-secondary)] max-w-sm mx-auto">
              Free forever. No card required.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <a href="/register" className="glow-button text-sm !py-3 !px-8 mt-8 inline-block">
              Try it for free →
            </a>
          </Reveal>
        </div>
      </section>

      <SiteFooterExpanded lang="en" />
    </main>
  );
}
