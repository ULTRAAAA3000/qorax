import { Reveal } from "./components/Reveal";
import { QoraxLogo } from "./components/QoraxLogo";
import { AuditForm } from "./components/AuditForm";
import { LiveMonitorPanel } from "./components/LiveMonitorPanel";
import { AiInsightPreview } from "./components/AiInsightPreview";
import { SpeedTrendPreview } from "./components/SpeedTrendPreview";
import { HeroAtmosphere } from "./components/HeroAtmosphere";
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
        index="01"
        eyebrow="МОНІТОРИНГ"
        title="Бачите все, поки клієнт нічого не помічає"
        description="П'ять перевірок щохвилини: доступність, швидкість, SSL, биті посилання, мобільна версія. Якщо щось ламається вночі — ви дізнаєтесь першими, не з відгуку в Google."
        align="right"
      >
        <LiveMonitorPanel />
      </ProductSection>

      <ProductSection
        index="02"
        eyebrow="AI-ПОЯСНЕННЯ"
        title="Не «виправте title tag». А скільки це коштує"
        description="Кожна знайдена проблема перекладається у просту мову та орієнтовний грошовий вплив — те, що дійсно зрозуміє власник бізнесу, а не лише розробник."
        align="left"
      >
        <AiInsightPreview />
      </ProductSection>

      <ProductSection
        index="03"
        eyebrow="ІСТОРІЯ У ЧАСІ"
        title="Швидкість — це графік, а не випадкове число"
        description="Кожен замір лягає в історію. Через місяць видно тренд: погіршується сайт чи навпаки — і чи дало ефект те, що ви виправили."
        align="right"
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
// Header
// ============================================================

function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b hairline backdrop-blur-md bg-[var(--bg)]/80">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
        <QoraxLogo size="sm" />
        <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--text-secondary)]">
          <a href="#plans" className="hover:text-[var(--text-primary)] transition-colors">
            Тарифи
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
            className="text-sm font-medium rounded-lg px-4 py-2 transition-opacity hover:opacity-90"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            Безкоштовний аудит
          </a>
        </div>
      </div>
    </header>
  );
}

// ============================================================
// Hero — real product slice, with subtle background atmosphere
// ============================================================

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <HeroAtmosphere />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-16 sm:pt-24 pb-20 sm:pb-24">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border hairline px-3 py-1 text-xs font-mono text-[var(--text-tertiary)] mb-7">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lime)" }} />
                Моніторинг працює прямо зараз
              </span>
            </Reveal>

            <Reveal delay={0.06}>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.3rem] font-semibold leading-[1.07] tracking-tight text-[var(--text-primary)]">
                Сайт працює,
                <br />
                поки ви не дивитесь?
              </h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-md">
                Qorax стежить за швидкістю, безпекою та SEO вашого сайту
                щодня — і каже, скільки грошей коштує кожна знайдена проблема.
              </p>
            </Reveal>

            <Reveal delay={0.18} className="mt-9" id="audit">
              <AuditForm />
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                Без реєстрації. Результат за 60 секунд.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.15} y={20}>
            <LiveMonitorPanel />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// ProductSection — Linear-style numbered section with real UI slice
// ============================================================

function ProductSection({
  index,
  eyebrow,
  title,
  description,
  align,
  children,
}: {
  index: string;
  eyebrow: string;
  title: string;
  description: string;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const textCol = (
    <div>
      <Reveal>
        <div className="flex items-baseline gap-3 mb-5">
          <span className="font-mono text-sm text-[var(--text-tertiary)]">{index}</span>
          <span className="font-mono text-xs tracking-wide text-[var(--text-tertiary)]">
            {eyebrow}
          </span>
        </div>
      </Reveal>
      <Reveal delay={0.04}>
        <h2 className="font-display text-2xl sm:text-3xl font-semibold leading-tight max-w-md">
          {title}
        </h2>
      </Reveal>
      <Reveal delay={0.08}>
        <p className="mt-4 text-[15px] leading-relaxed text-[var(--text-secondary)] max-w-sm">
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
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20">
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
// Plans — asymmetric bento layout, Growth visually dominant
// ============================================================

function PlansSection() {
  return (
    <section id="plans" className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="flex items-baseline gap-3 mb-5">
            <span className="font-mono text-sm text-[var(--text-tertiary)]">06</span>
            <span className="font-mono text-xs tracking-wide text-[var(--text-tertiary)]">
              ТАРИФИ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-xl leading-tight">
            У 3-10 разів дешевше за найм підрядника
          </h2>
        </Reveal>

        <div className="mt-12 grid lg:grid-cols-[0.85fr_1.15fr_0.85fr] gap-5 items-stretch">
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
      className="rounded-2xl border p-7 sm:p-8 h-full flex flex-col"
      style={{
        borderColor: highlighted ? "var(--cyan)" : "var(--border-hairline)",
        background: highlighted ? "var(--bg-raised-2)" : "var(--bg-raised)",
      }}
    >
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="font-display text-xl font-medium">{name}</h3>
        {highlighted && (
          <span
            className="font-mono text-[10px] tracking-wide px-2 py-1 rounded-full"
            style={{ background: "var(--cyan)", color: "#0c111d" }}
          >
            ПОПУЛЯРНИЙ
          </span>
        )}
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-6">{tagline}</p>
      <div className="font-mono text-3xl tabular mb-7">
        {price}
        <span className="text-sm text-[var(--text-tertiary)] font-sans">/міс</span>
      </div>
      <ul className="space-y-3 flex-1">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
            <span
              className="mt-1.5 h-1 w-1 rounded-full shrink-0"
              style={{ background: highlighted ? "var(--cyan)" : "var(--text-tertiary)" }}
            />
            {f}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ============================================================
// Final CTA
// ============================================================

function FinalCta() {
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-28 text-center">
        <Reveal>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-lg mx-auto leading-tight">
            Перевірте свій сайт — це безкоштовно
          </h2>
        </Reveal>
        <Reveal delay={0.06} className="mt-9 flex justify-center">
          <AuditForm />
        </Reveal>
      </div>
    </section>
  );
}
