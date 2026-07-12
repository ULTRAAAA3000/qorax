// ============================================================
// /sites-builder/preview/[projectId] — публічний рендеринг
// опублікованого проекту Sites-конструктора (MODULE_ROADMAP.md
// розділ 4, Крок 2, варіант А — SSR через існуючий Next.js Worker).
// Доступна без авторизації. Дані тягнуться з /api/sites-content/:id
// через Qorax Worker.
//
// Точна копія паттерну app/status/[slug]/page.tsx (Service Binding
// + fallback на публічний fetch) — той самий клас задачі: публічна
// сторінка, що читає дані з qorax-api Worker без авторизації.
//
// force-dynamic: та сама причина, що і status/[slug] — ISR на
// Cloudflare Workers/OpenNext потребує окремого налаштування
// Cache API/KV, без нього сторінка щойно опублікованого/зміненого
// проекту могла б віддавати застарілий build-time рендер.
//
// ВАЖЛИВО: Cloudflare Workers не дозволяє одному Worker'у робити
// fetch() на публічний URL іншого Worker'а того ж акаунта (Cloudflare
// error 1042) — тому звертаємось до qorax-api через Service Binding
// (env.API_WORKER), не через публічний https://qorax-api.mrcru96.workers.dev.
//
// Translator-модуль (MODULE_ROADMAP.md розділ 5, Крок 2 —
// "hreflang генерується не окремим ендпоінтом, а на льоту в
// SSR-рендерингу Sites"): ?locale=xx перемикає контент на переклад
// (worker сам підміняє title/description/content, якщо переклад
// існує й опублікований), <link rel="alternate" hreflang> в <head>
// генерується з languages, які повертає /api/sites-content разом з
// pages — жодного окремого запиту тут не потрібно.
// ============================================================

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitePreviewRenderer } from "./SitePreviewRenderer";
import type { PublicProduct } from "./ProductShowcase";

interface ProjectPageData {
  id: string;
  project_id: string;
  slug: string;
  content: { blocks?: Array<Record<string, unknown>> };
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}

interface ProjectLanguageData {
  locale: string;
  is_default: boolean;
  url_prefix: string | null;
}

interface SitesContentData {
  project: { id: string; name: string };
  pages: ProjectPageData[];
  languages: ProjectLanguageData[];
  products: PublicProduct[];
}

async function fetchSitesContent(projectId: string, locale?: string): Promise<SitesContentData | null> {
  const path = `/api/sites-content/${encodeURIComponent(projectId)}${locale ? `?locale=${encodeURIComponent(locale)}` : ""}`;

  // 1) Service Binding (працює на Cloudflare — обходить error 1042)
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const apiWorker = (ctx.env as Record<string, unknown>)?.API_WORKER as
      | { fetch: (url: string, init?: RequestInit) => Promise<Response> }
      | undefined;

    if (apiWorker) {
      const res = await apiWorker.fetch(`https://qorax-api.internal${path}`);
      if (!res.ok) {
        console.error(`[sites-builder/preview/${projectId}] binding responded ${res.status}`);
        return null;
      }
      const data = (await res.json()) as SitesContentData;
      return { ...data, languages: data.languages ?? [], products: data.products ?? [] };
    }
  } catch (err) {
    // Binding недоступний (локальна розробка без wrangler dev) —
    // падаємо на звичайний fetch нижче.
    console.error(`[sites-builder/preview/${projectId}] service binding failed:`, err instanceof Error ? err.message : err);
  }

  // 2) Фолбек — звичайний fetch за публічним URL (локальна розробка)
  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
  try {
    const res = await fetch(`${workerUrl}${path}`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[sites-builder/preview/${projectId}] fetch responded ${res.status}`);
      return null;
    }
    const data = (await res.json()) as SitesContentData;
    return { ...data, languages: data.languages ?? [], products: data.products ?? [] };
  } catch (err) {
    console.error(`[sites-builder/preview/${projectId}] fetch failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateMetadata(
  { params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ locale?: string }> }
): Promise<Metadata> {
  const { projectId } = await params;
  const { locale } = await searchParams;
  const data = await fetchSitesContent(projectId, locale);
  if (!data) return { title: "Сайт — Qorax" };

  const indexPage = data.pages.find(p => p.slug === "index") ?? data.pages[0];

  // hreflang: <link rel="alternate" hreflang="xx" href=".../preview/:id?locale=xx">
  // для кожної підключеної мови + дефолтну (без ?locale=, x-default)
  const languages: Record<string, string> = {};
  if (data.languages.length > 0) {
    for (const lang of data.languages) {
      languages[lang.locale] = `/sites-builder/preview/${projectId}?locale=${lang.locale}`;
    }
    const defaultLang = data.languages.find(l => l.is_default);
    languages["x-default"] = defaultLang
      ? `/sites-builder/preview/${projectId}`
      : `/sites-builder/preview/${projectId}?locale=${data.languages[0].locale}`;
  }

  return {
    title: indexPage?.seo_title || data.project.name,
    description: indexPage?.seo_description || undefined,
    alternates: Object.keys(languages).length > 0 ? { languages } : undefined,
  };
}

export default async function SitesBuilderPreviewPage(
  { params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ locale?: string }> }
) {
  const { projectId } = await params;
  const { locale } = await searchParams;
  const data = await fetchSitesContent(projectId, locale);
  if (!data) notFound();

  const indexPage = data.pages.find(p => p.slug === "index") ?? data.pages[0];
  if (!indexPage) notFound();

  return <SitePreviewRenderer page={indexPage} projectName={data.project.name} projectId={projectId} products={data.products} />;
}

