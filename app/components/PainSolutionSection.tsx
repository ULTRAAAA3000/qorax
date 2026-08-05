import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

/**
 * PainSolutionSection — "стара модель / модель Qorax" (PRICING.md
 * Частина 0, блок 3 брифу). Статична секція, без інтерактивності —
 * не client-компонент.
 */

const ROWS: Record<Locale, Array<{ pain: string; solution: string }>> = {
  uk: [
    {
      pain: "Ви здали сайт, отримали $500 і шукаєте наступного клієнта з нуля.",
      solution: "Ви здаєте сайт і підключаєте клієнта до підписки на супровід за $40/міс.",
    },
    {
      pain: "Клієнт згадує про вас, тільки коли сайт впав або закінчився SSL/домен.",
      solution: "Qorax надсилає вам alert за 7 днів до проблеми — ви пропонуєте доробку до того, як усе зламалось.",
    },
    {
      pain: "Ручна підготовка звітів по SEO й аналітиці займає 3-4 години щомісяця.",
      solution: "Автоматичний звіт збирається за 1 хвилину (GSC + GA4) і пояснює метрики мовою бізнесу.",
    },
    {
      pain: "Клієнт не розуміє, за що платить щомісяця, і скасовує підтримку.",
      solution: "AI-модуль формує зрозумілий чекліст виконаних і запланованих робіт.",
    },
  ],
  en: [
    {
      pain: "You handed off the site, got $500, and you're hunting for the next client from zero.",
      solution: "You hand off the site and put the client on a $40/mo retainer for ongoing support.",
    },
    {
      pain: "The client only remembers you when the site goes down or SSL/the domain expires.",
      solution: "Qorax alerts you 7 days ahead of the problem — you pitch the fix before anything breaks.",
    },
    {
      pain: "Manually pulling SEO and analytics reports eats 3-4 hours every month.",
      solution: "An automatic report (GSC + GA4) is ready in a minute and explains metrics in plain business language.",
    },
    {
      pain: "The client doesn't understand what they're paying for monthly, and cancels.",
      solution: "The AI module builds a clear checklist of work done and work planned.",
    },
  ],
};

const COPY: Record<Locale, { badge: string; title: string; painHeader: string; solutionHeader: string }> = {
  uk: {
    badge: "✦ ЧОМУ ЦЕ ПРАЦЮЄ",
    title: "Стара модель губить дохід. Нова — його утримує",
    painHeader: "Стара модель",
    solutionHeader: "З Qorax",
  },
  en: {
    badge: "✦ WHY THIS WORKS",
    title: "The old model loses revenue. The new one keeps it",
    painHeader: "The old way",
    solutionHeader: "With Qorax",
  },
};

export function PainSolutionSection({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const rows = ROWS[lang];

  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-5xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="text-center mb-4">
            <span
              className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}
            >
              {t.badge}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            {t.title}
          </h2>
        </Reveal>

        <div className="mt-12 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <div className="grid sm:grid-cols-2">
            <div className="px-6 sm:px-8 py-4 text-xs font-mono text-[var(--text-tertiary)]" style={{ background: "rgba(255, 255, 255, 0.03)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}>
              {t.painHeader}
            </div>
            <div
              className="px-6 sm:px-8 py-4 text-xs font-mono"
              style={{ background: "rgba(214, 255, 63, 0.05)", borderBottom: "1px solid rgba(255, 255, 255, 0.06)", color: "var(--lime)" }}
            >
              {t.solutionHeader}
            </div>
          </div>
          {rows.map((row, i) => (
            <Reveal key={row.pain} delay={0.03 * i}>
              <div className="grid sm:grid-cols-2" style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(255, 255, 255, 0.06)" : undefined }}>
                <div className="px-6 sm:px-8 py-5 text-sm leading-relaxed text-[var(--text-tertiary)]" style={{ borderRight: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  {row.pain}
                </div>
                <div className="px-6 sm:px-8 py-5 text-sm leading-relaxed text-[var(--text-secondary)]">{row.solution}</div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
