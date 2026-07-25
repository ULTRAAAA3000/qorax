"use client";

import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

/**
 * HowItWorksSection — horizontal timeline with connected glow dots
 * and mini-mockup cards at each step.
 */

function StepUrlInput({ lang }: { lang: Locale }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <span className="font-mono text-sm text-[var(--text-primary)]">{lang === "uk" ? "вашсайт.com.ua" : "yoursite.com"}</span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--lime)] animate-pulse" />
      </div>
    </div>
  );
}

const SCAN_ITEMS: Record<Locale, string[]> = {
  uk: ["Швидкість", "SSL", "Биті посилання", "Мобільна версія", "SEO-теги"],
  en: ["Speed", "SSL", "Broken links", "Mobile version", "SEO tags"],
};

function StepScanning({ lang }: { lang: Locale }) {
  const items = SCAN_ITEMS[lang];
  return (
    <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      {items.map((item, i) => (
        <div key={item} className="flex items-center gap-2.5">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: i < 3 ? "var(--lime)" : "rgba(255, 255, 255, 0.12)" }}
          />
          <span className="text-xs text-[var(--text-secondary)]">{item}</span>
          {i < 3 && <span className="ml-auto font-mono text-[10px] text-[var(--lime)]">✓</span>}
        </div>
      ))}
    </div>
  );
}

function StepResults({ lang }: { lang: Locale }) {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-xs text-[var(--text-tertiary)]">{lang === "uk" ? "Орієнтовні втрати" : "Estimated loss"}</span>
        <span className="font-mono text-base tabular gradient-text font-semibold">
          −$140/{lang === "uk" ? "міс" : "mo"}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255, 255, 255, 0.06)" }}>
        <div
          className="h-full w-[68%] rounded-full"
          style={{ background: "linear-gradient(90deg, var(--lime), var(--cyan))" }}
        />
      </div>
    </div>
  );
}

const STEP_TEXT: Record<Locale, Array<{ title: string; description: string }>> = {
  uk: [
    { title: "Вводите адресу сайту", description: "Без встановлення коду, без доступу до хостингу. Просто URL." },
    { title: "Qorax перевіряє все за раз", description: "Швидкість, SSL, домен, биті посилання, мобільну версію, SEO-теги — паралельно." },
    { title: "Отримуєте план дій у грошах", description: "Не «виправте meta description», а «це коштує вам ~$140 на місяць»." },
  ],
  en: [
    { title: "Enter your site's URL", description: "No code to install, no hosting access needed. Just a URL." },
    { title: "Qorax checks everything at once", description: "Speed, SSL, domain, broken links, mobile version, SEO tags — all in parallel." },
    { title: "Get an action plan in dollars", description: "Not \u201Cfix the meta description\u201D — but \u201Cthis is costing you ~$140/month.\u201D" },
  ],
};

const ACCENTS = ["var(--lime)", "var(--cyan)", "var(--purple)"];

const COPY: Record<Locale, { badge: string; titleStart: string; titleGradient: string }> = {
  uk: { badge: "✦ ЯК ЦЕ ПРАЦЮЄ", titleStart: "Три кроки до ", titleGradient: "спокою" },
  en: { badge: "✦ HOW IT WORKS", titleStart: "Three steps to ", titleGradient: "peace of mind" },
};

export function HowItWorksSection({ lang = "uk" }: { lang?: Locale }) {
  const reduceMotion = useReducedMotion();
  const t = COPY[lang];
  const visuals = [<StepUrlInput key="url" lang={lang} />, <StepScanning key="scan" lang={lang} />, <StepResults key="results" lang={lang} />];
  const steps = STEP_TEXT[lang].map((s, i) => ({ ...s, visual: visuals[i], accent: ACCENTS[i] }));

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
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-xl mx-auto leading-tight">
            {t.titleStart}
            <span className="gradient-text">{t.titleGradient}</span>
          </h2>
        </Reveal>

        {/* Timeline connecting dots - visible on md+ */}
        <div className="hidden md:block relative mt-14 mb-2">
          <div className="absolute top-1/2 left-[16.67%] right-[16.67%] h-px" style={{ background: "linear-gradient(90deg, var(--lime), var(--cyan), var(--purple))", opacity: 0.3 }} />
          <div className="flex justify-between px-[calc(16.67%-6px)]">
            {steps.map((step, i) => (
              <div key={i} className="relative">
                <div className="h-3 w-3 rounded-full" style={{ background: step.accent, boxShadow: `0 0 12px ${step.accent}` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 md:mt-6 grid md:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <Reveal key={step.title} delay={0.06 * i}>
              <motion.div
                whileHover={reduceMotion ? undefined : { y: -4 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                className="glow-card p-6 h-full flex flex-col"
              >
                <div className="mb-5">{step.visual}</div>
                <span
                  className="font-mono text-xs mb-2 font-medium"
                  style={{ color: step.accent }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-lg font-medium mb-2 text-[var(--text-primary)]">
                  {step.title}
                </h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
