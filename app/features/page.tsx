import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";
import { FeatureBento } from "@/app/components/FeatureBento";
import { HowItWorksSection } from "@/app/components/HowItWorksSection";

export const metadata = { title: "Можливості — Qorax" };

const FEATURE_GROUPS = [
  {
    eyebrow: "МОНІТОРИНГ",
    accent: "lime" as const,
    title: "Завжди знаєте, що відбувається",
    description:
      "Uptime-перевірки кожні 5 хвилин, SSL-алерти за 30 і 7 днів до закінчення, автоматичне сповіщення на email і Telegram — ви дізнаєтесь про проблему раніше, ніж клієнт.",
    bullets: [
      "Uptime кожні 5 хвилин (Starter+)",
      "SSL: алерт за 30 і 7 днів до закінчення",
      "Інциденти з таймстемпом і тривалістю",
      "Email + Telegram сповіщення",
      "Живий дашборд з графіком відповіді",
    ],
  },
  {
    eyebrow: "ШВИДКІСТЬ",
    accent: "cyan" as const,
    title: "Швидкість — це не число, це графік",
    description:
      "Щоденні заміри часу відповіді та Core Web Vitals через Google PageSpeed Insights API. Через місяць видно чітку картину: де погіршується, де покращується.",
    bullets: [
      "Час відповіді — щоденно, зберігається 30 днів",
      "LCP, INP, CLS — мобіль та десктоп",
      "Performance Score за Google",
      "Кольорові індикатори за порогами Google",
      "Trend-графік прямо в дашборді",
    ],
  },
  {
    eyebrow: "SEO",
    accent: "lime" as const,
    title: "SEO без гадання",
    description:
      "Перевірка мета-тегів, H1, schema markup, sitemap.xml та robots.txt щодня. Конкретні проблеми — не абстрактні рекомендації.",
    bullets: [
      "Title, meta description — довжина та наявність",
      "H1: є / немає / більше одного",
      "Schema markup (JSON-LD, Microdata)",
      "sitemap.xml: знайдений, кількість URL",
      "robots.txt: знайдений, не блокує індексацію",
    ],
  },
  {
    eyebrow: "AI-АНАЛІЗ",
    accent: "cyan" as const,
    title: "Технічні проблеми у вигляді $",
    description:
      "Кожна знайдена проблема отримує AI-пояснення простою мовою та оцінку орієнтовних грошових втрат на місяць. Власник бізнесу розуміє, що виправити в першу чергу.",
    bullets: [
      "Пояснення без технічного жаргону",
      "Оцінка втрат у $ на місяць",
      "Пріоритизація за severity: critical / warning / info",
      "Рекомендація для кожного інсайту",
      "Qoraxus AI-чат для уточнень (Growth+)",
    ],
  },
  {
    eyebrow: "КОНКУРЕНТИ",
    accent: "lime" as const,
    title: "Знайте, коли конкурент щось змінив",
    description:
      "SHA-256 хеш-порівняння сторінок конкурентів. Коли вони оновлюють лендінг, змінюють ціни або запускають акцію — ви дізнаєтесь автоматично.",
    bullets: [
      "До 1 конкурента на Growth, більше на Agency",
      "Щоденна перевірка змін",
      "Email + Telegram при виявленні змін",
      "Таймстемп кожної зміни",
      "Не потребує доступу до сайту конкурента",
    ],
  },
  {
    eyebrow: "ЗВІТИ",
    accent: "cyan" as const,
    title: "PDF для клієнта — без роботи з вашого боку",
    description:
      "Щомісячний PDF-звіт генерується автоматично і надсилається на email. Для агентств — white-label з вашим логотипом і без згадки Qorax.",
    bullets: [
      "Автоматичний місячний PDF",
      "Uptime, швидкість, SEO, AI-інсайти",
      "White-label для Agency-плану",
      "Разовий аудит-звіт на запит",
      "Завантаження з дашборду в будь-який час",
    ],
  },
];

export default async function FeaturesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/features" />

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
              ✦ МОЖЛИВОСТІ
            </span>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight max-w-3xl mx-auto">
              Все що потрібно для{" "}
              <span className="gradient-text">здорового сайту</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-xl mx-auto leading-relaxed">
              Один сервіс замість п&apos;яти різних інструментів. Моніторинг, SEO, швидкість, конкуренти та AI-аналіз — все в одному дашборді.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="mt-8 flex items-center justify-center gap-4">
              <a
                href="/register"
                className="glow-button text-sm !py-2.5 !px-6"
              >
                Спробувати безкоштовно →
              </a>
              <a
                href="/#audit"
                className="ghost-button text-sm !py-2.5 !px-6"
              >
                Швидкий аудит
              </a>
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
      <FeatureBento />

      {/* How it works */}
      <HowItWorksSection />

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
              Готові побачити це в дії?
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="mt-4 text-[var(--text-secondary)] max-w-sm mx-auto">
              14 днів безкоштовно. Без кредитної картки.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <a href="/register" className="glow-button text-sm !py-3 !px-8 mt-8 inline-block">
              Почати тріал →
            </a>
          </Reveal>
        </div>
      </section>

      <SiteFooterExpanded />
    </main>
  );
}
