"use client";

/**
 * PulseWaveform — signature element of the page.
 *
 * Echoes the logo's bar pattern, but reinterpreted as a living signal: each bar
 * height maps to a (simulated) health metric — uptime, speed, SSL, links, mobile —
 * and the whole row gently breathes to suggest "something is being watched right now."
 *
 * Motion is on the OBJECT, not the page: bars animate in place, the page never moves.
 * This keeps body text perfectly readable while giving the hero one deliberate,
 * justified piece of motion (purpose: explanation + ambient atmosphere, per design system).
 */

import { motion, useReducedMotion } from "motion/react";

type Bar = {
  id: string;
  label: string;
  baseHeight: number; // 0-1, relative height
  color: string;
};

const BARS: Bar[] = [
  { id: "uptime", label: "Uptime", baseHeight: 0.45, color: "var(--lime)" },
  { id: "speed", label: "Швидкість", baseHeight: 0.68, color: "var(--bar-2)" },
  { id: "ssl", label: "SSL", baseHeight: 1, color: "var(--cyan)" },
  { id: "links", label: "Посилання", baseHeight: 0.82, color: "var(--text-primary)" },
  { id: "mobile", label: "Мобільна версія", baseHeight: 0.3, color: "var(--text-tertiary)" },
];

export function PulseWaveform({ className = "" }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={`flex items-end gap-3 sm:gap-4 ${className}`}
      role="img"
      aria-label="Живий індикатор стану сайту: uptime, швидкість, SSL, посилання, мобільна версія — усе в нормі"
    >
      {BARS.map((bar, i) => (
        <div key={bar.id} className="flex flex-col items-center gap-3">
          <div className="relative h-28 sm:h-36 w-2.5 sm:w-3 flex items-end">
            <motion.div
              className="w-full rounded-full"
              style={{ background: bar.color }}
              initial={{ height: 0, opacity: 0 }}
              animate={
                reduceMotion
                  ? { height: `${bar.baseHeight * 100}%`, opacity: 1 }
                  : {
                      height: [
                        `${bar.baseHeight * 100}%`,
                        `${Math.min(bar.baseHeight * 100 + 8, 100)}%`,
                        `${bar.baseHeight * 100}%`,
                      ],
                      opacity: 1,
                    }
              }
              transition={
                reduceMotion
                  ? { duration: 0.001 }
                  : {
                      height: {
                        duration: 2.8 + i * 0.3,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 0.15,
                      },
                      opacity: { duration: 0.5, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] },
                    }
              }
            />
          </div>
          <span className="font-mono text-[10px] sm:text-xs text-[var(--text-tertiary)] tracking-wide whitespace-nowrap">
            {bar.label}
          </span>
        </div>
      ))}
    </div>
  );
}
