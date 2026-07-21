"use client";

import {
  Briefcase, Mail, Palette, FileText, Globe, ArrowUpRight,
  ShieldCheck, Layout, Sparkles, TrendingUp, BarChart3,
  Inbox, Send, Bot,
  LayoutTemplate, Network, Blocks,
  BookOpen, Table2, Presentation,
  ScanSearch, FolderOpen,
} from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * EcosystemSection — представляє п'ять продуктів бренду Qorax
 * (PRODUCT_VISION.md, розділ "П'ять продуктів екосистеми Qorax").
 *
 * Артем (липень 2026): продукти губились серед решти секцій лендингу
 * — виглядали як "ще один звичайний розділ", хоча це найважливіша
 * структурна ідея бренду ("один бренд, п'ять продуктів"), яку не
 * можна пропустити скролячи. Тому цей прохід:
 * 1) Перенесено секцію одразу під Hero/StatsStrip (раніше йшла після
 *    трьох ProductSection і FeatureBento — глибоко в скролі).
 * 2) Візуально важче за сусідні секції: великі картки на всю ширину
 *    (не дрібний grid 1/3 екрана кожна), кожен продукт розкриває, що
 *    саме в ньому є (список фіч з іконками) — не просто назва +
 *    один рядок опису, як було.
 * 3. Об'єднано з колишньою PlatformModulesSection: шість модулів
 *    Business (Audit/Sites/AI/Content/Rank/Analytics) тепер не окрема
 *    секція нижче по сторінці, а "що всередині" картки Business —
 *    той самий рівень деталізації, що фічі інших чотирьох продуктів.
 *    PlatformModulesSection.tsx лишається в дереві файлів (щоб не
 *    ламати git-історію), але вже не імпортується в app/page.tsx.
 *
 * Дизайн лишається в межах Cyber Minimal — той самий glow-card,
 * gradient-text, gradient-divider, --lime/--cyan/--purple акценти,
 * що й решта лендингу; "вагу" додає розмір і структура карток, не
 * нова візуальна мова.
 */

const ACCENT_COLORS = { lime: "var(--lime)", cyan: "var(--cyan)", purple: "#B98CF7" } as const;

interface Feature {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  name: string;
}

interface Product {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  name: string;
  tagline: string;
  description: string;
  href: string;
  accent: keyof typeof ACCENT_COLORS;
  features: Feature[];
}

const PRODUCTS: Product[] = [
  {
    icon: Briefcase,
    name: "Qorax Business",
    tagline: "Керуйте бізнесом",
    description: "Моніторинг, SEO, сайти, CRM та AI-агенти в одній платформі — те, що вже працює сьогодні.",
    href: "/login",
    accent: "lime",
    features: [
      { icon: ShieldCheck, name: "Audit — технічний контроль" },
      { icon: Layout, name: "Sites — присутність в інтернеті" },
      { icon: Sparkles, name: "AI — розумний асистент" },
      { icon: FileText, name: "Content — SEO-контент" },
      { icon: TrendingUp, name: "Rank — позиції у пошуку" },
      { icon: BarChart3, name: "Analytics — єдина картина" },
    ],
  },
  {
    icon: Mail,
    name: "Qorax Mail",
    tagline: "Спілкуйтесь з клієнтами",
    description: "Корпоративна пошта, email-маркетинг та AI-агенти для листування — в одному місці.",
    href: "/mail",
    accent: "cyan",
    features: [
      { icon: Inbox, name: "Пошта та контакти" },
      { icon: Send, name: "Маркетинг і кампанії" },
      { icon: Bot, name: "AI-агенти листування" },
    ],
  },
  {
    icon: Palette,
    name: "Qorax Creator",
    tagline: "Створюйте візуали",
    description: "Дизайн, сайти, презентації та банери на одному нескінченному полотні з AI.",
    href: "/creator",
    accent: "purple",
    features: [
      { icon: LayoutTemplate, name: "Website Mode — сайти на дошці" },
      { icon: Network, name: "Diagram Mode — схеми і карти" },
      { icon: Blocks, name: "Компоненти — блоки й Brand Kit" },
    ],
  },
  {
    icon: FileText,
    name: "Qorax Office",
    tagline: "Працюйте з документами",
    description: "Документи, таблиці й презентації з AI, що робить основну роботу за вас.",
    href: "/office",
    accent: "lime",
    features: [
      { icon: BookOpen, name: "Docs — редактор з AI Writer" },
      { icon: Table2, name: "Sheets — таблиці та формули" },
      { icon: Presentation, name: "Slides — презентації з AI" },
    ],
  },
  {
    icon: Globe,
    name: "Qorax Browser",
    tagline: "Досліджуйте інтернет",
    description: "Робочий браузер: аналізує сайти, збирає ідеї та передає їх у решту екосистеми.",
    href: "/browser",
    accent: "cyan",
    features: [
      { icon: Sparkles, name: "AI Sidebar — пояснює будь-який сайт" },
      { icon: ScanSearch, name: "Site Inspector — SEO і технології" },
      { icon: FolderOpen, name: "Collections — референси та ідеї" },
    ],
  },
];

export function EcosystemSection() {
  return (
    <section className="relative" style={{ background: "rgba(255,255,255,0.015)" }}>
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-28">
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
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-center max-w-3xl mx-auto leading-tight">
            П&apos;ять продуктів.{" "}
            <span className="gradient-text">Один бренд Qorax</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-5 text-center text-base text-[var(--text-secondary)] max-w-xl mx-auto">
            Кожен продукт цінний окремо — і підсилює решту, коли ви використовуєте їх разом.
          </p>
        </Reveal>

        <div className="mt-14 space-y-5">
          {PRODUCTS.map((product, i) => {
            const color = ACCENT_COLORS[product.accent];
            return (
              <Reveal key={product.name} delay={Math.min(i * 0.05, 0.2)}>
                <a href={product.href} className="block group">
                  <div
                    className="glow-card p-7 sm:p-9 grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-6 md:gap-10 items-center"
                    style={{ boxShadow: `0 0 0 1px ${color}14 inset` }}
                  >
                    {/* Ліва частина — назва, опис, CTA */}
                    <div>
                      <div className="flex items-center gap-3.5 mb-4">
                        <div
                          className="h-12 w-12 rounded-2xl flex items-center justify-center shrink-0"
                          style={{ background: `${color}14`, border: `1px solid ${color}33` }}
                        >
                          <product.icon size={22} style={{ color }} strokeWidth={1.5} />
                        </div>
                        <div>
                          <h3 className="font-display text-xl sm:text-2xl font-semibold leading-tight">{product.name}</h3>
                          <p className="text-xs font-mono mt-0.5" style={{ color }}>{product.tagline}</p>
                        </div>
                      </div>
                      <p className="text-sm sm:text-[15px] leading-relaxed text-[var(--text-secondary)]">
                        {product.description}
                      </p>
                      <div
                        className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium transition-transform group-hover:translate-x-0.5"
                        style={{ color }}
                      >
                        Перейти <ArrowUpRight size={15} />
                      </div>
                    </div>

                    {/* Права частина — що всередині продукту */}
                    <div
                      className="rounded-2xl p-4 sm:p-5 space-y-1"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
                    >
                      {product.features.map((f) => (
                        <div key={f.name} className="flex items-center gap-2.5 py-1.5">
                          <f.icon size={14} style={{ color }} strokeWidth={1.75} />
                          <span className="text-[13px] sm:text-sm text-[var(--text-secondary)]">{f.name}</span>
                        </div>
                      ))}
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
