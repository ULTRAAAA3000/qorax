"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";

/**
 * FaqAccordion — addresses objections per the "FAQ/Documentation" and
 * "Pricing-Focused Landing" patterns: smooth accordion open/close,
 * one question open at a time to keep the page calm.
 */

const FAQS = [
  {
    q: "Чи потрібен доступ до хостингу або коду сайту?",
    a: "Ні. Qorax працює зовні — як відвідувач сайту. Достатньо вказати URL. Для Google Search Console та деяких розширених функцій потрібна лише авторизація через Google OAuth, без доступу до файлів сайту.",
  },
  {
    q: "Підтримуються сайти не на WordPress?",
    a: "Так. Qorax перевіряє будь-який сайт — WordPress, Shopify, Webflow, Wix, кастомну розробку. Більшість перевірок (швидкість, SSL, SEO, посилання) не залежать від платформи.",
  },
  {
    q: "Що якщо в мене кілька сайтів?",
    a: "Starter та Growth розраховані на 1 сайт. Якщо потрібно більше — план Agency дає до 5 сайтів, з можливістю додати ще за $29/сайт на місяць.",
  },
  {
    q: "Як рахується «втрата у $» від проблеми?",
    a: "AI оцінює вплив на основі типового падіння конверсії при подібній проблемі (наприклад, повільне завантаження) та середнього трафіку сайту. Це орієнтовна оцінка для прийняття рішень, не бухгалтерська точність.",
  },
  {
    q: "Можна скасувати підписку в будь-який момент?",
    a: "Так, підписка щомісячна без довгострокових зобов'язань. Скасування — в один клік з дашборду, доступ зберігається до кінця оплаченого періоду.",
  },
];

export function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();

  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12">
          <div>
            <Reveal>
              <span className="font-mono text-xs tracking-wide text-[var(--text-tertiary)] mb-5 block">
                ЗАПИТАННЯ
              </span>
            </Reveal>
            <Reveal delay={0.04}>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
                Перш ніж почати
              </h2>
            </Reveal>
          </div>

          <div className="divide-y divide-[var(--border-hairline)]">
            {FAQS.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <Reveal key={item.q} delay={0.03 * i}>
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    className="w-full flex items-center justify-between gap-4 py-5 text-left group"
                  >
                    <span className="font-display text-base sm:text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--cyan)] transition-colors">
                      {item.q}
                    </span>
                    <motion.span
                      animate={{ rotate: isOpen ? 45 : 0 }}
                      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                      className="shrink-0 text-2xl font-light text-[var(--text-tertiary)] leading-none"
                    >
                      +
                    </motion.span>
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                        className="overflow-hidden"
                      >
                        <p className="pb-5 text-sm leading-relaxed text-[var(--text-secondary)] max-w-xl">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
