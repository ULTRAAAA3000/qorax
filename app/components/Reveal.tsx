"use client";

/**
 * Reveal — wraps a single object and animates it in when scrolled into view.
 *
 * Per design system: motion serves "spatial consistency" and "preventing jarring
 * changes" — elements ease in from a settled resting state (small y-offset + fade),
 * never from off-screen or with bounce. Always ease-out, always under the
 * design system's duration ceiling. The page itself never moves — only the object.
 */

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

const EASE_OUT_STRONG = [0.16, 1, 0.3, 1] as const;

export function Reveal({
  children,
  delay = 0,
  className = "",
  y = 16,
  id,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
  id?: string;
}) {
  const reduceMotion = useReducedMotion();

  if (reduceMotion) {
    return (
      <div id={id} className={className}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      id={id}
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px -10% 0px" }}
      transition={{ duration: 0.6, delay, ease: EASE_OUT_STRONG }}
    >
      {children}
    </motion.div>
  );
}
