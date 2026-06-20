import { Reveal } from "./components/Reveal";
import { QoraxLogo } from "./components/QoraxLogo";
import { AuditForm } from "./components/AuditForm";
import { LiveMonitorPanel } from "./components/LiveMonitorPanel";
import { AiInsightPreview } from "./components/AiInsightPreview";
import { SpeedTrendPreview } from "./components/SpeedTrendPreview";
import { HeroAtmosphere } from "./components/HeroAtmosphere";
import { HeroGlassCubeLazy as HeroGlassCube } from "./components/HeroGlassCubeLazy";
import { StatsStrip } from "./components/StatsStrip";
import { FeatureBento } from "./components/FeatureBento";
import { HowItWorksSection } from "./components/HowItWorksSection";
import { FaqSection } from "./components/FaqSection";
import { SiteFooterExpanded } from "./components/SiteFooterExpanded";

export default function Home() {
  return (
    <main className="flex flex-col">
      <SiteHeader />
      <Hero />
      <StatsStrip />

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

      <FeatureBento />
      <HowItWorksSection />
      <PlansSection />
      <FaqSection />
      <FinalCta />
      <SiteFooterExpanded />
    </main>
  );
}

// ============================================================
// Header — glassmorphism navbar with full navigation
// ============================================================

function SiteHeader() {
  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "rgba(10, 10, 10, 0.7)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
        <QoraxLogo size="sm" />
        <nav className="hidden md:flex items-center gap-7 text-sm text-[var(--text-secondary)]">
          <a href="#features" className="hover:text-[var(--text-primary)] transition-colors">
            Можливості
          </a>
          <a href="#how-it-works" className="hover:text-[var(--text-primary)] transition-colors">
            Як працює
          </a>
          <a href="#plans" className="hover:text-[var(--text-primary)] transition-colors">
            Тарифи
          </a>
          <a href="#faq" className="hover:text-[var(--text-primary)] transition-colors">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <a
            href="/login"
            className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
          >
            Увійти
          </a>
          <a
            href="#audit"
            className="glow-button text-sm !py-2 !px-4"
          >
            Безкоштовний аудит
          </a>
        </div>
      </div>
    </header>
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
      <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-32 pb-16 sm:pb-20">
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
              Моніторинг працює прямо зараз
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight">
              Сайт працює,
              <br />
              <span className="gradient-text">поки ви не дивитесь?</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
              Qorax стежить за швидкістю, безпекою та SEO вашого сайту
              щодня — і каже, скільки грошей коштує кожна знайдена проблема.
            </p>
          </Reveal>

          <Reveal delay={0.18} className="mt-10 flex justify-center" id="audit">
            <AuditForm />
          </Reveal>

          <Reveal delay={0.22}>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
              Без реєстрації. Результат за 60 секунд.
            </p>
          </Reveal>
        </div>

        {/* Product preview with glow */}
        <Reveal delay={0.25} y={30}>
          <div className="mt-16 sm:mt-20 max-w-2xl mx-auto relative">
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

function PlansSection() {
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
              ✦ ТАРИФИ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            У 3-10 разів{" "}
            <span className="gradient-text">дешевше</span>{" "}
            за найм підрядника
          </h2>
        </Reveal>

        <div className="mt-14 grid lg:grid-cols-[0.85fr_1.15fr_0.85fr] gap-5 items-stretch">
          <Reveal delay={0.06} className="lg:pt-6">
            <PlanCard
              name="Starter"
              price="$49"
              tagline="Один сайт, спокійний сон"
              features={[
                "Uptime моніторинг",
                "Швидкість + графік у часі",
                "SSL та домен — алерти",
                "Биті посилання",
                "AI-пояснення простою мовою",
                "PDF-звіт щомісяця",
              ]}
              variant="default"
            />
          </Reveal>

          <Reveal delay={0.1}>
            <PlanCard
              name="Growth"
              price="$99"
              tagline="Коли вже росте трафік"
              features={[
                "Все з Starter",
                "Core Web Vitals",
                "SEO: meta, schema, sitemap",
                "Google Search Console",
                "AI: вплив на дохід у $",
                "Моніторинг 1 конкурента",
                "Telegram-алерти",
                "Живий дашборд",
              ]}
              variant="highlighted"
            />
          </Reveal>

          <Reveal delay={0.14} className="lg:pt-6">
            <PlanCard
              name="Agency"
              price="$199"
              tagline="До 5 сайтів під одним дахом"
              features={[
                "Все з Growth, на 5 сайтів",
                "White-label звіти",
                "AI генерація текстів і SEO",
                "Конкуренти на кожен сайт",
                "Пріоритетна підтримка",
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
}: {
  name: string;
  price: string;
  tagline: string;
  features: string[];
  variant: "default" | "highlighted";
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
      <button
        className={`mt-8 w-full py-3 rounded-xl text-sm font-medium transition-all ${
          highlighted ? "glow-button justify-center" : "ghost-button justify-center"
        }`}
      >
        Почати
      </button>
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
            Перевірте свій сайт —{" "}
            <span className="gradient-text">це безкоштовно</span>
          </h2>
        </Reveal>
        <Reveal delay={0.06}>
          <p className="mt-4 text-[var(--text-secondary)] max-w-md mx-auto">
            Без реєстрації, без зобов&apos;язань. Просто введіть URL.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="mt-9 flex justify-center">
          <AuditForm />
        </Reveal>
      </div>
    </section>
  );
}
