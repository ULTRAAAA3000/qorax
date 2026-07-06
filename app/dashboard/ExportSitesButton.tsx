"use client";

// ─── ExportSitesButton ──────────────────────────────────────────
// Експортує список сайтів у CSV — зручно для агентств, які готують
// зведення по клієнтських сайтах у звіті/екселі. Той самий паттерн
// що й ExportIncidentsButton.tsx (BOM для Excel, csvEscape, blob-download).

import { Download } from "lucide-react";

interface SiteRow {
  url: string;
  display_name: string;
  monitoring_enabled: boolean;
  created_at: string;
  isDown: boolean;
  inMaintenance: boolean;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function statusLabel(site: SiteRow): string {
  if (!site.monitoring_enabled) return "Моніторинг вимкнено";
  if (site.isDown) return "Недоступний";
  if (site.inMaintenance) return "Обслуговування";
  return "Активний";
}

export function ExportSitesButton({ sites }: { sites: SiteRow[] }) {
  function handleExport() {
    const header = ["Назва", "URL", "Статус", "Дата додавання"];

    const rows = sites.map((site) => [
      site.display_name,
      site.url,
      statusLabel(site),
      new Date(site.created_at).toLocaleDateString("uk-UA"),
    ]);

    const csvLines = [header, ...rows].map(row => row.map(csvEscape).join(","));
    // BOM на початку — щоб Excel коректно розпізнав UTF-8 кирилицю
    const csvContent = "\uFEFF" + csvLines.join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `qorax-sites-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (sites.length === 0) return null;

  return (
    <button
      onClick={handleExport}
      className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.1)",
        color: "var(--text-secondary)",
      }}
    >
      <Download size={12} />
      Експорт CSV
    </button>
  );
}
