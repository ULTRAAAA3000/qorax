"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { counterpartPath, type Locale } from "@/app/lib/i18n";

// Перемикач UA/EN у шапці маркетингових сторінок. Веде на
// відповідник ПОТОЧНОЇ сторінки (не завжди на головну) через
// counterpartPath — якщо пари ще нема (сторінка ще не перекладена),
// падає назад на /en або / відповідно.

export function LanguageSwitcher({ lang }: { lang: Locale }) {
  const pathname = usePathname();
  const targetPath = counterpartPath(pathname, lang);

  return (
    <div className="flex items-center rounded-lg overflow-hidden text-xs font-mono"
      style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
      <Link href={lang === "uk" ? pathname : targetPath}
        className="px-2 py-1 transition-colors"
        style={lang === "uk" ? { background: "var(--lime)", color: "#0a0a0a" } : { color: "var(--text-tertiary)" }}>
        UA
      </Link>
      <Link href={lang === "en" ? pathname : targetPath}
        className="px-2 py-1 transition-colors"
        style={lang === "en" ? { background: "var(--lime)", color: "#0a0a0a" } : { color: "var(--text-tertiary)" }}>
        EN
      </Link>
    </div>
  );
}
