import type { MetadataRoute } from "next";
import { LOCALE_PAGE_PAIRS } from "./lib/i18n";

// sitemap.xml з hreflang для uk<->en пар (MODULE_ROADMAP.md, "Sitemap.xml
// з hreflang для /en-сторінок — не створено"). Джерело пар — той самий
// LOCALE_PAGE_PAIRS, що вже керує LanguageSwitcher і buildMetadata
// (app/lib/i18n.ts): одна точка правди, немає ризику розсинхрону між
// тим, які сторінки реально мають /en-версію, і тим, що потрапляє в
// sitemap. Next.js (app/sitemap.ts, конвенція App Router) сам віддає
// правильний sitemap.xml на /sitemap.xml — сумісно з OpenNext Cloudflare
// adapter (звичайний Response, без Node-специфічних API).
//
// /docs навмисно БЕЗ hreflang-alternates — одна URL без /en-пари (SPA
// з усіма статтями на одній сторінці, не окремі URL per-стаття, тому
// й per-стаття записи в sitemap не мають сенсу).
export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";
  const lastModified = new Date();

  const localizedEntries: MetadataRoute.Sitemap = LOCALE_PAGE_PAIRS.flatMap(({ uk, en }) => {
    const alternates = {
      languages: {
        uk: `${siteUrl}${uk}`,
        en: `${siteUrl}${en}`,
      },
    };
    const priority = uk === "/" ? 1 : 0.7;
    return [
      { url: `${siteUrl}${uk}`, lastModified, changeFrequency: "weekly" as const, priority, alternates },
      { url: `${siteUrl}${en}`, lastModified, changeFrequency: "weekly" as const, priority, alternates },
    ];
  });

  return [
    ...localizedEntries,
    { url: `${siteUrl}/docs`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
