import { QoraxLogo } from "./QoraxLogo";

/**
 * SiteFooterExpanded — multi-column footer (Linear-style), giving the
 * page the structural weight expected from an established product, even
 * though most links are placeholders for now-non-existent pages.
 */

const COLUMNS = [
  {
    title: "Продукт",
    links: ["Моніторинг", "AI-аналіз", "Тарифи", "Безкоштовний аудит"],
  },
  {
    title: "Для кого",
    links: ["Малий бізнес", "Агентства", "E-commerce", "Фрилансери"],
  },
  {
    title: "Компанія",
    links: ["Про нас", "Блог", "Контакти"],
  },
  {
    title: "Правове",
    links: ["Умови використання", "Політика конфіденційності"],
  },
];

export function SiteFooterExpanded() {
  return (
    <footer className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-10 lg:gap-6">
          <div>
            <QoraxLogo size="sm" />
            <p className="mt-4 text-sm text-[var(--text-tertiary)] max-w-[220px] leading-relaxed">
              Технічний моніторинг сайтів для малого бізнесу та агентств.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4 className="font-mono text-xs tracking-wide text-[var(--text-tertiary)] mb-4">
                {col.title.toUpperCase()}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <span className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer">
                      {link}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 pt-6 border-t hairline flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-[var(--text-tertiary)]">
            © {new Date().getFullYear()} Qorax. Усі сайти заслуговують на турботу.
          </p>
          <p className="text-xs text-[var(--text-tertiary)] font-mono">Зроблено в Україні 🇺🇦</p>
        </div>
      </div>
    </footer>
  );
}
