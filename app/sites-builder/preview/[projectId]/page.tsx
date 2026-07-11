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
// ============================================================

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SitePreviewRenderer } from "./SitePreviewRenderer";

interface ProjectPageData {
  id: string;
  project_id: string;
  slug: string;
  content: { blocks?: Array<Record<string, unknown>> };
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}

interface SitesContentData {
  project: { id: string; name: string };
  pages: ProjectPageData[];
}

async function fetchSitesContent(projectId: string): Promise<SitesContentData | null> {
  const path = `/api/sites-content/${encodeURIComponent(projectId)}`;

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
      return (await res.json()) as SitesContentData;
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
    return (await res.json()) as SitesContentData;
  } catch (err) {
    console.error(`[sites-builder/preview/${projectId}] fetch failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ projectId: string }> }
): Promise<Metadata> {
  const { projectId } = await params;
  const data = await fetchSitesContent(projectId);
  if (!data) return { title: "Сайт — Qorax" };

  const indexPage = data.pages.find(p => p.slug === "index") ?? data.pages[0];
  return {
    title: indexPage?.seo_title || data.project.name,
    description: indexPage?.seo_description || undefined,
  };
}

export default async function SitesBuilderPreviewPage(
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const data = await fetchSitesContent(projectId);
  if (!data) notFound();

  const indexPage = data.pages.find(p => p.slug === "index") ?? data.pages[0];
  if (!indexPage) notFound();

  return <SitePreviewRenderer page={indexPage} projectName={data.project.name} />;
}
