"use client";

import { ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3 } from "lucide-react";
import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

/**
 * PlatformModulesSection — представляє Qorax як єдину платформу з шести
 * модулів, а не окремий продукт для моніторингу. Audit описаний конкретно
 * (це реально працює). Інші п'ять модулів описані впевнено, без
 * "скоро"/"буде" — але без технічних деталей, яких ще немає, щоб
 * формулювання лишались правдивими по суті, не заявляючи неіснуючих
 * конкретних фіч.
 *
 * НЕ ІМПОРТУЄТЬСЯ в app/page.tsx з липня 2026 (Артем: продукти
 * губились серед секцій лендингу, тому цей вміст об'єднано в
 * EcosystemSection.tsx — шість модулів тепер показані як "що
 * всередині" картки Qorax Business, поруч з фічами інших чотирьох
 * продуктів, а не окрема секція нижче по сторінці). Файл лишено в
 * дереві на випадок, якщо знадобиться окрема сторінка "про Business"
 * у майбутньому — не видалено, щоб не губити готовий текст/копірайтинг.
 * Досі використовується на /features (і, з i18n-проходу, на /en/features).
 */

const MODULES: Record<Locale, Array<{ icon: typeof ShieldCheck; name: string; tagline: string; description: string; accent: "lime" | "cyan" }>> = {
  uk: [
    { icon: ShieldCheck, name: "Audit", tagline: "Технічний контроль сайту", description: "Uptime, швидкість, SSL, биті посилання та мобільна версія — під наглядом щохвилини, з AI-поясненням кожної проблеми в грошах.", accent: "lime" },
    { icon: Layout, name: "Sites", tagline: "Присутність в інтернеті", description: "Основа для сайту та його публікації — фундамент, на якому працюють всі інші модулі платформи.", accent: "cyan" },
    { icon: Sparkles, name: "AI", tagline: "Розумний асистент", description: "Аналізує стан сайту, пояснює проблеми простою мовою та формує рекомендації, зрозумілі власнику бізнесу, а не лише розробнику.", accent: "lime" },
    { icon: FileText, name: "Content", tagline: "SEO-контент", description: "Структура контенту та SEO-рекомендації для сторінок, які реально приводять клієнтів із пошуку.", accent: "cyan" },
    { icon: TrendingUp, name: "Rank", tagline: "Позиції у пошуку", description: "Видимість сайту в Google у динаміці — де ви зараз і що на це впливає.", accent: "lime" },
    { icon: BarChart3, name: "Analytics", tagline: "Єдина картина", description: "Трафік, поведінка відвідувачів та Core Web Vitals в одному місці — без перемикання між сервісами.", accent: "cyan" },
  ],
  en: [
    { icon: ShieldCheck, name: "Audit", tagline: "Technical site control", description: "Uptime, speed, SSL, broken links, and mobile version — watched every minute, with an AI explanation of every issue in dollars.", accent: "lime" },
    { icon: Layout, name: "Sites", tagline: "Your presence online", description: "The foundation for your site and its publishing — the base every other module in the platform builds on.", accent: "cyan" },
    { icon: Sparkles, name: "AI", tagline: "Smart assistant", description: "Analyzes site health, explains issues in plain language, and forms recommendations a business owner understands — not just a developer.", accent: "lime" },
    { icon: FileText, name: "Content", tagline: "SEO content", description: "Content structure and SEO recommendations for pages that actually bring in customers from search.", accent: "cyan" },
    { icon: TrendingUp, name: "Rank", tagline: "Search rankings", description: "Your site's visibility in Google over time — where you stand now and what's affecting it.", accent: "lime" },
    { icon: BarChart3, name: "Analytics", tagline: "One clear picture", description: "Traffic, visitor behavior, and Core Web Vitals in one place — no switching between services.", accent: "cyan" },
  ],
};

const COPY: Record<Locale, { badge: string; titlePrefix: string; titleGradient: string; subtitle: string }> = {
  uk: {
    badge: "✦ ПЛАТФОРМА",
    titlePrefix: "Не сервіс. ",
    titleGradient: "Екосистема для росту сайту",
    subtitle: "Шість модулів, що працюють разом: від технічного контролю до контенту, позицій у пошуку та аналітики — все під одним дахом.",
  },
  en: {
    badge: "✦ PLATFORM",
    titlePrefix: "Not a service. ",
    titleGradient: "An ecosystem for growing your site",
    subtitle: "Six modules working together: from technical control to content, search rankings, and analytics — all under one roof.",
  },
};

export function PlatformModulesSection({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const modules = MODULES[lang];
  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="text-center mb-4">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
            >
              {t.badge}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            {t.titlePrefix}
            <span className="gradient-text">{t.titleGradient}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 text-center text-[var(--text-secondary)] max-w-xl mx-auto">
            {t.subtitle}
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {modules.map((mod, i) => {
            const color = mod.accent === "lime" ? "var(--lime)" : "var(--cyan)";
            return (
              <Reveal key={mod.name} delay={Math.min(i * 0.05, 0.25)}>
                <div className="glow-card p-6 h-full flex flex-col">
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${color}14`, border: `1px solid ${color}33` }}
                    >
                      <mod.icon size={16} style={{ color }} strokeWidth={1.5} />
                    </div>
                    <div>
                      <h3 className="font-display text-base font-semibold leading-tight">{mod.name}</h3>
                      <p className="text-[11px] font-mono" style={{ color }}>{mod.tagline}</p>
                    </div>
                  </div>
                  <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{mod.description}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}


