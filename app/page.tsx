import { PulseWaveform } from "./components/PulseWaveform";
import { Reveal } from "./components/Reveal";
import { QoraxLogo } from "./components/QoraxLogo";
import { PainCard } from "./components/PainCard";
import { AuditForm } from "./components/AuditForm";

export default function Home() {
  return (
    <main className="flex flex-col">
      <SiteHeader />
      <Hero />
      <PainSection />
      <HowItWorksSection />
      <PlansSection />
      <FinalCta />
      <SiteFooter />
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
          <a href="#how" className="hover:text-[var(--text-primary)] transition-colors">
            Як це працює
          </a>
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
// Hero
// ============================================================

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-28 pb-20 sm:pb-24">
        <div className="grid lg:grid-cols-[1.1fr_0.9fr] gap-16 items-center">
          <div>
            <Reveal>
              <span className="inline-flex items-center gap-2 rounded-full border hairline px-3 py-1 text-xs font-mono text-[var(--text-tertiary)] mb-7">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--lime)" }} />
                Моніторинг працює прямо зараз
              </span>
            </Reveal>

            <Reveal delay={0.06}>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-[3.4rem] font-semibold leading-[1.08] tracking-tight text-[var(--text-primary)]">
                Сайт працює,
                <br />
                поки ви не дивитесь?
              </h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-md">
                Qorax стежить за швидкістю, безпекою та SEO вашого сайту
                щодня — і одразу каже, скільки грошей коштує кожна проблема.
              </p>
            </Reveal>

            <Reveal delay={0.18} className="mt-9" id="audit">
              <AuditForm />
              <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                Без реєстрації. Результат за 60 секунд.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.15} y={24}>
            <div className="rounded-3xl border hairline bg-[var(--bg-raised)] p-8 sm:p-10 flex flex-col items-center">
              <PulseWaveform />
              <div className="mt-8 w-full pt-6 border-t hairline flex items-center justify-between">
                <span className="text-xs text-[var(--text-tertiary)]">Останній скан</span>
                <span className="font-mono text-xs tabular text-[var(--text-secondary)]">
                  4 хв тому
                </span>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Pain section
// ============================================================

function PainSection() {
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <p className="font-mono text-xs text-[var(--text-tertiary)] mb-3 tracking-wide">
            ЩО ВІДБУВАЄТЬСЯ, КОЛИ НІХТО НЕ СЛІДКУЄ
          </p>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-xl leading-tight">
            Сайт зробили — і забули
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          <Reveal delay={0.06}>
            <PainCard
              metric="60% бізнесів"
              title="Закриваються після збою"
              description="Сайт ліг на ніч — клієнти пішли до конкурента. Власник дізнався про це через тиждень, з відгуку у Google."
              icon={<IconBolt />}
            />
          </Reveal>
          <Reveal delay={0.1}>
            <PainCard
              metric="−53% відвідувачів"
              title="Повільний сайт втрачає людей"
              description="Кожна зайва секунда завантаження — це частина клієнтів, які просто закрили вкладку, не дочекавшись."
              icon={<IconGauge />}
            />
          </Reveal>
          <Reveal delay={0.14}>
            <PainCard
              metric="43% атак"
              title="Спрямовані на малий бізнес"
              description="SSL спливає, плагіни застарівають, ніхто не оновлює — і сайт стає легкою ціллю."
              icon={<IconShield />}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

// ============================================================
// How it works
// ============================================================

function HowItWorksSection() {
  const steps = [
    {
      title: "Вводите адресу сайту",
      description: "Без встановлення коду, без доступу до хостингу. Просто URL.",
    },
    {
      title: "Qorax перевіряє все за раз",
      description:
        "Швидкість, SSL, домен, биті посилання, мобільну версію, SEO-теги — паралельно.",
    },
    {
      title: "Отримуєте план дій у грошах",
      description: "Не «виправте meta description», а «це коштує вам ~$140 на місяць».",
    },
  ];

  return (
    <section id="how" className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <p className="font-mono text-xs text-[var(--text-tertiary)] mb-3 tracking-wide">
            ЯК ЦЕ ПРАЦЮЄ
          </p>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-xl leading-tight">
            Три кроки до спокою
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-3 gap-x-10 gap-y-12">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={0.06 * i}>
              <div className="relative pl-0">
                <div
                  className="font-display text-5xl font-semibold mb-5"
                  style={{ color: i === 0 ? "var(--lime)" : i === 1 ? "var(--cyan)" : "var(--text-tertiary)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </div>
                <h3 className="font-display text-xl font-medium mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================
// Plans
// ============================================================

function PlansSection() {
  const plans = [
    {
      name: "Starter",
      price: "$49",
      tagline: "Один сайт, спокійний сон",
      features: [
        "Uptime моніторинг",
        "Швидкість + графік у часі",
        "SSL та домен — алерти",
        "Биті посилання",
        "AI-пояснення простою мовою",
        "PDF-звіт щомісяця",
      ],
      highlighted: false,
    },
    {
      name: "Growth",
      price: "$99",
      tagline: "Коли вже росте трафік",
      features: [
        "Все з Starter",
        "Core Web Vitals",
        "SEO: meta, schema, sitemap",
        "Google Search Console",
        "AI: вплив на дохід у $",
        "Моніторинг 1 конкурента",
        "Telegram-алерти",
        "Живий дашборд",
      ],
      highlighted: true,
    },
    {
      name: "Agency",
      price: "$199",
      tagline: "До 5 сайтів під одним дахом",
      features: [
        "Все з Growth, на 5 сайтів",
        "White-label звіти",
        "AI генерація текстів і SEO",
        "Конкуренти на кожен сайт",
        "Пріоритетна підтримка",
      ],
      highlighted: false,
    },
  ];

  return (
    <section id="plans" className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <p className="font-mono text-xs text-[var(--text-tertiary)] mb-3 tracking-wide">
            ТАРИФИ
          </p>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-xl leading-tight">
            У 3-10 разів дешевше за
            <br />
            найм підрядника
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-3 gap-5">
          {plans.map((plan, i) => (
            <Reveal key={plan.name} delay={0.06 * i}>
              <div
                className="rounded-2xl border p-7 sm:p-8 h-full flex flex-col"
                style={{
                  borderColor: plan.highlighted
                    ? "var(--cyan)"
                    : "var(--border-hairline)",
                  background: plan.highlighted ? "var(--bg-raised-2)" : "var(--bg-raised)",
                }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-display text-xl font-medium">{plan.name}</h3>
                  {plan.highlighted && (
                    <span
                      className="font-mono text-[10px] tracking-wide px-2 py-1 rounded-full"
                      style={{ background: "var(--cyan)", color: "#0c111d" }}
                    >
                      ПОПУЛЯРНИЙ
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-6">{plan.tagline}</p>
                <div className="font-mono text-3xl tabular mb-7">
                  {plan.price}
                  <span className="text-sm text-[var(--text-tertiary)] font-sans">/міс</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                      <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: "var(--text-tertiary)" }} />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
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

// ============================================================
// Footer
// ============================================================

function SiteFooter() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <QoraxLogo size="sm" />
        <p className="text-xs text-[var(--text-tertiary)]">
          © {new Date().getFullYear()} Qorax. Усі сайти заслуговують на турботу.
        </p>
      </div>
    </footer>
  );
}

// ============================================================
// Icons — minimal inline SVG, no icon library dependency for 3 icons
// ============================================================

function IconBolt() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconGauge() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 13l4-4M12 21a9 9 0 100-18 9 9 0 000 18z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconShield() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
