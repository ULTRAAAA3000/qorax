export type Locale = "uk" | "en";

// Мапа пар публічних сторінок uk <-> en. Використовується
// LanguageSwitcher (щоб перемикання мови лишало на тій самій
// сторінці, а не кидало на головну) і buildMetadata (щоб згенерувати
// коректні hreflang-альтернативи). Розширювати цей масив по мірі
// того, як з'являються нові /en-сторінки (Features/About/Partners/
// Terms/Privacy — заплановано, ще не зроблено).
export const LOCALE_PAGE_PAIRS: Array<{ uk: string; en: string }> = [
  { uk: "/", en: "/en" },
  { uk: "/pricing", en: "/en/pricing" },
];

// Для сторінки uk-шляху повертає її en-відповідник (або /en, якщо
// пари ще не існує — краще привести на англійську головну, ніж на
// неіснуючий /en/<шлях>). І навпаки.
export function counterpartPath(pathname: string, from: Locale): string {
  const pair = LOCALE_PAGE_PAIRS.find((p) => p[from] === pathname);
  if (pair) return from === "uk" ? pair.en : pair.uk;
  return from === "uk" ? "/en" : "/";
}

// Внутрішні href у спільних компонентах (MarketingHeader,
// SiteFooterExpanded тощо) написані як uk-шляхи ("/features",
// "/#plans"). Для англійської версії відносні шляхи, що ведуть на
// сторінку з відомою en-парою, переписуються на /en/...; шляхи без
// пари (якорі на тій самій сторінці, зовнішні посилання, або
// сторінки, які ще не перекладені — /docs, /features тощо) лишаються
// без змін, щоб не вести на неіснуючий /en/features.
export function localizedHref(href: string, locale: Locale): string {
  if (locale === "uk") return href;
  if (href.startsWith("#") || href.startsWith("http") || href.startsWith("mailto:")) return href;

  const [path, hash] = href.split("#");
  const pair = LOCALE_PAGE_PAIRS.find((p) => p.uk === path);
  if (!pair) return href; // сторінка без en-версії — лишаємо як є
  return hash ? `${pair.en}#${hash}` : pair.en;
}
