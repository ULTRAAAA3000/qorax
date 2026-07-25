"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { ReactNode, CSSProperties } from "react";

// AnimatedDropdown — той самий принцип, що AnimatedModalOverlay, але
// для позиційних панелей БЕЗ затемнення фону (History-меню, вибір
// контакту в невеликому dropdown тощо) — легкий fade+slide замість
// fade+scale, бо панель прикріплена до кутка кнопки, не центрована.

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function AnimatedDropdown({ open, onClose, children, className, style }: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} />
          <motion.div
            className={className}
            style={style}
            initial={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
