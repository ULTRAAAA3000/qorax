"use client";

// ─── ExportIncidentsButton ──────────────────────────────────────
// Експортує список інцидентів у CSV файл — зручно для звітності
// перед клієнтом (агентства часто готують такі зведення вручну).

import { Download } from "lucide-react";

interface Incident {
  id: string;
  started_at: string;
  resolved_at: string | null;
  duration_seconds?: number | null;
}

interface Props {
  incidents: Incident[];
  siteName: string;
}

function fmtDurationSec(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} хв`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function ExportIncidentsButton({ incidents, siteName }: Props) {
  function handleExport() {
    const header = ["Дата", "Початок", "Відновлення", "Тривалість", "Тривалість (с)", "Статус"];

    const rows = incidents.map((incident) => {
      const isOpen = !incident.resolved_at;
      const durationSec = incident.duration_seconds != null
        ? incident.duration_seconds
        : incident.resolved_at
        ? Math.round((new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime()) / 1000)
        : null;

      return [
        new Date(incident.started_at).toLocaleDateString("uk-UA"),
        new Date(incident.started_at).toLocaleString("uk-UA"),
        incident.resolved_at ? new Date(incident.resolved_at).toLocaleString("uk-UA") : "",
        durationSec != null ? fmtDurationSec(durationSec) : "",
        durationSec != null ? String(durationSec) : "",
        isOpen ? "Активний" : "Вирішено",
      ];
    });

    const csvLines = [header, ...rows].map(row => row.map(csvEscape).join(","));
    // BOM на початку — щоб Excel коректно розпізнав UTF-8 кирилицю
    const csvContent = "\uFEFF" + csvLines.join("\r\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const dateStr = new Date().toISOString().slice(0, 10);
    const safeName = siteName.toLowerCase().replace(/[^a-z0-9а-яіїєґ]+/gi, "-").replace(/^-|-$/g, "");
    link.href = url;
    link.download = `qorax-incidents-${safeName}-${dateStr}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  if (incidents.length === 0) return null;

  return (
    <button
      onClick={handleExport}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 600,
        padding: "6px 12px",
        borderRadius: 8,
        cursor: "pointer",
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)",
        color: "var(--text-secondary)",
        transition: "all 0.15s",
      }}
    >
      <Download size={12} />
      Експорт CSV
    </button>
  );
}
