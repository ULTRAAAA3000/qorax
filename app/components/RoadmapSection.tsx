"use client";

import { Layout, Sparkles, FileText, TrendingUp, BarChart3 } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * RoadmapSection — чесний, короткий анонс майбутніх модулів платформи
 * (з product vision: Sites, AI, Content, Rank, Analytics). Без обіцянок
 * дат — тільки напрямок, щоб показати перспективу тим, хто оцінює
 * Qorax як довгострокового партнера, а не одноразовий інструмент.
 */

const UPCOMING = [
  {
    icon: Layout,
    label: "Sites",
    description: "SEO-first конструктор сайтів із вбудованою публікацією",
  },
  {
    icon: Sparkles,
    label: "AI",
    description: "Генерація текстів, meta-тегів та FAQ під ваш бізнес",
  },
  {
    icon: FileText,
    label: "Content",
    description: "AI-контент-план та SEO-статті на автопілоті",
  },
  {
    icon: TrendingUp,
    label: "Rank",
    description: "Позиції у пошуку в динаміці, з історією та алертами",
  },
  {
    icon: BarChart3,
    label: "Analytics",
    description: "Єдина аналітика: трафік, конверсії, Core Web Vitals",
  },
];

export function RoadmapSection() {
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
              ✦ ЩО ДАЛІ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            Qorax росте в{" "}
            <span className="gradient-text">повноцінну платформу</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 text-center text-[var(--text-secondary)] max-w-lg mx-auto">
            Аудит і моніторинг — тільки перший модуль. Далі — конструктор сайтів,
            AI-контент та повна SEO-аналітика під одним дахом.
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {UPCOMING.map((item, i) => (
            <Reveal key={item.label} delay={Math.min(i * 0.05, 0.25)}>
              <div className="glow-card p-5 h-full flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <item.icon size={18} strokeWidth={1.5} className="text-[var(--cyan)] opacity-70" />
                  <span
                    className="font-mono text-[9px] tracking-wide px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(140,246,255,0.08)", color: "var(--cyan)", border: "1px solid rgba(140,246,255,0.15)" }}
                  >
                    СКОРО
                  </span>
                </div>
                <div>
                  <h3 className="font-display text-sm font-medium mb-1">{item.label}</h3>
                  <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{item.description}</p>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
