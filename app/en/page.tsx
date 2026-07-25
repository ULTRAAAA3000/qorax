import type { Metadata } from "next";
import { Reveal } from "@/app/components/Reveal";
import { AuditForm } from "@/app/components/AuditForm";
import { LiveMonitorPanel } from "@/app/components/LiveMonitorPanel";
import { AiInsightPreview } from "@/app/components/AiInsightPreview";
import { SpeedTrendPreview } from "@/app/components/SpeedTrendPreview";
import { TelegramPreview } from "@/app/components/TelegramPreview";
import { HeroAtmosphere } from "@/app/components/HeroAtmosphere";
import { HeroGlassCubeLazy as HeroGlassCube } from "@/app/components/HeroGlassCubeLazy";
import { StatsStrip } from "@/app/components/StatsStrip";
import { FeatureBento } from "@/app/components/FeatureBento";
import { EcosystemSection } from "@/app/components/EcosystemSection";
import { HowItWorksSection } from "@/app/components/HowItWorksSection";
import { FaqSection } from "@/app/components/FaqSection";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { ProductDivider } from "@/app/components/ProductDivider";
import { MailInboxPreview } from "@/app/components/MailInboxPreview";
import { MailAiAgentPreview } from "@/app/components/MailAiAgentPreview";
import { CreatorCanvasPreview } from "@/app/components/CreatorCanvasPreview";
import { CreatorBrandKitPreview } from "@/app/components/CreatorBrandKitPreview";
import { OfficeDocsPreview } from "@/app/components/OfficeDocsPreview";
import { OfficeSheetsSlidesPreview } from "@/app/components/OfficeSheetsSlidesPreview";
import { BrowserInspectorPreview } from "@/app/components/BrowserInspectorPreview";
import { BrowserCollectionsPreview } from "@/app/components/BrowserCollectionsPreview";
import { createClient } from "@/app/lib/supabase/server";
import { CHECKOUT_DISABLED } from "@/app/lib/checkoutFlag";
import { Briefcase, Mail, Palette, FileText, Globe } from "lucide-react";

// Англійська версія головної (0086/i18n етап 2) — дзеркало
// app/page.tsx з перекладеним текстом. Локальні під-компоненти
// (Hero/ProductSection/PlansSection/PlanCard/FinalCta) НЕ спільні
// (визначені локально в uk-файлі, не експортуються) — тому
// продубльовані тут з англійським текстом замість парametrизації
// через ще один спільний модуль; уся текстова "начинка" (превью-
// компоненти, StatsStrip, FeatureBento, EcosystemSection,
// HowItWorksSection, FaqSection, ProductDivider, MarketingHeader,
// SiteFooterExpanded) — СПІЛЬНІ файли з lang prop, як і скрізь у
// цьому i18n-проході.

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata: Metadata = {
  title: "Qorax — Ecosystem for running your business online",
  description: "Five products under one roof: website monitoring, mail, a visual editor, docs, and your own browser — with AI in every one. 3–10× cheaper than hiring a contractor.",
  alternates: {
    canonical: `${SITE_URL}/en`,
    languages: {
      uk: `${SITE_URL}/`,
      en: `${SITE_URL}/en`,
      "x-default": `${SITE_URL}/`,
    },
  },
};

const LS_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qoraxus";
const LS_VARIANTS: Record<string, string> = {
  Starter: process.env.LS_VARIANT_BUSINESS_STARTER ?? "",
  Pro:     process.env.LS_VARIANT_BUSINESS_PRO      ?? "",
  Agency:  process.env.LS_VARIANT_BUSINESS_AGENCY   ?? "",
};
function lsCheckoutUrl(plan: string): string {
  const vid = LS_VARIANTS[plan];
  return vid
    ? `https://${LS_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${vid}`
    : `/register?plan=${plan.toLowerCase()}`;
}

