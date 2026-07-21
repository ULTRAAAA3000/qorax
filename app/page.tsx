import { Reveal } from "./components/Reveal";
import { AuditForm } from "./components/AuditForm";
import { LiveMonitorPanel } from "./components/LiveMonitorPanel";
import { AiInsightPreview } from "./components/AiInsightPreview";
import { SpeedTrendPreview } from "./components/SpeedTrendPreview";
import { TelegramPreview } from "./components/TelegramPreview";
import { HeroAtmosphere } from "./components/HeroAtmosphere";
import { HeroGlassCubeLazy as HeroGlassCube } from "./components/HeroGlassCubeLazy";
import { StatsStrip } from "./components/StatsStrip";
import { FeatureBento } from "./components/FeatureBento";
import { EcosystemSection } from "./components/EcosystemSection";
import { HowItWorksSection } from "./components/HowItWorksSection";
import { FaqSection } from "./components/FaqSection";
import { SiteFooterExpanded } from "./components/SiteFooterExpanded";
import { MarketingHeader } from "./components/MarketingHeader";
import { ProductDivider } from "./components/ProductDivider";
import { MailInboxPreview } from "./components/MailInboxPreview";
import { MailAiAgentPreview } from "./components/MailAiAgentPreview";
import { CreatorCanvasPreview } from "./components/CreatorCanvasPreview";
import { CreatorBrandKitPreview } from "./components/CreatorBrandKitPreview";
import { OfficeDocsPreview } from "./components/OfficeDocsPreview";
import { OfficeSheetsSlidesPreview } from "./components/OfficeSheetsSlidesPreview";
import { BrowserInspectorPreview } from "./components/BrowserInspectorPreview";
import { BrowserCollectionsPreview } from "./components/BrowserCollectionsPreview";
import { createClient } from "./lib/supabase/server";
import { CHECKOUT_DISABLED } from "./lib/checkoutFlag";
import { Briefcase, Mail, Palette, FileText, Globe } from "lucide-react";

