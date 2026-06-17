"use client";

/**
 * QoraxLogo — coded reproduction of the brand mark: five bars of varying height
 * (lime / cyan / brighter cyan / white / grey) followed by the wordmark, with
 * "Qo" in white and "rax" in cyan, echoing the supplied logo.
 */

import { motion, useReducedMotion } from "motion/react";

const BAR_HEIGHTS = [0.42, 0.62, 1, 0.78, 0.36];
const BAR_COLORS = [
  "var(--lime)",
  "var(--bar-2)",
  "var(--cyan)",
  "var(--text-primary)",
  "var(--text-tertiary)",
];

export function QoraxLogo({
  size = "md",
  animated = false,
  className = "",
}: {
  size?: "sm" | "md" | "lg";
  animated?: boolean;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  const dims = {
    sm: { bar: "h-4 w-1", text: "text-lg", gap: "gap-[3px]" },
    md: { bar: "h-6 w-1.5", text: "text-2xl", gap: "gap-1" },
    lg: { bar: "h-10 w-2.5", text: "text-4xl", gap: "gap-1.5" },
  }[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className={`flex items-end ${dims.gap} ${dims.bar.split(" ")[0]}`}>
        {BAR_HEIGHTS.map((h, i) => (
          <motion.div
            key={i}
            className={`rounded-full ${dims.bar}`}
            style={{ background: BAR_COLORS[i], height: `${h * 100}%` }}
            initial={animated && !reduceMotion ? { height: 0, opacity: 0 } : undefined}
            animate={animated && !reduceMotion ? { height: `${h * 100}%`, opacity: 1 } : undefined}
            transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      <span className={`font-display font-semibold ${dims.text} leading-none`}>
        <span className="text-[var(--text-primary)]">Qo</span>
        <span className="text-[var(--cyan)]">rax</span>
      </span>
    </div>
  );
}
