import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";

export const metadata = { title: "Про нас — Qorax" };

const TEAM = [
  {
    name: "Артем Коваль",
    role: "Co-founder & CEO",
    bio: "10+ років у веб-розробці та digital-агентствах. Запустив Qorax після того, як клієнтський інтернет-магазин провисів 4 години непоміченим — і втратив суму, порівнянну з місячним бюджетом на рекламу.",
    initials: "АК",
    accent: "lime",
  },
  {
    name: "Дарія Литвин",
    role: "Co-founder & CTO",
    bio: "Архітектор розподілених систем. До Qorax будувала моніторинг-інфраструктуру для фінтех-стартапів у Берліні. Відповідає за надійність: сервіс не може моніторити чужі сайти і падати сам.",
    initials: "ДЛ",
    accent: "cyan",
  },
  {
    name: "Максим Бондар",
    role: "Head of Product",
    bio: "Колишній продакт у SaaS B2B. Провів понад 200 інтерв'ю з власниками малого бізнесу та агентствами. Саме він наполіг на Revenue Impact — перекладати технічні проблеми в $ замість «виправте title tag».",
    initials: "МБ",
    accent: "lime",
  },
  {
    name: "Олена Руденко",
    role: "Growth & Partnerships",
    bio: "Займається партнерствами з агентствами та фрілансерами по всій Україні. До Qorax — CMO в кількох SaaS-компаніях. Вважає, що найкращий маркетинг — це коли продукт пояснює сам себе.",
    initials: "ОР",
    accent: "cyan",
  },
];

const VALUES = [
  {
    icon: "⚡",
    title: "Простота перш за все",
    description:
      "Технічний звіт, який власник бізнесу не розуміє — марна трата часу. Кожна метрика в Qorax пояснюється простою мовою і має прив'язку до грошей.",
  },
  {
    icon: "🛡",
    title: "Надійність без компромісів",
    description:
      "Ми не можемо моніторити чужі сайти і самі падати. Наша інфраструктура розрахована на 99.9% uptime — і ми виміряємо кожну хвилину.",
  },
  {
    icon: "🇺🇦",
    title: "Зроблено в Україні",
    description:
      "Команда розподілена між Києвом, Дніпром і Львовом. Ми будуємо глобальний продукт з України — і пишаємось цим.",
  },
  {
    icon: "🔄",
    title: "Ітерації, не перфекціонізм",
    description:
      "Щотижневі релізи, зворотний зв'язок від реальних клієнтів, швидкі виправлення. Ми не чекаємо ідеального моменту — будуємо і покращуємо.",
  },
];

export default async function AboutPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/about" />

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
                ✦ ПРО КОМАНДУ
              </span>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
                Ми самі були{" "}
                <span className="gradient-text">по той бік проблеми</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="mt-6 text-lg text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Qorax з&apos;явився з реального болю: сайт клієнта провисів чотири години — і ніхто не помітив. Ні власник, ні агентство. Перший дізнався покупець, який залишив гнівний відгук.
              </p>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mt-4 text-[var(--text-secondary)] leading-relaxed max-w-xl">
                Тоді ми вирішили зробити інструмент, який робить те, що мав робити хтось зі сторони: стежити, помічати, попереджати — і пояснювати людською мовою, скільки це коштує.
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
              { value: "2023", label: "Рік заснування" },
              { value: "4", label: "Людини в команді" },
              { value: "🇺🇦", label: "Команда з України" },
              { value: "$0", label: "Зовнішнє фінансування" },
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
                  ✦ КУДИ МИ ЙДЕМО
                </span>
              </Reveal>
              <Reveal delay={0.04}>
                <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
                  Від інструмента —{" "}
                  <span className="gradient-text">до екосистеми</span>
                </h2>
              </Reveal>
            </div>
            <div>
              <Reveal delay={0.06}>
                <p className="text-[var(--text-secondary)] leading-relaxed">
                  Моніторинг був лише першим кроком. Ми будуємо Qorax як платформу, де бізнес
                  проходить весь шлях в одному місці: створює присутність в інтернеті, контролює
                  її технічний стан, отримує AI-допомогу з контентом, бачить свої позиції в
                  пошуку і розуміє, звідки приходять клієнти — без перемикання між п&apos;ятьма
                  різними сервісами.
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <p className="mt-4 text-[var(--text-secondary)] leading-relaxed">
                  Audit — моніторинг, швидкість, SEO та AI-аналіз — вже працює і саме ним
                  користуються наші перші клієнти сьогодні. Sites, AI, Content, Rank та Analytics —
                  модулі, які ми активно будуємо просто зараз, крок за кроком, разом із
                  людьми, які вже з нами.
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
                ✦ КОМАНДА
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.04}>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold mb-12">
              Хто будує Qorax
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
                ✦ ЦІННОСТІ
              </span>
            </div>
          </Reveal>
          <Reveal delay={0.04}>
            <h2 className="font-display text-3xl sm:text-4xl font-semibold mb-12">
              Що для нас важливо
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
                  Зв&apos;яжіться з нами
                </h2>
                <p className="text-[var(--text-secondary)] mb-6 leading-relaxed text-sm max-w-sm">
                  Є питання, ідея чи хочете партнерство? Пишіть напряму — ми відповідаємо протягом одного робочого дня.
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
                  <p className="font-mono text-xs text-[var(--lime)] mb-3">14 ДНІВ БЕЗКОШТОВНО</p>
                  <h3 className="font-display text-xl font-semibold mb-2">
                    Спробуйте Qorax самі
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                    Без кредитної картки. Повний доступ на 14 днів — побачите всі можливості перш ніж вирішувати.
                  </p>
                </div>
                <a
                  href="/register"
                  className="glow-button text-sm !py-2.5 text-center mt-6 block"
                >
                  Розпочати тріал →
                </a>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <SiteFooterExpanded />
    </main>
  );
}
