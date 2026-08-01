import type { MetadataRoute } from "next";

// robots.txt (MODULE_ROADMAP.md, "Sitemap.xml... не створено" — при
// перевірці виявилось, що robots.txt теж не було жодного, а без
// нього пошуковики не знають, де шукати /sitemap.xml). Дозволяємо
// індексацію публічних сторінок, забороняємо приватні (dashboard,
// продуктові редактори за авторизацією, службові API/redirect-роути).
export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard",
        "/browser",
        "/creator",
        "/mail",
        "/office",
        "/sites-builder",
        "/invite",
        "/r/",
        "/status/",
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
