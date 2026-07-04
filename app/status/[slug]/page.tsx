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
// ============================================================

export const dynamic = "force-dynamic";

import type { Metadata } from "next";
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

async function fetchStatusData(slug: string): Promise<{ data: StatusData | null; debug: string }> {
  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
  const fetchUrl = `${workerUrl}/api/status/${encodeURIComponent(slug)}`;
  try {
    const res = await fetch(fetchUrl, { cache: "no-store" });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { data: null, debug: `url=${fetchUrl} status=${res.status} body=${body.slice(0, 300)}` };
    }
    const data = (await res.json()) as StatusData;
    return { data, debug: "" };
  } catch (err) {
    return {
      data: null,
      debug: `url=${fetchUrl} EXCEPTION: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`,
    };
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> }
): Promise<Metadata> {
  const { slug } = await params;
  const { data } = await fetchStatusData(slug);
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
  const { data, debug } = await fetchStatusData(slug);
  if (!data) {
    // ТИМЧАСОВИЙ debug-вивід замість notFound() — щоб побачити точну
    // причину помилки на проді без доступу до Cloudflare логів.
    // TODO: прибрати після діагностики і повернути notFound().
    return (
      <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f5f5f7", padding: 40, fontFamily: "monospace", fontSize: 13 }}>
        <p style={{ color: "#F5675A", fontWeight: 700, marginBottom: 12 }}>DEBUG: не вдалося завантажити дані статус-сторінки</p>
        <p>slug: {slug}</p>
        <p style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{debug}</p>
      </div>
    );
  }
  return <StatusPageClient data={data} />;
}
