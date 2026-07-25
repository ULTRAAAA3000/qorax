import { QoraxLogo } from "./QoraxLogo";
import { localizedHref, type Locale } from "@/app/lib/i18n";

/**
 * SiteFooterExpanded — rich footer with gradient top border,
 * multi-column links, and social presence.
 */

const COLUMNS: Record<Locale, Array<{ title: string; links: Array<{ label: string; href: string }> }>> = {
  uk: [
    {
      title: "Продукт",
      links: [
        { label: "Можливості", href: "/features" },
        { label: "Тарифи", href: "/#plans" },
        { label: "Документація", href: "/docs" },
        { label: "Безкоштовний аудит", href: "/#audit" },
      ],
    },
    {
      title: "Для кого",
      links: [
        { label: "Малий бізнес", href: "/features" },
        { label: "Агентства", href: "/features" },
        { label: "E-commerce", href: "/features" },
        { label: "Фрілансери", href: "/features" },
      ],
    },
    {
      title: "Компанія",
      links: [
        { label: "Про нас", href: "/about" },
        { label: "Партнерська програма", href: "/partners" },
        { label: "Контакти", href: "/about#contact" },
      ],
    },
    {
      title: "Правове",
      links: [
        { label: "Умови використання", href: "/terms" },
        { label: "Політика конфіденційності", href: "/privacy" },
      ],
    },
  ],
  en: [
    {
      title: "Product",
      links: [
        { label: "Features", href: "/features" },
        { label: "Pricing", href: "/#plans" },
        { label: "Docs", href: "/docs" },
        { label: "Free Audit", href: "/#audit" },
      ],
    },
    {
      title: "Who it's for",
      links: [
        { label: "Small business", href: "/features" },
        { label: "Agencies", href: "/features" },
        { label: "E-commerce", href: "/features" },
        { label: "Freelancers", href: "/features" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Partner program", href: "/partners" },
        { label: "Contact", href: "/about#contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms of Service", href: "/terms" },
        { label: "Privacy Policy", href: "/privacy" },
      ],
    },
  ],
};

const COPY: Record<Locale, { tagline: string; rights: string; madeIn: string }> = {
  uk: {
    tagline: "Технічний моніторинг сайтів для малого бізнесу та агентств.",
    rights: "Усі сайти заслуговують на турботу.",
    madeIn: "Зроблено в Україні 🇺🇦",
  },
  en: {
    tagline: "Technical website monitoring for small businesses and agencies.",
    rights: "Every website deserves to be taken care of.",
    madeIn: "Made in Ukraine 🇺🇦",
  },
};

export function SiteFooterExpanded({ lang = "uk" }: { lang?: Locale }) {
  const columns = COLUMNS[lang];
  const t = COPY[lang];

  return (
    <footer className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_1fr] gap-10 lg:gap-6">
          <div>
            <QoraxLogo size="sm" />
            <p className="mt-4 text-sm text-[var(--text-tertiary)] max-w-[220px] leading-relaxed">
              {t.tagline}
            </p>
            {/* Social links */}
            <div className="mt-6 flex items-center gap-3">
              <a
                href="#"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                style={{ background: "rgba(255, 255, 255, 0.04)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="#"
                className="h-8 w-8 rounded-lg flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                style={{ background: "rgba(255, 255, 255, 0.04)" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z" />
                </svg>
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4 className="font-mono text-xs tracking-wide text-[var(--text-tertiary)] mb-4">
                {col.title.toUpperCase()}
              </h4>
              <ul className="space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <a
                      href={localizedHref(link.href, lang)}
                      className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          className="mt-14 pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
          style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
        >
          <p className="text-xs text-[var(--text-tertiary)]">
            © {new Date().getFullYear()} Qorax. {t.rights}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] font-mono">{t.madeIn}</p>
        </div>
      </div>
    </footer>
  );
}
