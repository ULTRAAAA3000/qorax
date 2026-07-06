"use client";

// ─── AlertThresholdSettings ────────────────────────────────────
// Дозволяє власнику сайту задати власний поріг часу відповіді.
// Якщо жива перевірка (кожні 5 хв) перевищує поріг — надсилається
// алерт email/Telegram/Slack (не частіше разу на годину на сайт).

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface SiblingSite {
  id: string;
  display_name: string;
}

interface Props {
  siteId: string;
  accessToken: string;
  initialThresholdMs: number | null;
  workerUrl: string;
  siblingSites?: SiblingSite[];
}

const PRESETS = [1000, 2000, 3000, 5000];

export function AlertThresholdSettings({ siteId, accessToken, initialThresholdMs, workerUrl, siblingSites = [] }: Props) {
  const [enabled, setEnabled] = useState(initialThresholdMs != null);
  const [thresholdMs, setThresholdMs] = useState<number>(initialThresholdMs ?? 2000);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copyMenuOpen, setCopyMenuOpen] = useState(false);
  const [copyState, setCopyState] = useState<Record<string, "idle" | "loading" | "done" | "error">>({});

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

  async function copyThresholdToSite(targetSiteId: string) {
    setCopyState(prev => ({ ...prev, [targetSiteId]: "loading" }));
    try {
      const res = await fetch(`${workerUrl}/api/sites/${targetSiteId}/alert-threshold`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ thresholdMs: enabled ? thresholdMs : null }),
      });
      const data = await res.json() as { ok?: boolean };
      setCopyState(prev => ({ ...prev, [targetSiteId]: data.ok ? "done" : "error" }));
    } catch {
      setCopyState(prev => ({ ...prev, [targetSiteId]: "error" }));
    }
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

      {siblingSites.length > 0 && (
        <div style={{ position: "relative" }}>
          <button
            onClick={() => setCopyMenuOpen(o => !o)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12,
              fontWeight: 500,
              padding: "6px 10px",
              borderRadius: 8,
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.02)",
              color: "var(--text-tertiary)",
            }}
          >
            <Copy size={11} />
            Скопіювати поріг на інші сайти
          </button>

          {copyMenuOpen && (
            <div style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              zIndex: 20,
              minWidth: 220,
              maxHeight: 240,
              overflowY: "auto",
              borderRadius: 12,
              padding: 6,
              background: "#12161f",
              border: "1px solid rgba(255,255,255,0.1)",
              boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
            }}>
              {siblingSites.map(s => {
                const state = copyState[s.id] ?? "idle";
                return (
                  <button
                    key={s.id}
                    onClick={() => copyThresholdToSite(s.id)}
                    disabled={state === "loading" || state === "done"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      fontSize: 12.5,
                      padding: "7px 10px",
                      borderRadius: 8,
                      border: "none",
                      background: "transparent",
                      color: state === "done" ? "var(--lime)" : "var(--text-secondary)",
                      cursor: state === "loading" || state === "done" ? "default" : "pointer",
                    }}
                  >
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.display_name}</span>
                    {state === "loading" && <span style={{ fontSize: 11, color: "var(--text-tertiary)" }}>...</span>}
                    {state === "done" && <Check size={13} />}
                    {state === "error" && <span style={{ fontSize: 11, color: "#F5675A" }}>помилка</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