export default async function HomeEn() {
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
    const base = lsCheckoutUrl(plan);
    if (!base.startsWith("http")) return base;
    const params = new URLSearchParams();
    if (user.email) params.set("checkout[email]", user.email);
    if (orgId) params.set("checkout[custom][org_id]", orgId);
    return params.toString() ? `${base}?${params.toString()}` : base;
  }

  const freeUrl = user ? "/dashboard" : "/register";
  const starterUrl = checkoutUrl("Starter");
  const proUrl = checkoutUrl("Pro");
  const agencyUrl = checkoutUrl("Agency");

  return (
    <main className="flex flex-col">
      <MarketingHeader isLoggedIn={!!user} lang="en" />
      <Hero />
      <StatsStrip lang="en" />
      <EcosystemSection lang="en" />

      <ProductDivider
        icon={Briefcase}
        productName="Qorax Business"
        tagline="Run your business online"
        href="/login"
        accent="lime"
        lang="en"
      />

      <ProductSection
        eyebrow="MONITORING"
        title="See everything before your client notices anything"
        description="Five checks every minute: uptime, speed, SSL, broken links, mobile version. If something breaks at night, you find out first — not from a Google review."
        align="right"
        accent="lime"
      >
        <LiveMonitorPanel lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="AI EXPLANATIONS"
        title="Not \u201Cfix the title tag.\u201D How much it's costing you."
        description="Every issue found gets translated into plain language and an estimated dollar impact — something a business owner actually understands, not just a developer."
        align="left"
        accent="cyan"
      >
        <AiInsightPreview lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="HISTORY OVER TIME"
        title="Speed is a chart, not a random number"
        description="Every measurement goes into history. After a month you see the trend: is the site getting worse, or better — and whether your fix actually worked."
        align="right"
        accent="purple"
      >
        <SpeedTrendPreview lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="TELEGRAM"
        title="Run your business without opening the dashboard"
        description="Morning digest, AI chat about your site's status, instant alerts on critical issues — right in Telegram. Ask in plain language: \u201Cwhy did rankings drop\u201D — and get an answer based on real monitoring data."
        align="left"
        accent="cyan"
      >
        <TelegramPreview lang="en" />
      </ProductSection>

      <FeatureBento lang="en" />
      <HowItWorksSection lang="en" />
      <PlansSection freeUrl={freeUrl} starterUrl={starterUrl} proUrl={proUrl} agencyUrl={agencyUrl} />
      <FaqSection lang="en" />

      {/* ============================================================
          Qorax Mail
          ============================================================ */}
      <ProductDivider
        icon={Mail}
        productName="Qorax Mail"
        tagline="Talk to your clients"
        href="/mail"
        accent="cyan"
        lang="en"
      />

      <ProductSection
        eyebrow="SHARED INBOX"
        title="Your whole team in one inbox"
        description="Business email and client contacts in one workspace — no more switching between Gmail, notes, and a CRM."
        align="right"
        accent="cyan"
      >
        <MailInboxPreview lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="AI AGENTS"
        title="A reply to your client in one click, not 10 minutes"
        description="AI drafts the email based on prior correspondence and your brand's tone. You just review and send."
        align="left"
        accent="cyan"
      >
        <MailAiAgentPreview lang="en" />
      </ProductSection>

      {/* ============================================================
          Qorax Creator
          ============================================================ */}
      <ProductDivider
        icon={Palette}
        productName="Qorax Creator"
        tagline="Create visuals"
        href="/creator"
        accent="purple"
        lang="en"
      />

      <ProductSection
        eyebrow="INFINITE CANVAS"
        title="Websites, decks, and banners — on one board"
        description="Website Mode embeds the Sites editor right in the canvas. Drag blocks, compose the layout, see the whole project at once."
        align="right"
        accent="purple"
      >
        <CreatorCanvasPreview lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="BRAND KIT"
        title="One brand, consistent everywhere"
        description="Colors, fonts, and ready-made components apply instantly on any board — no manual matching every time."
        align="left"
        accent="purple"
      >
        <CreatorBrandKitPreview lang="en" />
      </ProductSection>

      {/* ============================================================
          Qorax Office
          ============================================================ */}
      <ProductDivider
        icon={FileText}
        productName="Qorax Office"
        tagline="Work with documents"
        href="/office"
        accent="lime"
        lang="en"
      />

      <ProductSection
        eyebrow="DOCS"
        title="AI Writer drafts the finished text for you"
        description="Documents with formatting, tables, and an AI assistant that writes for you — not a Word clone, but something that does the actual work."
        align="right"
        accent="lime"
      >
        <OfficeDocsPreview lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="SHEETS & SLIDES"
        title="Spreadsheets with formulas. Decks from a description."
        description="Simple spreadsheets with SUM/AVERAGE/COUNT and CSV import. Presentations where AI builds the structure itself — from slide to finished pitch."
        align="left"
        accent="lime"
      >
        <OfficeSheetsSlidesPreview lang="en" />
      </ProductSection>

      {/* ============================================================
          Qorax Browser
          ============================================================ */}
      <ProductDivider
        icon={Globe}
        productName="Qorax Browser"
        tagline="Explore the web"
        href="/browser"
        accent="cyan"
        lang="en"
      />

      <ProductSection
        eyebrow="AI SIDEBAR"
        title="AI explains any website in one click"
        description="Site Inspector shows a competitor's tech stack, colors, fonts, SEO, and speed — and the AI Sidebar instantly explains what it means."
        align="right"
        accent="cyan"
      >
        <BrowserInspectorPreview lang="en" />
      </ProductSection>

      <ProductSection
        eyebrow="COLLECTIONS"
        title="Competitors and ideas in one place — not in bookmarks"
        description="Save references as you browse and send them straight to Creator or Office in one click via Smart Capture."
        align="left"
        accent="cyan"
      >
        <BrowserCollectionsPreview lang="en" />
      </ProductSection>

      <FinalCta />
      <SiteFooterExpanded lang="en" />
    </main>
  );
}

