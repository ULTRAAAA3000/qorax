// ============================================================
// /status/[slug] — публічна сторінка статусу сайту (Growth)
// Доступна без авторизації. Дані тягнуться з /api/status/:slug
// через Qorax Worker.
// ============================================================

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
  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
  try {
    const res = await fetch(`${workerUrl}/api/status/${encodeURIComponent(slug)}`, {
      next: { revalidate: 60 }, // кеш 1 хвилина
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
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
