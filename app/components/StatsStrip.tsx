"use client";

import { motion, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

/**
 * StatsStrip — key market metrics with gradient numbers
 * and subtle separator lines.
 */

const STATS: Record<Locale, Array<{ value: string; label: string }>> = {
  uk: [
    { value: "$4.06B", label: "ринок обслуговування сайтів у 2025" },
    { value: "61%", label: "компаній вже передають це на аутсорс" },
    { value: "43%", label: "кібератак спрямовані на малий бізнес" },
    { value: "3–10×", label: "дешевше за середній аутсорс ($500/міс)" },
  ],
  en: [
    { value: "$4.06B", label: "website maintenance market in 2025" },
    { value: "61%", label: "of companies already outsource this" },
    { value: "43%", label: "of cyberattacks target small business" },
    { value: "3–10×", label: "cheaper than the average agency ($500/mo)" },
  ],
};

export function StatsStrip({ lang = "uk" }: { lang?: Locale }) {
  const reduceMotion = useReducedMotion();
  const stats = STATS[lang];

  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-14 sm:py-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-6">
          {stats.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.05}>
              <motion.div
                className="relative"
                whileHover={reduceMotion ? undefined : { y: -2 }}
                transition={{ duration: 0.2 }}
              >
                <div className="font-mono text-2xl sm:text-3xl tabular font-semibold mb-1.5 gradient-text">
                  {stat.value}
                </div>
                <div className="text-xs sm:text-[13px] text-[var(--text-tertiary)] leading-snug max-w-[150px]">
                  {stat.label}
                </div>
              </motion.div>
            </Reveal>
          ))}
        </div>
      </div>
      <div className="gradient-divider" />
    </section>
  );
}
