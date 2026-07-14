import Link from "next/link";
import { QoraxLogo } from "./QoraxLogo";

// isLoggedIn прийнято залишити в пропсах (сторінки, що використовують
// MarketingHeader, все ще передають user-стан для інших цілей), але
// шапка більше НЕ показує жодного auth-переходу ("Увійти"/"До
// дашборду") — вхід тепер відбувається виключно через сторінку
// конкретного продукту екосистеми (/login веде туди ж, але лінк на
// нього прибрано з глобальної навігації лендингу).

export function MarketingHeader({
  activePath = "",
}: {
  isLoggedIn?: boolean;
  activePath?: string;
}) {
  const navLinks = [
    { href: "/features", label: "Можливості" },
    { href: "/#plans", label: "Тарифи" },
    { href: "/docs", label: "Документація" },
    { href: "/about", label: "Про нас" },
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
        <Link href="/">
          <QoraxLogo size="sm" />
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-sm text-[var(--text-secondary)]">
          {navLinks.map(({ href, label }) => {
            const isActive = activePath === href;
            return (
              <a
                key={label}
                href={href}
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
        <Link href="/#audit" className="glow-button text-sm !py-2 !px-4">
          Безкоштовний аудит
        </Link>
      </div>
    </header>
  );
}
