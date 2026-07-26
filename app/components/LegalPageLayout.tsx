import type { Locale } from "@/app/lib/i18n";

interface LegalPageLayoutProps {
  title: string;
  lastUpdated: string;
  lang?: Locale;
  children: React.ReactNode;
}

/**
 * Простий текстовий layout для юридичних сторінок — без маркетингового
 * hero-блоку, фокус на читабельності довгого тексту.
 */
export function LegalPageLayout({ title, lastUpdated, lang = "uk", children }: LegalPageLayoutProps) {
  const label = lang === "en" ? "Last updated" : "Останнє оновлення";
  return (
    <section className="mx-auto max-w-3xl px-6 sm:px-8 pt-16 sm:pt-24 pb-24 w-full">
      <h1 className="font-display text-3xl sm:text-4xl font-bold leading-tight mb-3">
        {title}
      </h1>
      <p className="text-sm text-[var(--text-tertiary)] mb-12">
        {label}: {lastUpdated}
      </p>
      <div className="legal-content space-y-8">
        {children}
      </div>
    </section>
  );
}
