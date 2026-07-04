// ============================================================
// /status/[slug] — публічна сторінка статусу сайту (Growth)
// Доступна без авторизації. Дані тягнуться з /api/status/:slug
// через Qorax Worker.
//
// force-dynamic: сторінка рендериться на кожен запит. ISR через
// fetch({ next: { revalidate } }) на Cloudflare Workers (OpenNext)
// потребує окремого налаштування Cache API/KV binding — без нього
// кеш мовчки не працює і build-time рендер може повернути 404 для
// щойно створених/незакешованих slug'ів.
//
// ВАЖЛИВО: Cloudflare Workers не дозволяє одному Worker'у робити
// fetch() на публічний URL іншого Worker'а того ж акаунта — це
// повертає Cloudflare error 1042. Тому звертаємось до qorax-api
// через Service Binding (env.API_WORKER), а не через публічний
// https://qorax-api.mrcru96.workers.dev. Локально (без Cloudflare
// рантайму) фолбек на звичайний fetch за NEXT_PUBLIC_API_URL.
// ============================================================

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { StatusPageClient } from "./StatusPageClient";

interface StatusData {
  site: { displayName: string; url: string };
  currentStatus: "up" | "down" | "unknown";
  uptimePct7d: number;
  avgSpeedMs: number | null;
  dailyUptime: Array<{ date: string; pct: number; checks: number }>;
  incidents: Array<{ id: string; started_at: string; resolved_at: string | null; duration_seconds: number | null }>;
  ssl: { daysLeft: number | null; validUntil: string | null } | null;
  whiteLabel: { companyName: string | null; logoUrl: string | null } | null;
  generatedAt: string;
}

async function fetchStatusData(slug: string): Promise<StatusData | null> {
  const path = `/api/status/${encodeURIComponent(slug)}`;

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
        console.error(`[status/${slug}] binding responded ${res.status}`);
        return null;
      }
      return (await res.json()) as StatusData;
    }
  } catch (err) {
    // Binding недоступний (локальна розробка без wrangler dev) —
    // падаємо на звичайний fetch нижче.
    console.error(`[status/${slug}] service binding failed:`, err instanceof Error ? err.message : err);
  }

  // 2) Фолбек — звичайний fetch за публічним URL (локальна розробка)
  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
  try {
    const res = await fetch(`${workerUrl}${path}`, { cache: "no-store" });
    if (!res.ok) {
      console.error(`[status/${slug}] fetch responded ${res.status}`);
      return null;
    }
    return (await res.json()) as StatusData;
  } catch (err) {
    console.error(`[status/${slug}] fetch failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchStatusData(slug);
  if (!data) return { title: "Сторінка статусу — Qorax" };
  return {
    title: `Статус ${data.site.displayName} — Qorax`,
    description: `Uptime ${data.uptimePct7d.toFixed(2)}% за 7 днів. Поточний статус: ${data.currentStatus === "up" ? "працює" : "недоступний"}.`,
  };
}

export default async function StatusPage(
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const data = await fetchStatusData(slug);
  if (!data) notFound();
  return <StatusPageClient data={data} />;
}
