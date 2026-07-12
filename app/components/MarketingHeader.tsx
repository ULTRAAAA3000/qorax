import { QoraxLogo } from "./QoraxLogo";

export function MarketingHeader({
  isLoggedIn = false,
  activePath = "",
}: {
  isLoggedIn?: boolean;
  activePath?: string;
}) {
  const navLinks = [
    { href: "/features", label: "Можливості" },
    { href: isLoggedIn ? "/dashboard/upgrade" : "/#plans", label: "Тарифи" },
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
        <a href="/">
          <QoraxLogo size="sm" />
        </a>
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
        <div className="flex items-center gap-3">
          {isLoggedIn ? (
            <a
              href="/dashboard/home"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
            >
              До дашборду
            </a>
          ) : (
            <a
              href="/login"
              className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors px-3 py-2"
            >
              Увійти
            </a>
          )}
          <a href="/#audit" className="glow-button text-sm !py-2 !px-4">
            Безкоштовний аудит
          </a>
        </div>
      </div>
    </header>
  );
}
