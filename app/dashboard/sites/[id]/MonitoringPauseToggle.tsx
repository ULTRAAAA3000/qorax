"use client";

// ─── MonitoringPauseToggle ──────────────────────────────────────
// Дозволяє призупинити моніторинг сайту без його видалення —
// корисно, коли сайт тимчасово недоступний з відомих причин
// (переїзд на інший хостинг, довготривалі роботи) і власник не
// хоче отримувати алерти чи псувати uptime% в звітах.

import { useState } from "react";

interface Props {
  siteId: string;
  accessToken: string;
  initialEnabled: boolean;
  workerUrl: string;
}

export function MonitoringPauseToggle({ siteId, accessToken, initialEnabled, workerUrl }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/monitoring`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json() as { ok?: boolean; enabled?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Помилка збереження");
        return;
      }
      setEnabled(data.enabled ?? next);
    } catch {
      setError("Мережева помилка");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
        padding: "14px 16px", borderRadius: 12,
        background: enabled ? "rgba(255,255,255,0.02)" : "rgba(110,110,115,0.08)",
        border: "1px solid",
        borderColor: enabled ? "rgba(255,255,255,0.07)" : "rgba(255,255,255,0.12)",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
            {enabled ? "Моніторинг активний" : "Моніторинг призупинено"}
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            {enabled
              ? "Перевірки кожні 5 хв, алерти працюють як завжди"
              : "Перевірки не виконуються, алерти не надходять. Дані попередніх перевірок збережено."}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={saving}
          style={{
            fontSize: 12,
            fontWeight: 600,
            padding: "7px 14px",
            borderRadius: 8,
            cursor: saving ? "not-allowed" : "pointer",
            border: "1px solid",
            transition: "all 0.15s",
            opacity: saving ? 0.6 : 1,
            whiteSpace: "nowrap",
            background: enabled ? "rgba(245,103,90,0.08)" : "rgba(214,255,63,0.1)",
            borderColor: enabled ? "rgba(245,103,90,0.25)" : "rgba(214,255,63,0.25)",
            color: enabled ? "#F5675A" : "var(--lime)",
          }}
        >
          {saving ? "..." : enabled ? "Призупинити" : "Відновити"}
        </button>
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: "#F5675A" }}>{error}</p>}
    </div>
  );
}
