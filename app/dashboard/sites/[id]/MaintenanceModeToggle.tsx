"use client";

// ─── MaintenanceModeToggle ─────────────────────────────────────
// Дозволяє власнику сайту увімкнути "планове обслуговування" на
// фіксований час — на цей період не створюються інциденти і не
// шлються алерти, хоча перевірки продовжуються.

import { useState, useEffect, useCallback } from "react";

interface Props {
  siteId: string;
  accessToken: string;
  initialMaintenanceUntil: string | null;
  workerUrl: string;
}

const DURATIONS = [
  { label: "30 хв", minutes: 30 },
  { label: "1 год", minutes: 60 },
  { label: "4 год", minutes: 240 },
  { label: "24 год", minutes: 1440 },
];

function fmtRemaining(untilIso: string): string {
  const ms = new Date(untilIso).getTime() - Date.now();
  if (ms <= 0) return "закінчується...";
  const totalMin = Math.ceil(ms / 60000);
  if (totalMin < 60) return `${totalMin} хв`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}

export function MaintenanceModeToggle({ siteId, accessToken, initialMaintenanceUntil, workerUrl }: Props) {
  const [maintenanceUntil, setMaintenanceUntil] = useState<string | null>(initialMaintenanceUntil);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);

  // Обчислюємо isActive лише на клієнті (useEffect), щоб не викликати
  // Date.now() під час рендеру (react-hooks/purity) і уникнути
  // розбіжності SSR/CSR.
  useEffect(() => {
    function recompute() {
      setIsActive(maintenanceUntil != null && new Date(maintenanceUntil).getTime() > Date.now());
    }
    recompute();
    const id = setInterval(recompute, 60000);
    return () => clearInterval(id);
  }, [maintenanceUntil]);

  const patch = useCallback(async (durationMinutes: number | null) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/maintenance`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ durationMinutes }),
      });
      const data = await res.json() as { ok?: boolean; maintenanceUntil?: string | null; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Помилка збереження");
        return;
      }
      setMaintenanceUntil(data.maintenanceUntil ?? null);
    } catch {
      setError("Мережева помилка");
    } finally {
      setSaving(false);
    }
  }, [siteId, accessToken, workerUrl]);

  const btnStyle = (variant: "default" | "danger" = "default"): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "7px 14px",
    borderRadius: 8,
    cursor: saving ? "not-allowed" : "pointer",
    border: "1px solid",
    transition: "all 0.15s",
    opacity: saving ? 0.6 : 1,
    background: variant === "danger" ? "rgba(245,103,90,0.08)" : "rgba(255,255,255,0.04)",
    borderColor: variant === "danger" ? "rgba(245,103,90,0.25)" : "rgba(255,255,255,0.1)",
    color: variant === "danger" ? "#F5675A" : "var(--text-secondary)",
  });

  if (isActive && maintenanceUntil) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
          padding: "14px 16px", borderRadius: 12,
          background: "rgba(245,166,35,0.06)",
          border: "1px solid rgba(245,166,35,0.25)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: "50%",
              background: "#F5A623", boxShadow: "0 0 8px rgba(245,166,35,0.6)",
            }} />
            <div>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#F5A623" }}>
                На обслуговуванні
              </p>
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
                Залишилось: {fmtRemaining(maintenanceUntil)} · алерти вимкнено
              </p>
            </div>
          </div>
          <button onClick={() => patch(null)} disabled={saving} style={btnStyle("danger")}>
            {saving ? "..." : "Завершити"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{
        padding: "14px 16px", borderRadius: 12,
        background: "rgba(255,255,255,0.02)",
        border: "1px solid rgba(255,255,255,0.07)",
      }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
          Плануєте технічні роботи?
        </p>
        <p style={{ margin: "0 0 12px", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
          Увімкніть режим обслуговування — перевірки триватимуть, але простій не позначиться як інцидент і алерти не надійдуть.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DURATIONS.map(d => (
            <button key={d.minutes} onClick={() => patch(d.minutes)} disabled={saving} style={btnStyle()}>
              {saving ? "..." : d.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p style={{ margin: 0, fontSize: 12, color: "#F5675A" }}>{error}</p>}
    </div>
  );
}
