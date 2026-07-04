"use client";

// ─── AlertThresholdSettings ────────────────────────────────────
// Дозволяє власнику сайту задати власний поріг часу відповіді.
// Якщо жива перевірка (кожні 5 хв) перевищує поріг — надсилається
// алерт email/Telegram/Slack (не частіше разу на годину на сайт).

import { useState } from "react";

interface Props {
  siteId: string;
  accessToken: string;
  initialThresholdMs: number | null;
  workerUrl: string;
}

const PRESETS = [1000, 2000, 3000, 5000];

export function AlertThresholdSettings({ siteId, accessToken, initialThresholdMs, workerUrl }: Props) {
  const [enabled, setEnabled] = useState(initialThresholdMs != null);
  const [thresholdMs, setThresholdMs] = useState<number>(initialThresholdMs ?? 2000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextEnabled: boolean, nextThreshold: number) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/alert-threshold`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ thresholdMs: nextEnabled ? nextThreshold : null }),
      });
      const data = await res.json() as { ok?: boolean; thresholdMs?: number | null; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Помилка збереження");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Мережева помилка");
    } finally {
      setSaving(false);
    }
  }

  function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    save(next, thresholdMs);
  }

  function handlePresetClick(ms: number) {
    setThresholdMs(ms);
    if (enabled) save(true, ms);
  }

  const btnStyle = (active: boolean): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "6px 12px",
    borderRadius: 8,
    cursor: saving ? "not-allowed" : "pointer",
    border: "1px solid",
    transition: "all 0.15s",
    opacity: saving ? 0.6 : 1,
    background: active ? "rgba(214,255,63,0.12)" : "rgba(255,255,255,0.04)",
    borderColor: active ? "rgba(214,255,63,0.3)" : "rgba(255,255,255,0.08)",
    color: active ? "var(--lime)" : "var(--text-secondary)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: enabled ? "rgba(214,255,63,0.04)" : "rgba(255,255,255,0.02)",
        border: "1px solid",
        borderColor: enabled ? "rgba(214,255,63,0.12)" : "rgba(255,255,255,0.07)",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
            Алерт при повільній відповіді
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-tertiary)" }}>
            {enabled
              ? `Сповістимо, якщо відповідь перевищить ${thresholdMs >= 1000 ? `${(thresholdMs / 1000).toFixed(1)}с` : `${thresholdMs}мс`}`
              : "Вимкнено — сповіщення лише при повній недоступності"}
          </p>
        </div>
        <button onClick={handleToggle} disabled={saving} style={btnStyle(enabled)}>
          {saving ? "..." : enabled ? "Увімкнено" : "Увімкнути"}
        </button>
      </div>

      {enabled && (
        <div style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Поріг часу відповіді
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {PRESETS.map((ms) => (
              <button key={ms} onClick={() => handlePresetClick(ms)} style={btnStyle(thresholdMs === ms)}>
                {ms >= 1000 ? `${(ms / 1000).toFixed(0)}с` : `${ms}мс`}
              </button>
            ))}
          </div>
          <p style={{ margin: "10px 0 0", fontSize: 11, color: "var(--text-tertiary)", lineHeight: 1.5 }}>
            Перевірка кожні 5 хв. Не більше одного сповіщення на годину.
          </p>
        </div>
      )}

      {error && <p style={{ margin: 0, fontSize: 12, color: "#F5675A" }}>{error}</p>}
      {saved && <p style={{ margin: 0, fontSize: 12, color: "var(--lime)" }}>✓ Збережено</p>}
    </div>
  );
}
