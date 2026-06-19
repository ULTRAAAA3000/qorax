"use client";

import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";

/**
 * HowItWorksSection — horizontal timeline with connected glow dots
 * and mini-mockup cards at each step.
 */

function StepUrlInput() {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
        <span className="font-mono text-sm text-[var(--text-primary)]">вашсайт.com.ua</span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--lime)] animate-pulse" />
      </div>
    </div>
  );
}

function StepScanning() {
  const items = ["Швидкість", "SSL", "Биті посилання", "Мобільна версія", "SEO-теги"];
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

function StepResults() {
  return (
    <div className="rounded-xl p-4" style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.06)" }}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-xs text-[var(--text-tertiary)]">Орієнтовні втрати</span>
        <span className="font-mono text-base tabular gradient-text font-semibold">
          −$140/міс
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

const STEPS = [
  {
    title: "Вводите адресу сайту",
    description: "Без встановлення коду, без доступу до хостингу. Просто URL.",
    visual: <StepUrlInput />,
    accent: "var(--lime)",
  },
  {
    title: "Qorax перевіряє все за раз",
    description: "Швидкість, SSL, домен, биті посилання, мобільну версію, SEO-теги — паралельно.",
    visual: <StepScanning />,
    accent: "var(--cyan)",
  },
  {
    title: "Отримуєте план дій у грошах",
    description: "Не «виправте meta description», а «це коштує вам ~$140 на місяць».",
    visual: <StepResults />,
    accent: "var(--purple)",
  },
];

export function HowItWorksSection() {
  const reduceMotion = useReducedMotion();

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
              ✦ ЯК ЦЕ ПРАЦЮЄ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-xl mx-auto leading-tight">
            Три кроки до{" "}
            <span className="gradient-text">спокою</span>
          </h2>
        </Reveal>

        {/* Timeline connecting dots - visible on md+ */}
        <div className="hidden md:block relative mt-14 mb-2">
          <div className="absolute top-1/2 left-[16.67%] right-[16.67%] h-px" style={{ background: "linear-gradient(90deg, var(--lime), var(--cyan), var(--purple))", opacity: 0.3 }} />
          <div className="flex justify-between px-[calc(16.67%-6px)]">
            {STEPS.map((step, i) => (
              <div key={i} className="relative">
                <div className="h-3 w-3 rounded-full" style={{ background: step.accent, boxShadow: `0 0 12px ${step.accent}` }} />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 md:mt-6 grid md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
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
