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
import type { Locale } from "@/app/lib/i18n";

/**
 * EcosystemSection — представляє п'ять продуктів бренду Qorax
 * (PRODUCT_VISION.md, розділ "П'ять продуктів екосистеми Qorax").
 * lang prop додано для EN-версії лендингу — назви продуктів
 * (Qorax Business/Mail/...) лишаються без перекладу (бренд), href
 * теж лишаються на укр-версії продуктових застосунків (лише
 * маркетингові сторінки перекладені наразі, самі продукти — ні).
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

const PRODUCTS: Record<Locale, Product[]> = {
  uk: [
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
  ],
  en: [
    {
      icon: Briefcase,
      name: "Qorax Business",
      tagline: "Run your business",
      description: "Monitoring, SEO, sites, CRM, and AI agents in one platform — live and working today.",
      href: "/login",
      accent: "lime",
      features: [
        { icon: ShieldCheck, name: "Audit — technical control" },
        { icon: Layout, name: "Sites — your web presence" },
        { icon: Sparkles, name: "AI — a smart assistant" },
        { icon: FileText, name: "Content — SEO content" },
        { icon: TrendingUp, name: "Rank — search rankings" },
        { icon: BarChart3, name: "Analytics — the full picture" },
      ],
    },
    {
      icon: Mail,
      name: "Qorax Mail",
      tagline: "Talk to your customers",
      description: "Business email, campaigns, and AI agents for correspondence — all in one place.",
      href: "/mail",
      accent: "cyan",
      features: [
        { icon: Inbox, name: "Mail and contacts" },
        { icon: Send, name: "Marketing and campaigns" },
        { icon: Bot, name: "AI agents for correspondence" },
      ],
    },
    {
      icon: Palette,
      name: "Qorax Creator",
      tagline: "Create your visuals",
      description: "Design, sites, decks, and banners on one infinite canvas with AI.",
      href: "/creator",
      accent: "purple",
      features: [
        { icon: LayoutTemplate, name: "Website Mode — sites on a board" },
        { icon: Network, name: "Diagram Mode — schemes and maps" },
        { icon: Blocks, name: "Components — blocks and Brand Kit" },
      ],
    },
    {
      icon: FileText,
      name: "Qorax Office",
      tagline: "Get documents done",
      description: "Docs, spreadsheets, and slides with AI that does the heavy lifting for you.",
      href: "/office",
      accent: "lime",
      features: [
        { icon: BookOpen, name: "Docs — editor with AI Writer" },
        { icon: Table2, name: "Sheets — tables and formulas" },
        { icon: Presentation, name: "Slides — decks built by AI" },
      ],
    },
    {
      icon: Globe,
      name: "Qorax Browser",
      tagline: "Explore the web",
      description: "A working browser that analyzes sites, collects ideas, and feeds them to the rest of the ecosystem.",
      href: "/browser",
      accent: "cyan",
      features: [
        { icon: Sparkles, name: "AI Sidebar — explains any site" },
        { icon: ScanSearch, name: "Site Inspector — SEO and tech stack" },
        { icon: FolderOpen, name: "Collections — references and ideas" },
      ],
    },
  ],
};

const COPY: Record<Locale, { badge: string; titleStart: string; titleGradient: string; subtitle: string; cta: string }> = {
  uk: { badge: "✦ ЕКОСИСТЕМА", titleStart: "П'ять продуктів. ", titleGradient: "Один бренд Qorax", subtitle: "Кожен продукт цінний окремо — і підсилює решту, коли ви використовуєте їх разом.", cta: "Перейти" },
  en: { badge: "✦ ECOSYSTEM", titleStart: "Five products. ", titleGradient: "One Qorax brand", subtitle: "Every product stands on its own — and gets stronger when you use them together.", cta: "Explore" },
};

export function EcosystemSection({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const products = PRODUCTS[lang];

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
              {t.badge}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-4xl sm:text-5xl lg:text-6xl font-semibold text-center max-w-3xl mx-auto leading-tight">
            {t.titleStart}
            <span className="gradient-text">{t.titleGradient}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-5 text-center text-base text-[var(--text-secondary)] max-w-xl mx-auto">
            {t.subtitle}
          </p>
        </Reveal>

        <div className="mt-14 space-y-5">
          {products.map((product, i) => {
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
                        {t.cta} <ArrowUpRight size={15} />
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
