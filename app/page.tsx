import type { Metadata } from "next";
import { Reveal } from "./components/Reveal";
import { AuditForm } from "./components/AuditForm";
import { LiveMonitorPanel } from "./components/LiveMonitorPanel";
import { AiInsightPreview } from "./components/AiInsightPreview";
import { SpeedTrendPreview } from "./components/SpeedTrendPreview";
import { TelegramPreview } from "./components/TelegramPreview";
import { HeroAtmosphere } from "./components/HeroAtmosphere";
import { HeroGlassCubeLazy as HeroGlassCube } from "./components/HeroGlassCubeLazy";
import { FeatureBento } from "./components/FeatureBento";
import { PainSolutionSection } from "./components/PainSolutionSection";
import { LossCalculator } from "./components/LossCalculator";
import { BusinessRoiCalculator } from "./components/BusinessRoiCalculator";
import { HowItWorksSection } from "./components/HowItWorksSection";
import { FaqSection } from "./components/FaqSection";
import { SiteFooterExpanded } from "./components/SiteFooterExpanded";
import { MarketingHeader } from "./components/MarketingHeader";
import { createClient } from "./lib/supabase/server";
import { CHECKOUT_DISABLED } from "./lib/checkoutFlag";

// LemonSqueezy checkout URLs — лінійка Business (PRICING.md Частина 0,
// серпень 2026 — ФІНАЛ): Free/Starter/Growth/Agency. Раніше тут була
// назва "Pro" (стара лінійка Частини A, $12.99/$24.99/$59.99,
// СКАСОВАНА) — перейменовано на "Growth" під нову ціну $79. Free не
// має LemonSqueezy-варіанту взагалі (безкоштовний план призначається
// автоматично при реєстрації) — checkoutUrl для Free завжди веде на
// /register, ніколи на LS checkout.
const LS_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qoraxus";
const LS_VARIANTS: Record<string, string> = {
  Starter: process.env.LS_VARIANT_BUSINESS_STARTER ?? "",
  Growth:  process.env.LS_VARIANT_BUSINESS_GROWTH   ?? "",
  Agency:  process.env.LS_VARIANT_BUSINESS_AGENCY   ?? "",
};
function lsCheckoutUrl(plan: string): string {
  const vid = LS_VARIANTS[plan];
  return vid
    ? `https://${LS_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${vid}`
    : `/register?plan=${plan.toLowerCase()}`;
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata: Metadata = {
  title: "Qorax — MRR для веб-студій і фрілансерів на супроводі сайтів",
  description: "Перетворіть разову розробку сайту на щомісячний рекурентний дохід. Моніторинг, SEO-аудит, White-Label звіти для клієнтів вашої студії чи фріланс-практики. Почніть безкоштовно.",
  alternates: {
    canonical: `${SITE_URL}/`,
    languages: {
      uk: `${SITE_URL}/`,
      en: `${SITE_URL}/en`,
      "x-default": `${SITE_URL}/`,
    },
  },
};

export default async function Home() {
  // Перевіряємо чи користувач залогінений, щоб показати в шапці
  // "До дашборду" замість "Увійти" — інакше залогінений користувач
  // не має прямого шляху в dashboard з лендингу (тільки middleware-редірект
  // з /login, що виглядає як зайвий хоп).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Якщо залогінений — підтягуємо org_id щоб передати в checkout
  let orgId = "";
  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    orgId = membership?.organization_id ?? "";
  }

  // Формуємо checkout URL з org_id (якщо є) або без (нова реєстрація)
  function checkoutUrl(plan: string): string {
    // Якщо юзер не залогінений → завжди на реєстрацію
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
  const growthUrl = checkoutUrl("Growth");
  const agencyUrl = checkoutUrl("Agency");

  return (
    <main className="flex flex-col">
      <MarketingHeader isLoggedIn={!!user} />
      <Hero />
      <LossRoiSection />
      <PainSolutionSection />

      <ProductSection
        eyebrow="МОНІТОРИНГ"
        title="Бачите все, поки клієнт нічого не помічає"
        description="П'ять перевірок щохвилини: доступність, швидкість, SSL, биті посилання, мобільна версія. Якщо щось ламається вночі — ви дізнаєтесь першими, не з відгуку в Google."
        align="right"
        accent="lime"
      >
        <LiveMonitorPanel />
      </ProductSection>

      <ProductSection
        eyebrow="AI-ПОЯСНЕННЯ"
        title="Не «виправте title tag». А скільки це коштує"
        description="Кожна знайдена проблема перекладається у просту мову та орієнтовний грошовий вплив — те, що дійсно зрозуміє власник бізнесу, а не лише розробник."
        align="left"
        accent="cyan"
      >
        <AiInsightPreview />
      </ProductSection>

      <ProductSection
        eyebrow="ІСТОРІЯ У ЧАСІ"
        title="Швидкість — це графік, а не випадкове число"
        description="Кожен замір лягає в історію. Через місяць видно тренд: погіршується сайт чи навпаки — і чи дало ефект те, що ви виправили."
        align="right"
        accent="purple"
      >
        <SpeedTrendPreview />
      </ProductSection>

      <ProductSection
        eyebrow="TELEGRAM"
        title="Керуйте бізнесом, не відкриваючи Dashboard"
        description="Ранковий дайджест, AI-чат про стан сайту, миттєві сповіщення про критичні проблеми — прямо в Telegram. Задайте питання природною мовою: «чому впали позиції» — і отримайте відповідь на основі реальних даних моніторингу."
        align="left"
        accent="cyan"
      >
        <TelegramPreview />
      </ProductSection>

      <FeatureBento />
      <HowItWorksSection />
      <PlansSection freeUrl={freeUrl} starterUrl={starterUrl} growthUrl={growthUrl} agencyUrl={agencyUrl} />
      <FaqSection />

      <FinalCta />
      <SiteFooterExpanded />
    </main>
  );
}

// ============================================================
// Hero — Raycast-style centered layout with floating product preview
// ============================================================

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <HeroAtmosphere />
      <HeroGlassCube />
      <div className="relative z-10 mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-32 pb-16 sm:pb-20">
        {/* Centered headline */}
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
              ДЛЯ ВЕБ-СТУДІЙ, ФРІЛАНСЕРІВ І WORDPRESS-РОЗРОБНИКІВ
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight">
              Перетворіть разову розробку сайтів
              <br />
              <span className="gradient-text">на щомісячний рекурентний дохід</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
              Qorax — готова платформа для супроводу сайтів ваших клієнтів. Автоматичний
              моніторинг аптайму, SEO-аудити простою мовою, трекінг позицій із GSC і CRM
              для лідів — під вашим брендом.
            </p>
          </Reveal>

          <Reveal delay={0.18} className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="/register" className="glow-button text-sm !py-3 !px-7">
              Почати безкоштовно (без картки) →
            </a>
            <a href="#audit" className="ghost-button text-sm !py-3 !px-7">
              Перевірити сайт клієнта за 10 секунд
            </a>
          </Reveal>

          <Reveal delay={0.22}>
            <p className="mt-5 text-xs text-[var(--text-tertiary)]">
              Налаштування займає 2 хвилини · Безкоштовний тариф на 1 сайт назавжди
            </p>
          </Reveal>
        </div>

        {/* Product preview with glow */}
        <Reveal delay={0.28} y={30}>
          <div className="mt-14 sm:mt-16 max-w-2xl mx-auto relative">
            {/* Glow behind the panel */}
            <div
              className="absolute -inset-10 -z-10"
              style={{
                background: "radial-gradient(ellipse at center, rgba(140, 246, 255, 0.06), transparent 70%)",
                filter: "blur(40px)",
              }}
            />
            <LiveMonitorPanel />
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ============================================================
// LossRoiSection — Interactive Lead Magnet (Loss Calculator) +
// Business ROI Calculator, разом одразу під Hero. Артем: "калькулятор
// підняти під херо" — обидва віджети клієнтські, самодостатні,
// об'єднані в одну секцію замість двох окремих проходів по сторінці.
// ============================================================

function LossRoiSection() {
  return (
    <section className="relative overflow-hidden" id="audit">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14 sm:mb-16">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono mb-6 text-[var(--text-tertiary)]"
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
            >
              ✦ ПОКАЖІТЬ КЛІЄНТУ ЦИФРИ
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
              Здали сайт клієнту й попрощались?{" "}
              <span className="gradient-text">Це втрачений дохід</span>
            </h2>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-5 text-lg text-[var(--text-secondary)] leading-relaxed">
              Перевірте, скільки клієнт втрачає прямо зараз — і скільки ви можете
              заробити, продавши йому моніторинг як щомісячну послугу.
            </p>
          </Reveal>
        </div>

        <div className="grid lg:grid-cols-2 gap-8 lg:gap-10 items-start">
          <Reveal delay={0.15}>
            <div className="flex justify-center">
              <LossCalculator />
            </div>
          </Reveal>
          <Reveal delay={0.22}>
            <div className="flex justify-center">
              <BusinessRoiCalculator />
            </div>
          </Reveal>
        </div>

        <Reveal delay={0.26}>
          <p className="mt-8 text-center text-xs text-[var(--text-tertiary)]">
            Без реєстрації. Результат за 60 секунд. Хочете PDF з вашим лого для клієнта? Зареєструйтесь безкоштовно.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ============================================================
// ProductSection — Raycast-style showcase with gradient accents
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
// Plans — glassmorphism cards with gradient accents
// ============================================================

function PlansSection({ freeUrl, starterUrl, growthUrl, agencyUrl }: { freeUrl: string; starterUrl: string; growthUrl: string; agencyUrl: string }) {
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
              ✦ ЗРОЗУМІЛІ ТАРИФИ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            Почніть безкоштовно.{" "}
            <span className="gradient-text">Ростіть, коли готові</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-5 items-stretch">
          <Reveal delay={0.06}>
            <PlanCard
              name="Free"
              checkoutUrl={freeUrl}
              price="$0"
              tagline="Для власного сайту, назавжди"
              features={[
                "1 сайт",
                "Моніторинг раз на день",
                "Базовий SEO-аудит",
                "GSC + GA4 sync",
                "Email-алерти",
              ]}
              variant="default"
            />
          </Reveal>

          <Reveal delay={0.1}>
            <PlanCard
              name="Starter"
              checkoutUrl={starterUrl}
              price="$29"
              tagline="Перші клієнти на супроводі"
              features={[
                "До 3 сайтів",
                "Моніторинг кожні 5 хв",
                "GSC + GA4 sync",
                "Базовий AI",
                "Email-алерти",
              ]}
              variant="default"
            />
          </Reveal>

          <Reveal delay={0.14}>
            <PlanCard
              name="Growth"
              checkoutUrl={growthUrl}
              price="$79"
              tagline="Коли клієнтів уже десяток"
              features={[
                "До 10 сайтів",
                "Моніторинг щохвилини",
                "GSC + GA4 sync",
                "Розширений AI",
                "Telegram-алерти",
                "CRM на 500 контактів",
              ]}
              variant="highlighted"
            />
          </Reveal>

          <Reveal delay={0.18}>
            <PlanCard
              name="Agency"
              checkoutUrl={agencyUrl}
              price="$179"
              tagline="Для студій і команд"
              features={[
                "До 30 сайтів (+$29/сайт понад ліміт)",
                "Моніторинг щохвилини",
                "Безлімітний AI",
                "White-Label PDF зі своїм лого",
                "Розмежування прав для команди",
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
            ПОПУЛЯРНИЙ
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{tagline}</p>
      <div className="font-mono text-3xl tabular mb-7">
        <span className={highlighted ? "gradient-text font-bold" : "text-[var(--text-primary)] font-bold"}>
          {price}
        </span>
        <span className="text-sm text-[var(--text-tertiary)] font-sans font-normal">/міс</span>
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
          title="Реєстрація відкриється найближчим часом"
        >
          Скоро відкриємо реєстрацію
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
          Почати →
        </a>
      )}
    </div>
  );
}

// ============================================================
// Final CTA — gradient background glow section
// ============================================================

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      <div className="gradient-divider" />
      {/* Background glow */}
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
            Дізнайтесь стан сайту —{" "}
            <span className="gradient-text">це безкоштовно</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mt-4 text-[var(--text-secondary)] max-w-md mx-auto">
            Без реєстрації, без зобов&apos;язань. AI-аудит за 60 секунд — просто введіть URL.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-9 flex justify-center">
          <AuditForm />
        </Reveal>
      </div>
    </section>
  );
}