// ============================================================
// Hero
// ============================================================

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <HeroAtmosphere />
      <HeroGlassCube />
      <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-32 pb-16 sm:pb-20">
        <div className="text-center max-w-3xl mx-auto">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8"
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                color: "var(--text-tertiary)",
              }}
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--lime)] animate-pulse-glow" />
              Business · Mail · Creator · Office · Browser — one brand
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight">
              An ecosystem
              <br />
              <span className="gradient-text">for running your business online</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
              Five products under one roof: website monitoring, mail, a visual
              editor, documents, and your own browser — with AI in every one.
            </p>
          </Reveal>
        </div>

        <Reveal delay={0.25} y={30}>
          <div className="mt-14 sm:mt-16 max-w-2xl mx-auto relative">
            <div
              className="absolute -inset-10 -z-10"
              style={{
                background: "radial-gradient(ellipse at center, rgba(140, 246, 255, 0.06), transparent 70%)",
                filter: "blur(40px)",
              }}
            />
            <LiveMonitorPanel lang="en" />
          </div>
        </Reveal>

        <Reveal delay={0.3} className="mt-14 sm:mt-16" id="audit">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-sm text-[var(--text-tertiary)] mb-5">
              Want to start with a free website check?
            </p>
            <div className="flex justify-center">
              <AuditForm lang="en" />
            </div>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
              No sign-up. Results in 60 seconds.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ============================================================
// ProductSection
// ============================================================

