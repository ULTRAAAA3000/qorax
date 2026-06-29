"use client";

// ─── UptimeBadgeSection ────────────────────────────────────────
// Показує прев'ю SVG-бейджа і embed-код (HTML / Markdown)
// для розміщення на сайті клієнта.

import { useState } from "react";

export function UptimeBadgeSection({ siteId }: { siteId: string }) {
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"html" | "md">("html");

  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
  const badgeUrl = `${workerUrl}/api/badge/${siteId}`;

  const htmlCode = `<a href="https://qorax.app" target="_blank" rel="noopener">\n  <img src="${badgeUrl}" alt="Monitored by Qorax" height="24" />\n</a>`;
  const mdCode = `[![Monitored by Qorax](${badgeUrl})](https://qorax.app)`;
  const code = tab === "html" ? htmlCode : mdCode;

  const copy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* Preview */}
      <div style={{
        background: "rgba(214,255,63,0.04)",
        border: "1px solid rgba(214,255,63,0.12)",
        borderRadius: 12,
        padding: "14px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div>
          <p style={{ margin: "0 0 8px", fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
            Прев&apos;ю
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={badgeUrl} alt="Monitored by Qorax" height={24} style={{ display: "block" }} />
        </div>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-tertiary)", maxWidth: 220, lineHeight: 1.55 }}>
          Розмістіть на своєму сайті — бейдж показує живий uptime за останні 7 днів і оновлюється автоматично
        </p>
      </div>

      {/* Format tabs */}
      <div style={{ display: "flex", gap: 6 }}>
        {(["html", "md"] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              fontSize: 11,
              fontWeight: 600,
              padding: "4px 10px",
              borderRadius: 6,
              cursor: "pointer",
              background: tab === t ? "rgba(255,255,255,0.08)" : "transparent",
              border: "1px solid",
              borderColor: tab === t ? "rgba(255,255,255,0.12)" : "transparent",
              color: tab === t ? "var(--text-primary)" : "var(--text-tertiary)",
              transition: "all 0.15s",
            }}
          >
            {t === "html" ? "HTML" : "Markdown"}
          </button>
        ))}
      </div>

      {/* Code block */}
      <div style={{ position: "relative" }}>
        <pre style={{
          margin: 0,
          padding: "14px 16px",
          paddingRight: 100,
          borderRadius: 10,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
          fontSize: 12,
          fontFamily: "'Courier New', monospace",
          color: "var(--text-secondary)",
          overflowX: "auto",
          lineHeight: 1.6,
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}>
          {code}
        </pre>
        <button
          onClick={copy}
          style={{
            position: "absolute",
            top: 10,
            right: 10,
            fontSize: 11,
            fontWeight: 600,
            padding: "4px 10px",
            borderRadius: 6,
            cursor: "pointer",
            background: copied ? "rgba(214,255,63,0.12)" : "rgba(255,255,255,0.06)",
            border: "1px solid",
            borderColor: copied ? "rgba(214,255,63,0.25)" : "rgba(255,255,255,0.1)",
            color: copied ? "var(--lime)" : "var(--text-secondary)",
            transition: "all 0.15s",
            whiteSpace: "nowrap",
          }}
        >
          {copied ? "Скопійовано ✓" : "Копіювати"}
        </button>
      </div>

    </div>
  );
}
