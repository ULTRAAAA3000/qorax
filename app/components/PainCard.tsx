"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/**
 * PainCard — a single, self-contained problem statement.
 * Hover lifts only the card (object-level motion), border brightens from
 * hairline to hairline-strong — never a glow/gradient, per design system.
 */

export function PainCard({
  metric,
  title,
  description,
  icon,
}: {
  metric: string;
  title: string;
  description: string;
  icon: ReactNode;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      className="group relative rounded-2xl border p-6 sm:p-7 hairline bg-[var(--bg-raised)]"
      whileHover={reduceMotion ? undefined : { y: -4 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="absolute inset-0 rounded-2xl border opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
        style={{ borderColor: "var(--border-hairline-strong)", transitionDuration: "180ms" }}
      />
      <div className="flex items-center justify-between mb-5">
        <div className="text-[var(--text-tertiary)]">{icon}</div>
        <span className="font-mono text-xs tabular text-[var(--text-tertiary)]">{metric}</span>
      </div>
      <h3 className="font-display text-lg font-medium mb-2 text-[var(--text-primary)]">
        {title}
      </h3>
      <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{description}</p>
    </motion.div>
  );
}
