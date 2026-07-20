"use client";

import { Briefcase, Mail, Palette, FileText, Globe, ArrowUpRight } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * EcosystemSection — представляє п'ять продуктів бренду Qorax
 * (PRODUCT_VISION.md, розділ "П'ять продуктів екосистеми Qorax").
 * На відміну від PlatformModulesSection (шість МОДУЛІВ всередині
 * Business), тут — п'ять окремих ПРОДУКТІВ, кожен зі своєю точкою
 * входу. Станом на липень 2026 усі п'ять мають робочий мінімальний
 * функціонал для залогінених користувачів (Business/dashboard,
 * Mail/MailApp, Creator/CreatorBoardsListUI, Office/
 * OfficeDocsListUI, Browser/BrowserUI) — усі позначені live: true.
 * Незалогінені відвідувачі одразу редиректяться на /login з /mail,
 * /office, /browser, /creator (той самий підхід, що вже мав /creator;
 * ProductComingSoon-заглушка прибрана звідти для незалогінених за
 * прямою вказівкою Артема — вона вводила в оману, ніби продукт "у
 * розробці", хоча код давно готовий, просто вимагав входу).
 */

const PRODUCTS = [
  {
    icon: Briefcase,
    name: "Qorax Business",
    tagline: "Керуйте бізнесом",
    description: "Моніторинг, SEO, сайти, CRM та AI-агенти в одній платформі — те, що вже працює сьогодні.",
    href: "/login",
    accent: "lime" as const,
    live: true,
  },
  {
    icon: Mail,
    name: "Qorax Mail",
    tagline: "Спілкуйтесь з клієнтами",
    description: "Корпоративна пошта, email-маркетинг та AI-агенти для листування — в одному місці.",
    href: "/mail",
    accent: "cyan" as const,
    live: true,
  },
  {
    icon: Palette,
    name: "Qorax Creator",
    tagline: "Створюйте візуали",
    description: "Дизайн, сайти, презентації та банери на одному нескінченному полотні з AI.",
    href: "/creator",
    accent: "purple" as const,
    live: true,
  },
  {
    icon: FileText,
    name: "Qorax Office",
    tagline: "Працюйте з документами",
    description: "Документи, таблиці й презентації з AI, що робить основну роботу за вас.",
    href: "/office",
    accent: "lime" as const,
    live: true,
  },
  {
    icon: Globe,
    name: "Qorax Browser",
    tagline: "Досліджуйте інтернет",
    description: "Робочий браузер: аналізує сайти, збирає ідеї та передає їх у решту екосистеми.",
    href: "/browser",
    accent: "cyan" as const,
    live: true,
  },
];

const ACCENT_COLORS = { lime: "var(--lime)", cyan: "var(--cyan)", purple: "#B98CF7" } as const;

export function EcosystemSection() {
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
              ✦ ЕКОСИСТЕМА
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            П&apos;ять продуктів.{" "}
            <span className="gradient-text">Один бренд Qorax</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 text-center text-[var(--text-secondary)] max-w-xl mx-auto">
            Кожен продукт цінний окремо — і підсилює решту, коли ви використовуєте їх разом.
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PRODUCTS.map((product, i) => {
            const color = ACCENT_COLORS[product.accent];
            return (
              <Reveal key={product.name} delay={Math.min(i * 0.05, 0.25)}>
                <a href={product.href} className="block h-full transition-transform hover:-translate-y-0.5">
                  <div className="glow-card p-6 h-full flex flex-col relative overflow-hidden">
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                        style={{ background: `${color}14`, border: `1px solid ${color}33` }}
                      >
                        <product.icon size={16} style={{ color }} strokeWidth={1.5} />
                      </div>
                      <div>
                        <h3 className="font-display text-base font-semibold leading-tight">{product.name}</h3>
                        <p className="text-[11px] font-mono" style={{ color }}>{product.tagline}</p>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed text-[var(--text-secondary)] flex-1">{product.description}</p>
                    <div className="mt-4 flex items-center gap-1.5 text-xs font-medium" style={{ color }}>
                      Перейти <ArrowUpRight size={13} />
                    </div>
                  </div>
                </a>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
