import Link from "next/link";
import { QoraxLogo } from "./QoraxLogo";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { localizedHref, type Locale } from "@/app/lib/i18n";

// isLoggedIn прийнято залишити в пропсах (сторінки, що використовують
// MarketingHeader, все ще передають user-стан для інших цілей), але
// шапка більше НЕ показує жодного auth-переходу ("Увійти"/"До
// дашборду") — вхід тепер відбувається виключно через сторінку
// конкретного продукту екосистеми (/login веде туди ж, але лінк на
// нього прибрано з глобальної навігації лендингу).
//
// lang визначає мову підписів навігації і мову, куди ведуть
// href (localizedHref переписує "/pricing" на "/en/pricing" для
// lang="en" — лише для сторінок, які вже мають en-версію,
// LOCALE_PAGE_PAIRS у app/lib/i18n.ts; решта посилань (/features,
// /docs тощо, ще не перекладені) лишаються на uk-версії навмисно,
// щоб не вести на неіснуючу сторінку).

const NAV_LABELS: Record<Locale, { features: string; plans: string; docs: string; about: string; audit: string }> = {
  uk: { features: "Можливості", plans: "Тарифи", docs: "Документація", about: "Про нас", audit: "Безкоштовний аудит" },
  en: { features: "Features", plans: "Pricing", docs: "Docs", about: "About", audit: "Free Audit" },
};

export function MarketingHeader({
  activePath = "",
  lang = "uk",
}: {
  isLoggedIn?: boolean;
  activePath?: string;
  lang?: Locale;
}) {
  const t = NAV_LABELS[lang];
  const navLinks = [
    { href: "/features", label: t.features },
    { href: "/#plans", label: t.plans },
    { href: "/docs", label: t.docs },
    { href: "/about", label: t.about },
  ];

  return (
    <header
      className="sticky top-0 z-50"
      style={{
        background: "rgba(10, 10, 10, 0.7)",
        backdropFilter: "blur(20px) saturate(180%)",
        WebkitBackdropFilter: "blur(20px) saturate(180%)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
        <Link href={lang === "en" ? "/en" : "/"}>
          <QoraxLogo size="sm" />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-[var(--text-secondary)]">
          {navLinks.map(({ href, label }) => {
            const isActive = activePath === href;
            return (
              <a
                key={label}
                href={localizedHref(href, lang)}
                className="transition-colors hover:text-[var(--text-primary)]"
                style={{
                  color: isActive ? "var(--text-primary)" : undefined,
                  borderBottom: isActive ? "1px solid var(--lime)" : undefined,
                  paddingBottom: isActive ? "2px" : undefined,
                }}
              >
                {label}
              </a>
            );
          })}
        </nav>
        <div className="flex items-center gap-4">
          <LanguageSwitcher lang={lang} />
          <Link href={localizedHref("/#audit", lang)} className="glow-button text-sm !py-2 !px-4">
            {t.audit}
          </Link>
        </div>
      </div>
    </header>
  );
}
