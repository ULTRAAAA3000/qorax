"use client";

// ─── StatusPageSection ────────────────────────────────────────
// Секція в дашборді сайту для керування публічною сторінкою статусу.
// Growth+ фіча: увімкнути, скопіювати посилання, кастомний slug.

import { useState } from "react";

interface Props {
  siteId: string;
  accessToken: string;
  initialEnabled: boolean;
  initialSlug: string | null;
  workerUrl: string;
  appUrl: string;
}

export function StatusPageSection({ siteId, accessToken, initialEnabled, initialSlug, workerUrl, appUrl }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [slug, setSlug] = useState<string | null>(initialSlug);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const statusUrl = slug ? `${appUrl}/status/${slug}` : null;

  const toggle = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/status-page`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ enabled: !enabled }),
      });
      const data = await res.json() as { ok: boolean; slug?: string; enabled?: boolean; error?: string };
      if (!data.ok) { setError(data.error ?? "Помилка"); return; }
      setEnabled(data.enabled ?? !enabled);
      if (data.slug) setSlug(data.slug);
    } catch {
      setError("Мережева помилка");
    } finally {
      setLoading(false);
    }
  };

  const copyLink = () => {
    if (!statusUrl) return;
    navigator.clipboard.writeText(statusUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  // Загальний стиль кнопки
  const btnStyle = (active: boolean, danger = false): React.CSSProperties => ({
    fontSize: 12,
    fontWeight: 600,
    padding: "7px 14px",
    borderRadius: 8,
    cursor: loading ? "not-allowed" : "pointer",
    border: "1px solid",
    transition: "all 0.15s",
    opacity: loading ? 0.6 : 1,
    background: danger
      ? "rgba(245,103,90,0.08)"
      : active
      ? "rgba(214,255,63,0.1)"
      : "rgba(255,255,255,0.05)",
    borderColor: danger
      ? "rgba(245,103,90,0.25)"
      : active
      ? "rgba(214,255,63,0.25)"
      : "rgba(255,255,255,0.1)",
    color: danger ? "#F5675A" : active ? "var(--lime)" : "var(--text-secondary)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Статус + кнопка toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        borderRadius: 12,
        background: enabled
          ? "rgba(214,255,63,0.04)"
          : "rgba(255,255,255,0.02)",
        border: "1px solid",
        borderColor: enabled
          ? "rgba(214,255,63,0.12)"
          : "rgba(255,255,255,0.07)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: enabled ? "#d6ff3f" : "rgba(255,255,255,0.2)",
            boxShadow: enabled ? "0 0 8px rgba(214,255,63,0.6)" : "none",
          }} />
          <div>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)" }}>
              {enabled ? "Сторінка активна" : "Сторінка вимкнена"}
            </p>
            {slug && enabled && (
              <p style={{ margin: "2px 0 0", fontSize: 11, color: "var(--text-tertiary)", fontFamily: "monospace" }}>
                /status/{slug}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={toggle}
          disabled={loading}
          style={btnStyle(!enabled, enabled)}
        >
          {loading ? "..." : enabled ? "Вимкнути" : "Увімкнути"}
        </button>
      </div>

      {error && (
        <p style={{ margin: 0, fontSize: 12, color: "#F5675A" }}>{error}</p>
      )}

      {/* Якщо увімкнено — показуємо посилання */}
      {enabled && statusUrl && (
        <>
          {/* Посилання + кнопки дій */}
          <div style={{
            padding: "14px 16px",
            borderRadius: 12,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <p style={{ margin: "0 0 10px", fontSize: 11, fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Публічне посилання
            </p>
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <code style={{
                flex: 1,
                fontSize: 12,
                padding: "8px 12px",
                borderRadius: 8,
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "var(--text-secondary)",
                wordBreak: "break-all",
                fontFamily: "monospace",
              }}>
                {statusUrl}
              </code>
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={copyLink} style={btnStyle(copied)}>
                  {copied ? "Скопійовано ✓" : "Копіювати"}
                </button>
                <a
                  href={statusUrl}
                  target="_blank"
                  rel="noopener"
                  style={{
                    ...btnStyle(false),
                    textDecoration: "none",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                  }}
                >
                  Відкрити ↗
                </a>
              </div>
            </div>
          </div>

          {/* Підказка */}
          <div style={{
            padding: "12px 14px",
            borderRadius: 10,
            background: "rgba(140,246,255,0.04)",
            border: "1px solid rgba(140,246,255,0.1)",
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", lineHeight: 1.6 }}>
              💡 Надішліть це посилання клієнтам або партнерам — вони бачать живий uptime, інциденти і час відповіді без доступу до вашого дашборду
            </p>
          </div>
        </>
      )}

    </div>
  );
}
