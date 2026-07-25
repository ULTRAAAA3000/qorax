"use client";

import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import type { ReactNode, CSSProperties } from "react";

// AnimatedModalOverlay — спільний примітив для плавного відкриття/
// закриття центрованих overlay-модалок (Артем: "мікроанімації...
// плавні відкриття"). Замінює різкий {open && <div>...</div>} без
// переходу, який досі був у ~10 модалок по Dashboard/Office/Browser
// (fade+scale вхід/вихід, ~180мс, той самий easing, що вже прийнятий
// у FaqSection.tsx для акордеона — [0.16, 1, 0.3, 1], "easeOutExpo"-
// подібна крива, консистентна по всьому сайту).
//
// НЕ переписує внутрішню логіку кожної модалки — приймає готовий
// children (весь наявний card-контент кожного файлу лишається без
// змін), обгортає лише зовнішній overlay + card-transform у AnimatePresence.
// Мінімізує ризик регресії на 10+ файлах: кожна заміна — це заміна
// {open && (<div className="fixed inset-0..."><div onClick={stop}>
// {...}</div></div>)} на <AnimatedModalOverlay open={open} onClose={...}>
// {той самий якраз card-контент, без змін}</AnimatedModalOverlay>.

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Клас card-контейнера (те, що раніше було на внутрішньому div — max-w, padding, background тощо). */
  cardClassName?: string;
  cardStyle?: CSSProperties;
  overlayClassName?: string;
  /** z-index overlay — різні модалки використовували z-20/z-50 залежно від контексту (dropdown vs повноекранна). */
  zIndex?: number;
}

export function AnimatedModalOverlay({
  open,
  onClose,
  children,
  cardClassName = "w-full max-w-md rounded-2xl p-5",
  cardStyle,
  overlayClassName = "flex items-center justify-center p-6",
  zIndex = 50,
}: Props) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={`fixed inset-0 ${overlayClassName}`}
          style={{ background: "rgba(0,0,0,0.6)", zIndex }}
          onClick={onClose}
          initial={reduceMotion ? undefined : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.div
            className={cardClassName}
            style={cardStyle}
            onClick={e => e.stopPropagation()}
            initial={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