// LemonSqueezy checkout URLs
const LS_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qoraxus";
const LS_VARIANTS: Record<string, string> = {
  Starter: process.env.LS_VARIANT_STARTER ?? "",
  Growth:  process.env.LS_VARIANT_GROWTH  ?? "",
  Agency:  process.env.LS_VARIANT_AGENCY  ?? "",
};
function lsCheckoutUrl(plan: string): string {
  const vid = LS_VARIANTS[plan];
  return vid
    ? `https://${LS_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${vid}`
    : `/register?plan=${plan.toLowerCase()}`;
}

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

  const starterUrl = checkoutUrl("Starter");
  const growthUrl = checkoutUrl("Growth");
  const agencyUrl = checkoutUrl("Agency");

  return (
    <main className="flex flex-col">
      <MarketingHeader isLoggedIn={!!user} />
      <Hero />
      <StatsStrip />
      <EcosystemSection />

      <ProductDivider
        icon={Briefcase}
        productName="Qorax Business"
        tagline="Керуйте бізнесом онлайн"
        href="/login"
        accent="lime"
      />

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
      <PlansSection starterUrl={starterUrl} growthUrl={growthUrl} agencyUrl={agencyUrl} />
      <FaqSection />

      {/* ============================================================
          Qorax Mail
          ============================================================ */}
      <ProductDivider
        icon={Mail}
        productName="Qorax Mail"
        tagline="Спілкуйтесь з клієнтами"
        href="/mail"
        accent="cyan"
      />

      <ProductSection
        eyebrow="СПІЛЬНА ПОШТА"
        title="Вся команда в одних вхідних"
        description="Корпоративна пошта і контакти клієнтів в одному робочому просторі — без перемикання між Gmail, нотатками і CRM."
        align="right"
        accent="cyan"
      >
        <MailInboxPreview />
      </ProductSection>

      <ProductSection
        eyebrow="AI-АГЕНТИ"
        title="Відповідь клієнту — за один клік, не за 10 хвилин"
        description="AI готує чернетку листа на основі попереднього листування й тону вашого бренду. Ви лише перевіряєте й надсилаєте."
        align="left"
        accent="cyan"
      >
        <MailAiAgentPreview />
      </ProductSection>

      {/* ============================================================
          Qorax Creator
          ============================================================ */}
      <ProductDivider
        icon={Palette}
        productName="Qorax Creator"
        tagline="Створюйте візуали"
        href="/creator"
        accent="purple"
      />

      <ProductSection
        eyebrow="НЕСКІНЧЕННЕ ПОЛОТНО"
        title="Сайти, презентації й банери — на одній дошці"
        description="Website Mode вбудовує Sites-редактор прямо в канвас. Перетягуйте блоки, компонуйте макет, бачите весь проєкт одразу."
        align="right"
        accent="purple"
      >
        <CreatorCanvasPreview />
      </ProductSection>

      <ProductSection
        eyebrow="BRAND KIT"
        title="Один бренд — усюди однаковий"
        description="Кольори, шрифти й готові компоненти застосовуються миттєво на будь-якій дошці — жодного ручного підбору щоразу."
        align="left"
        accent="purple"
      >
        <CreatorBrandKitPreview />
      </ProductSection>

      {/* ============================================================
          Qorax Office
          ============================================================ */}
      <ProductDivider
        icon={FileText}
        productName="Qorax Office"
        tagline="Працюйте з документами"
        href="/office"
        accent="lime"
      />

      <ProductSection
        eyebrow="DOCS"
        title="AI Writer сам збирає готовий текст"
        description="Документи з форматуванням, таблицями й AI-помічником, що пише за вас — не аналог Word, а той, хто робить основну роботу."
        align="right"
        accent="lime"
      >
        <OfficeDocsPreview />
      </ProductSection>

      <ProductSection
        eyebrow="SHEETS ТА SLIDES"
        title="Таблиці з формулами. Презентації за описом"
        description="Прості таблиці з SUM/AVERAGE/COUNT та CSV-імпортом. Презентації, де AI сам будує структуру — від слайда до готового виступу."
        align="left"
        accent="lime"
      >
        <OfficeSheetsSlidesPreview />
      </ProductSection>

      {/* ============================================================
          Qorax Browser
          ============================================================ */}
      <ProductDivider
        icon={Globe}
        productName="Qorax Browser"
        tagline="Досліджуйте інтернет"
        href="/browser"
        accent="cyan"
      />

      <ProductSection
        eyebrow="AI SIDEBAR"
        title="AI пояснює будь-який сайт за клік"
        description="Site Inspector показує технології, кольори, шрифти, SEO та швидкість конкурента — а AI Sidebar одразу пояснює, що це означає."
        align="right"
        accent="cyan"
      >
        <BrowserInspectorPreview />
      </ProductSection>

      <ProductSection
        eyebrow="COLLECTIONS"
        title="Конкуренти й ідеї в одному місці — не в закладках"
        description="Збирайте референси просто під час перегляду сайтів і передавайте їх у Creator чи Office одним кліком через Smart Capture."
        align="left"
        accent="cyan"
      >
        <BrowserCollectionsPreview />
      </ProductSection>

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
              Business · Mail · Creator · Office · Browser — один бренд
            </span>
          </Reveal>

          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold leading-[1.05] tracking-tight">
              Екосистема
              <br />
              <span className="gradient-text">для ведення бізнесу онлайн</span>
            </h1>
          </Reveal>

          <Reveal delay={0.12}>
            <p className="mt-6 text-lg sm:text-xl text-[var(--text-secondary)] leading-relaxed max-w-xl mx-auto">
              П&apos;ять продуктів під одним дахом: моніторинг сайту, пошта, візуальний
              редактор, документи та власний браузер — з AI у кожному.
            </p>
          </Reveal>
        </div>

        {/* Product preview with glow */}
        <Reveal delay={0.25} y={30}>
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

        {/* Audit CTA — конкретна точка конверсії Qorax Business,
            навмисно нижче загального позиціювання екосистеми, але
            все ще на першому екрані — головний безкоштовний вхід не
            можна губити глибше в скролі. */}
        <Reveal delay={0.3} className="mt-14 sm:mt-16" id="audit">
          <div className="max-w-xl mx-auto text-center">
            <p className="text-sm text-[var(--text-tertiary)] mb-5">
              Хочете почати з безкоштовної перевірки сайту?
            </p>
            <div className="flex justify-center">
              <AuditForm />
            </div>
            <p className="mt-3 text-xs text-[var(--text-tertiary)]">
              Без реєстрації. Результат за 60 секунд.
            </p>
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

function PlansSection({ starterUrl, growthUrl, agencyUrl }: { starterUrl: string; growthUrl: string; agencyUrl: string }) {
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
              checkoutUrl={starterUrl}
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
              checkoutUrl={growthUrl}
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
              checkoutUrl={agencyUrl}
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