function ProductSection({
  eyebrow,
  title,
  description,
  align,
  accent,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  align: "left" | "right";
  accent: "lime" | "cyan" | "purple";
  children: React.ReactNode;
}) {
  const accentColor = accent === "lime" ? "var(--lime)" : accent === "cyan" ? "var(--cyan)" : "var(--purple)";

  const textCol = (
    <div>
      <Reveal>
        <span
          className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono mb-6"
          style={{
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            color: accentColor,
          }}
        >
          ✦ {eyebrow}
        </span>
      </Reveal>
      <Reveal delay={0.04}>
        <h2 className="font-display text-2xl sm:text-3xl lg:text-4xl font-semibold leading-tight max-w-md">
          {title}
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="mt-5 text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-sm">
          {description}
        </p>
      </Reveal>
    </div>
  );

  const visualCol = (
    <Reveal delay={0.1} y={20}>
      {children}
    </Reveal>
  );

  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-24">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {align === "left" ? (
            <>
              {textCol}
              {visualCol}
            </>
          ) : (
            <>
              <div className="lg:order-2">{textCol}</div>
              <div className="lg:order-1">{visualCol}</div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Plans
// ============================================================

function PlansSection({ freeUrl, starterUrl, proUrl, agencyUrl }: { freeUrl: string; starterUrl: string; proUrl: string; agencyUrl: string }) {
  return (
    <section id="plans" className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="text-center mb-4">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
            >
              ✦ QORAX BUSINESS PRICING
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            Start for free.{" "}
            <span className="gradient-text">Grow when you&apos;re ready</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          <Reveal delay={0.06}>
            <PlanCard
              name="Free"
              checkoutUrl={freeUrl}
              price="$0"
              tagline="Try it, no card needed"
              features={[
                "1 site, daily monitoring",
                "Basic SEO Audit",
                "Rank up to 20 queries",
                "Analytics — 30-day history",
                "AI — 20 requests/mo",
                "Telegram Bot",
              ]}
              variant="default"
            />
          </Reveal>

          <Reveal delay={0.1}>
            <PlanCard
              name="Starter"
              checkoutUrl={starterUrl}
              price="$12.99"
              tagline="For freelancers and small business"
              features={[
                "Up to 10 sites, up to 50 projects",
                "Monitoring every 30 min",
                "500 keyword queries",
                "6 months of history",
                "AI — 500 requests",
                "PDF reports, integrations, automations",
              ]}
              variant="default"
            />
          </Reveal>

          <Reveal delay={0.14}>
            <PlanCard
              name="Pro"
              checkoutUrl={proUrl}
              price="$24.99"
              tagline="For professionals"
              features={[
                "Up to 100 sites, unlimited projects",
                "Monitoring every 5 min",
                "5,000 keyword queries, 2-year history",
                "AI — 5,000 requests",
                "White Label reports, API, AI Copilot",
                "Team up to 5 seats",
              ]}
              variant="highlighted"
            />
          </Reveal>

          <Reveal delay={0.18}>
            <PlanCard
              name="Agency"
              checkoutUrl={agencyUrl}
              price="$59.99"
              tagline="For agencies and teams"
              features={[
                "Unlimited sites and projects",
                "Monitoring every minute",
                "Unlimited keyword queries, full history",
                "AI — 25,000 requests",
                "White Label, full API",
                "Team up to 25 seats, priority support",
              ]}
              variant="default"
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function PlanCard({
  name,
  price,
  tagline,
  features,
  variant,
  checkoutUrl,
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  variant: "default" | "highlighted";
  checkoutUrl: string;
}) {
  const highlighted = variant === "highlighted";
  return (
    <div
      className={`rounded-2xl p-7 sm:p-8 h-full flex flex-col transition-all duration-300 ${
        highlighted ? "gradient-border" : ""
      }`}
      style={{
        background: highlighted ? "rgba(255, 255, 255, 0.06)" : "rgba(255, 255, 255, 0.03)",
        border: highlighted ? "none" : "1px solid rgba(255, 255, 255, 0.06)",
        boxShadow: highlighted
          ? "0 0 60px rgba(214, 255, 63, 0.06), 0 0 120px rgba(140, 246, 255, 0.04)"
          : "none",
      }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-display text-xl font-medium">{name}</h3>
        {highlighted && (
          <span
            className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium"
            style={{ background: "var(--gradient-primary)", color: "#0a0a0a" }}
          >
            MOST POPULAR
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{tagline}</p>
      <div className="font-mono text-3xl tabular mb-7">
        <span className={highlighted ? "gradient-text font-bold" : "text-[var(--text-primary)] font-bold"}>
          {price}
        </span>
        <span className="text-sm text-[var(--text-tertiary)] font-sans font-normal">/mo</span>
      </div>
      <ul className="space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
            <span
              className="mt-1.5 h-1 w-1 rounded-full shrink-0"
              style={{
                background: highlighted
                  ? "var(--cyan)"
                  : "var(--text-tertiary)",
              }}
            />
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
          href={checkoutUrl}
          target={checkoutUrl.startsWith("http") ? "_blank" : undefined}
          rel={checkoutUrl.startsWith("http") ? "noopener noreferrer" : undefined}
          className={`mt-8 w-full py-3 rounded-xl text-sm font-medium transition-all text-center block ${
            highlighted ? "glow-button justify-center" : "ghost-button justify-center"
          }`}
        >
          Get started →
        </a>
      )}
    </div>
  );
}

// ============================================================
// Final CTA
// ============================================================

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="gradient-divider" />
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse at center top, rgba(214, 255, 63, 0.06) 0%, transparent 50%), radial-gradient(ellipse at center bottom, rgba(140, 246, 255, 0.04) 0%, transparent 50%)",
        }}
      />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-28 text-center">
        <Reveal>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold max-w-lg mx-auto leading-tight">
            Find out your site&apos;s health —{" "}
            <span className="gradient-text">it&apos;s free</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mt-4 text-[var(--text-secondary)] max-w-md mx-auto">
            No sign-up, no strings attached. AI audit in 60 seconds — just enter a URL.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-9 flex justify-center">
          <AuditForm lang="en" />
        </Reveal>
      </div>
    </section>
  );
}
