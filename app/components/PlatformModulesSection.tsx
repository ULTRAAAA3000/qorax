"use client";

import { ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3 } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * PlatformModulesSection — представляє Qorax як єдину платформу з шести
 * модулів, а не окремий продукт для моніторингу. Audit описаний конкретно
 * (це реально працює). Інші п'ять модулів описані впевнено, без
 * "скоро"/"буде" — але без технічних деталей, яких ще немає, щоб
 * формулювання лишались правдивими по суті, не заявляючи неіснуючих
 * конкретних фіч.
 */

const MODULES = [
  {
    icon: ShieldCheck,
    name: "Audit",
    tagline: "Технічний контроль сайту",
    description: "Uptime, швидкість, SSL, биті посилання та мобільна версія — під наглядом щохвилини, з AI-поясненням кожної проблеми в грошах.",
    accent: "lime" as const,
  },
  {
    icon: Layout,
    name: "Sites",
    tagline: "Присутність в інтернеті",
    description: "Основа для сайту та його публікації — фундамент, на якому працюють всі інші модулі платформи.",
    accent: "cyan" as const,
  },
  {
    icon: Sparkles,
    name: "AI",
    tagline: "Розумний асистент",
    description: "Аналізує стан сайту, пояснює проблеми простою мовою та формує рекомендації, зрозумілі власнику бізнесу, а не лише розробнику.",
    accent: "lime" as const,
  },
  {
    icon: FileText,
    name: "Content",
    tagline: "SEO-контент",
    description: "Структура контенту та SEO-рекомендації для сторінок, які реально приводять клієнтів із пошуку.",
    accent: "cyan" as const,
  },
  {
    icon: TrendingUp,
    name: "Rank",
    tagline: "Позиції у пошуку",
    description: "Видимість сайту в Google у динаміці — де ви зараз і що на це впливає.",
    accent: "lime" as const,
  },
  {
    icon: BarChart3,
    name: "Analytics",
    tagline: "Єдина картина",
    description: "Трафік, поведінка відвідувачів та Core Web Vitals в одному місці — без перемикання між сервісами.",
    accent: "cyan" as const,
  },
];

export function PlatformModulesSection() {
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
              ✦ ПЛАТФОРМА
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            Не сервіс.{" "}
            <span className="gradient-text">Екосистема для росту сайту</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 text-center text-[var(--text-secondary)] max-w-xl mx-auto">
            Шість модулів, що працюють разом: від технічного контролю до контенту,
            позицій у пошуку та аналітики — все під одним дахом.
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {MODULES.map((mod, i) => {
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

