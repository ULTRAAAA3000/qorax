"use client";

import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";

/**
 * HowItWorksSection — three real interface states in sequence (URL input
 * → scanning → results), not abstract numbered steps. Each mini-mockup
 * is a believable UI fragment, continuing the "show the product" rule
 * used throughout the page.
 */

function StepUrlInput() {
  return (
    <div className="rounded-xl border hairline bg-[var(--bg-raised-2)] p-4">
      <div className="flex items-center gap-2 rounded-lg border hairline bg-[var(--bg)] px-3 py-2.5">
        <span className="font-mono text-sm text-[var(--text-primary)]">вашсайт.com.ua</span>
        <span className="ml-auto h-1.5 w-1.5 rounded-full bg-[var(--text-tertiary)] animate-pulse" />
      </div>
    </div>
  );
}

function StepScanning() {
  const items = ["Швидкість", "SSL", "Биті посилання", "Мобільна версія", "SEO-теги"];
  return (
    <div className="rounded-xl border hairline bg-[var(--bg-raised-2)] p-4 space-y-2">
      {items.map((item, i) => (
        <div key={item} className="flex items-center gap-2.5">
          <span
            className="h-1.5 w-1.5 rounded-full shrink-0"
            style={{ background: i < 3 ? "var(--lime)" : "var(--border-hairline-strong)" }}
          />
          <span className="text-xs text-[var(--text-secondary)]">{item}</span>
        </div>
      ))}
    </div>
  );
}

function StepResults() {
  return (
    <div className="rounded-xl border hairline bg-[var(--bg-raised-2)] p-4">
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-xs text-[var(--text-tertiary)]">Орієнтовні втрати</span>
        <span className="font-mono text-base tabular" style={{ color: "var(--lime)" }}>
          −$140/міс
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg)] overflow-hidden">
        <div className="h-full w-[68%] rounded-full" style={{ background: "var(--cyan)" }} />
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Вводите адресу сайту",
    description: "Без встановлення коду, без доступу до хостингу. Просто URL.",
    visual: <StepUrlInput />,
  },
  {
    title: "Qorax перевіряє все за раз",
    description: "Швидкість, SSL, домен, биті посилання, мобільну версію, SEO-теги — паралельно.",
    visual: <StepScanning />,
  },
  {
    title: "Отримуєте план дій у грошах",
    description: "Не «виправте meta description», а «це коштує вам ~$140 на місяць».",
    visual: <StepResults />,
  },
];

export function HowItWorksSection() {
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="flex items-baseline gap-3 mb-5">
            <span className="font-mono text-sm text-[var(--text-tertiary)]">05</span>
            <span className="font-mono text-xs tracking-wide text-[var(--text-tertiary)]">
              ЯК ЦЕ ПРАЦЮЄ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-xl leading-tight">
            Три кроки до спокою
          </h2>
        </Reveal>

        <div className="mt-14 grid md:grid-cols-3 gap-6">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={0.06 * i}>
              <motion.div
                whileHover={reduceMotion ? undefined : { y: -3 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border hairline bg-[var(--bg-raised)] p-6 h-full flex flex-col"
              >
                <div className="mb-5">{step.visual}</div>
                <span
                  className="font-mono text-xs mb-2"
                  style={{ color: i === 0 ? "var(--lime)" : i === 1 ? "var(--cyan)" : "var(--text-tertiary)" }}
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
