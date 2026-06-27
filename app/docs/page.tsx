"use client";

import { useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Reveal } from "@/app/components/Reveal";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { MarketingHeader } from "@/app/components/MarketingHeader";

const SECTIONS = [
  {
    id: "start",
    label: "Початок роботи",
    items: [
      {
        q: "Як розпочати роботу з Qorax?",
        a: "Зареєструйтесь — тріал на 14 днів активується автоматично. Потім додайте перший сайт: введіть URL і назву. Перші дані з'являться протягом кількох хвилин — uptime-перевірки стартують одразу, SEO та швидкість — наступного ранку о 3:00.",
      },
      {
        q: "Чи потрібен доступ до хостингу або коду сайту?",
        a: "Ні. Qorax працює зовні — як звичайний відвідувач. Достатньо вказати URL. Для Google Search Console потрібна лише авторизація через Google OAuth, без доступу до файлів сайту.",
      },
      {
        q: "Які сайти підтримуються?",
        a: "Будь-який публічно доступний сайт — WordPress, Shopify, Webflow, Wix, кастомна розробка. Більшість перевірок не залежать від платформи.",
      },
      {
        q: "Скільки сайтів можна додати?",
        a: "Starter і Growth — 1 сайт. Agency — до 5 сайтів, з можливістю додати ще за $29/сайт на місяць.",
      },
    ],
  },
  {
    id: "monitoring",
    label: "Моніторинг",
    items: [
      {
        q: "Як часто перевіряється uptime?",
        a: "На Starter і Growth — кожні 5 хвилин. На безкоштовному/тріал після закінчення — раз на 30 хвилин.",
      },
      {
        q: "Як працюють алерти про недоступність?",
        a: "Якщо сайт не відповідає — фіксується інцидент. Email-сповіщення надходить відразу. Telegram-алерти доступні на Growth+ і налаштовуються в розділі Налаштування дашборду.",
      },
      {
        q: "Як перевіряється SSL?",
        a: "При кожному uptime-скані Qorax перевіряє дійсність HTTPS-з'єднання. Алерти надходять за 30 і 7 днів до закінчення сертифіката.",
      },
      {
        q: "Коли запускається SEO-аудит і швидкість?",
        a: "Щоденно о 3:00 UTC. Перший результат з'явиться наступного ранку після додавання сайту.",
      },
    ],
  },
  {
    id: "ai",
    label: "AI-аналіз",
    items: [
      {
        q: "Як рахується «втрата у $» від проблеми?",
        a: "AI оцінює вплив на основі типового падіння конверсії при подібній проблемі та середнього трафіку сайту. Це орієнтовна оцінка для прийняття рішень — не бухгалтерська точність.",
      },
      {
        q: "Що таке Qoraxus — AI-чат?",
        a: "Qoraxus — вбудований AI-асистент (доступний на Growth+), якому можна поставити запитання про конкретні проблеми сайту. Він бачить ваші дані і пояснює, що виправити в першу чергу і чому.",
      },
      {
        q: "Якою мовою відповідає AI?",
        a: "Qoraxus відповідає тією мовою, якою ви запитуєте — українською, англійською або іншою.",
      },
    ],
  },
  {
    id: "billing",
    label: "Оплата та підписка",
    items: [
      {
        q: "Чи можна скасувати підписку в будь-який момент?",
        a: "Так, підписка щомісячна без довгострокових зобов'язань. Скасування — в один клік через Customer Portal. Доступ зберігається до кінця оплаченого місяця.",
      },
      {
        q: "Які способи оплати приймаються?",
        a: "Картки Visa, Mastercard, американський Amex. Оплата через LemonSqueezy — надійний міжнародний процесор.",
      },
      {
        q: "Чи є знижка на річну оплату?",
        a: "Наразі доступна лише місячна підписка. Річний план планується найближчим часом.",
      },
      {
        q: "Що станеться після закінчення тріалу?",
        a: "Моніторинг переходить на безкоштовний рівень: uptime раз на 30 хвилин, без швидкості, SSL-алертів та AI-аналізу. Всі дані зберігаються — ви нічого не втрачаєте.",
      },
    ],
  },
  {
    id: "reports",
    label: "Звіти та агентства",
    items: [
      {
        q: "Коли генерується місячний PDF-звіт?",
        a: "Автоматично в кінці кожного місяця. Надсилається на email і з'являється в дашборді для завантаження.",
      },
      {
        q: "Що таке white-label звіти?",
        a: "На Agency-плані PDF-звіти виходять з вашим логотипом і назвою компанії — без згадки Qorax. Клієнт бачить ваш бренд.",
      },
      {
        q: "Чи можна дати клієнту окремий доступ до дашборду?",
        a: "Наразі доступ один на організацію. Функція окремих клієнтських акаунтів для агентств у планах розробки.",
      },
    ],
  },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("start");
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  const currentSection = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader activePath="/docs" />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 sm:px-8 pt-16 sm:pt-24 pb-10 sm:pb-14 w-full">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-tertiary)",
            }}
          >
            ✦ ДОКУМЕНТАЦІЯ
          </span>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight max-w-2xl">
            Відповіді на{" "}
            <span className="gradient-text">всі питання</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 text-[var(--text-secondary)] max-w-md leading-relaxed">
            Все, що потрібно знати для початку роботи та ефективного використання Qorax.
          </p>
        </Reveal>
      </section>

      <div className="gradient-divider" />

      {/* Main content */}
      <section className="mx-auto max-w-6xl px-6 sm:px-8 py-10 sm:py-16 w-full">
        <div className="grid lg:grid-cols-[220px_1fr] gap-10 lg:gap-16">
          {/* Sidebar */}
          <nav className="lg:sticky lg:top-24 lg:self-start">
            <ul className="space-y-1">
              {SECTIONS.map((section) => {
                const isActive = activeSection === section.id;
                return (
                  <li key={section.id}>
                    <button
                      onClick={() => {
                        setActiveSection(section.id);
                        setOpenIndex(null);
                      }}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                      style={{
                        color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                        background: isActive ? "rgba(214,255,63,0.06)" : "transparent",
                        borderLeft: isActive ? "2px solid var(--lime)" : "2px solid transparent",
                      }}
                    >
                      {section.label}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div
              className="mt-8 rounded-xl p-4"
              style={{
                background: "rgba(140,246,255,0.04)",
                border: "1px solid rgba(140,246,255,0.1)",
              }}
            >
              <p className="text-xs font-mono text-[var(--cyan)] mb-2">ПІДТРИМКА</p>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Не знайшли відповідь?
              </p>
              <a
                href="mailto:support@qorax.app"
                className="mt-2 text-sm text-[var(--cyan)] hover:opacity-80 transition-opacity block"
              >
                support@qorax.app →
              </a>
            </div>
          </nav>

          {/* FAQ items */}
          <div>
            <h2 className="font-display text-2xl font-semibold mb-8">
              {currentSection.label}
            </h2>
            <div>
              {currentSection.items.map((item, i) => {
                const key = `${activeSection}-${i}`;
                const isOpen = openIndex === key;
                return (
                  <FaqItem
                    key={key}
                    item={item}
                    isOpen={isOpen}
                    onToggle={() => setOpenIndex(isOpen ? null : key)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="relative">
        <div className="gradient-divider" />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20 text-center">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">
              Готові спробувати?
            </h2>
          </Reveal>
          <Reveal delay={0.05}>
            <p className="text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
              14 днів повного доступу безкоштовно. Без кредитної картки.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <a href="/register" className="glow-button text-sm !py-3 !px-8 inline-block">
              Почати тріал →
            </a>
          </Reveal>
        </div>
      </section>

      <SiteFooterExpanded />
    </main>
  );
}

function FaqItem({
  item,
  isOpen,
  onToggle,
}: {
  item: { q: string; a: string };
  isOpen: boolean;
  onToggle: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between gap-4 py-5 text-left group"
      >
        <span className="font-display text-base font-medium text-[var(--text-primary)] group-hover:text-[var(--cyan)] transition-colors">
          {item.q}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded-full text-lg font-light leading-none transition-colors"
          style={{
            color: isOpen ? "var(--lime)" : "var(--text-tertiary)",
            background: isOpen ? "rgba(214,255,63,0.1)" : "rgba(255,255,255,0.04)",
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
  );
}
