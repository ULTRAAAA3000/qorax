"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

/**
 * FaqSection — glassmorphism accordion with gradient accents
 * on open items.
 *
 * Попутно виправлено: uk-текст досі згадував старі назви планів
 * (Starter/Growth, +$29/сайт) з-до 0086 pricing rename — не
 * відповідало актуальній лінійці Free/Starter/Pro/Agency. Виправлено
 * в обох мовах заразом із перекладом (чисто текстова правка, без
 * зміни логіки).
 */

const FAQS: Record<Locale, Array<{ q: string; a: string }>> = {
  uk: [
    {
      q: "Всі шість модулів вже доступні?",
      a: "Audit — технічний контроль і моніторинг — вже повністю працює і саме на ньому зараз можна оформити підписку. Sites, AI, Content, Rank та Analytics — частина платформи, яку ми активно будуємо; вони з'являться в дашборді по мірі готовності, без додаткової дії з вашого боку.",
    },
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
      a: "Starter підтримує до 10 сайтів, Pro — до 100. Якщо потрібно більше — план Agency дає необмежену кількість сайтів.",
    },
    {
      q: "Як рахується «втрата у $» від проблеми?",
      a: "AI оцінює вплив на основі типового падіння конверсії при подібній проблемі (наприклад, повільне завантаження) та середнього трафіку сайту. Це орієнтовна оцінка для прийняття рішень, не бухгалтерська точність.",
    },
    {
      q: "Можна скасувати підписку в будь-який момент?",
      a: "Так, підписка щомісячна без довгострокових зобов'язань. Скасування — в один клік з дашборду, доступ зберігається до кінця оплаченого періоду.",
    },
  ],
  en: [
    {
      q: "Are all six modules already available?",
      a: "Audit — technical monitoring and control — is fully live, and it's what you subscribe to today. Sites, AI, Content, Rank, and Analytics are part of the platform we're actively building; they'll appear in your dashboard as they're ready, with no extra action needed on your end.",
    },
    {
      q: "Do you need access to my hosting or site code?",
      a: "No. Qorax works externally, like a site visitor. Just give us the URL. Google Search Console and a few advanced features only need Google OAuth authorization — no access to your site files.",
    },
    {
      q: "Do you support sites that aren't on WordPress?",
      a: "Yes. Qorax checks any site — WordPress, Shopify, Webflow, Wix, or a custom build. Most checks (speed, SSL, SEO, links) don't depend on the platform.",
    },
    {
      q: "What if I have multiple sites?",
      a: "Starter supports up to 10 sites, Pro up to 100. If you need more, the Agency plan gives you unlimited sites.",
    },
    {
      q: "How is the \u201Closs in $\u201D calculated?",
      a: "The AI estimates impact based on the typical conversion drop for a similar issue (e.g. slow load time) and your site's average traffic. It's a directional estimate for decision-making, not accounting-grade precision.",
    },
    {
      q: "Can I cancel anytime?",
      a: "Yes, billing is monthly with no long-term commitment. Cancel in one click from the dashboard — access stays active until the end of the paid period.",
    },
  ],
};

const COPY: Record<Locale, { badge: string; titleStart: string; titleGradient: string; subtitle: string }> = {
  uk: { badge: "✦ ЗАПИТАННЯ", titleStart: "Перш ніж ", titleGradient: "почати", subtitle: "Відповіді на питання, які ви, ймовірно, вже подумали" },
  en: { badge: "✦ QUESTIONS", titleStart: "Before you ", titleGradient: "get started", subtitle: "Answers to questions you're probably already thinking" },
};

export function FaqSection({ lang = "uk" }: { lang?: Locale }) {
  const [openIndex, setOpenIndex] = useState<number | null>(0);
  const reduceMotion = useReducedMotion();
  const t = COPY[lang];
  const faqs = FAQS[lang];

  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <div className="grid lg:grid-cols-[0.8fr_1.2fr] gap-12">
          <div>
            <Reveal>
              <span
                className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)] mb-5"
                style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
              >
                {t.badge}
              </span>
            </Reveal>
            <Reveal delay={0.04}>
              <h2 className="font-display text-3xl sm:text-4xl font-semibold leading-tight">
                {t.titleStart}
                <span className="gradient-text">{t.titleGradient}</span>
              </h2>
            </Reveal>
            <Reveal delay={0.08}>
              <p className="mt-4 text-[var(--text-secondary)] text-sm leading-relaxed max-w-sm">
                {t.subtitle}
              </p>
            </Reveal>
          </div>

          <div>
            {faqs.map((item, i) => {
              const isOpen = openIndex === i;
              return (
                <Reveal key={item.q} delay={0.03 * i}>
                  <div
                    style={{
                      borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
                    }}
                  >
                    <button
                      onClick={() => setOpenIndex(isOpen ? null : i)}
                      className="w-full flex items-center justify-between gap-4 py-5 text-left group"
                    >
                      <span className="font-display text-base sm:text-lg font-medium text-[var(--text-primary)] group-hover:text-[var(--cyan)] transition-colors">
                        {item.q}
                      </span>
                      <motion.span
                        animate={{ rotate: isOpen ? 45 : 0 }}
                        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                        className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-lg font-light leading-none transition-colors"
                        style={{
                          color: isOpen ? "var(--lime)" : "var(--text-tertiary)",
                          background: isOpen ? "rgba(214, 255, 63, 0.1)" : "rgba(255, 255, 255, 0.04)",
                        }}
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
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
