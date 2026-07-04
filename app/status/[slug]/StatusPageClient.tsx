"use client";

// ─── StatusPageClient ─────────────────────────────────────────
// Публічна сторінка статусу сайту клієнта.
// Cyber Minimal стиль — темний фон, lime/red акценти, без navbar.

import { useState } from "react";

interface Incident {
  id: string;
  started_at: string;
  resolved_at: string | null;
  duration_seconds: number | null;
}

interface StatusData {
  site: { displayName: string; url: string };
  currentStatus: "up" | "down" | "unknown";
  historyDays: number;
  uptimePct7d: number;
  avgSpeedMs: number | null;
  dailyUptime: Array<{ date: string; pct: number; checks: number }>;
  incidents: Incident[];
  ssl: { daysLeft: number | null; validUntil: string | null } | null;
  whiteLabel: { companyName: string | null; logoUrl: string | null } | null;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} хв`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}

function fmtDatetime(iso: string): string {
  return new Date(iso).toLocaleString("uk-UA", {
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", {
    weekday: "short", day: "numeric", month: "short",
  });
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)} с` : `${ms} мс`;
}

// ─── Components ───────────────────────────────────────────────

function StatusBadge({ status }: { status: "up" | "down" | "unknown" }) {
  const cfg = {
    up: { color: "#d6ff3f", bg: "rgba(214,255,63,0.08)", border: "rgba(214,255,63,0.2)", dot: "#d6ff3f", label: "Працює" },
    down: { color: "#F5675A", bg: "rgba(245,103,90,0.1)", border: "rgba(245,103,90,0.3)", dot: "#F5675A", label: "Недоступний" },
    unknown: { color: "#6e6e73", bg: "rgba(255,255,255,0.04)", border: "rgba(255,255,255,0.08)", dot: "#6e6e73", label: "Невідомо" },
  }[status];

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "8px 16px", borderRadius: 100,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: "50%",
        background: cfg.dot,
        boxShadow: status === "up" ? `0 0 8px ${cfg.dot}` : status === "down" ? `0 0 8px ${cfg.dot}` : "none",
        animation: status !== "unknown" ? "pulse 2s ease-in-out infinite" : "none",
      }} />
      <span style={{ fontSize: 14, fontWeight: 600, color: cfg.color }}>{cfg.label}</span>
    </div>
  );
}

function UptimeBar({ days }: { days: Array<{ date: string; pct: number; checks: number }> }) {
  const [hovered, setHovered] = useState<number | null>(null);

  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 40 }}>
        {days.map((day, i) => {
          const color = day.checks === 0
            ? "rgba(255,255,255,0.08)"
            : day.pct >= 99.5 ? "#d6ff3f"
            : day.pct >= 95 ? "#F5A623"
            : "#F5675A";
          const height = day.checks === 0 ? 16 : Math.max(12, (day.pct / 100) * 40);

          return (
            <div
              key={day.date}
              style={{ flex: 1, position: "relative", cursor: "default" }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
            >
              {hovered === i && (
                <div style={{
                  position: "absolute",
                  bottom: "calc(100% + 8px)",
                  left: "50%",
                  transform: "translateX(-50%)",
                  background: "#1a1a1a",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 8,
                  padding: "6px 10px",
                  whiteSpace: "nowrap",
                  zIndex: 10,
                  pointerEvents: "none",
                }}>
                  <p style={{ margin: 0, fontSize: 11, color: "#f5f5f7", fontWeight: 600 }}>
                    {fmtDate(day.date)}
                  </p>
                  <p style={{ margin: "2px 0 0", fontSize: 11, color: color }}>
                    {day.checks === 0 ? "Немає даних" : `${day.pct.toFixed(2)}%`}
                  </p>
                </div>
              )}
              <div style={{
                width: "100%",
                height,
                borderRadius: 3,
                background: color,
                transition: "opacity 0.15s",
                opacity: hovered !== null && hovered !== i ? 0.4 : 1,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{
        display: "flex", justifyContent: "space-between",
        marginTop: 6,
      }}>
        <span style={{ fontSize: 10, color: "#6e6e73" }}>{days.length} днів тому</span>
        <span style={{ fontSize: 10, color: "#6e6e73" }}>Сьогодні</span>
      </div>
    </div>
  );
}

function IncidentRow({ incident }: { incident: Incident }) {
  const isOpen = !incident.resolved_at;
  const duration = incident.duration_seconds
    ? fmtDuration(incident.duration_seconds)
    : isOpen
    ? `${Math.round((Date.now() - new Date(incident.started_at).getTime()) / 60000)} хв (триває)`
    : "—";

  return (
    <div style={{
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      padding: "14px 0",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        <div style={{
          width: 8, height: 8, borderRadius: "50%", flexShrink: 0, marginTop: 4,
          background: isOpen ? "#F5675A" : "rgba(255,255,255,0.2)",
          boxShadow: isOpen ? "0 0 6px rgba(245,103,90,0.6)" : "none",
        }} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            {isOpen && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                padding: "1px 6px", borderRadius: 20,
                background: "rgba(245,103,90,0.15)", color: "#F5675A",
                textTransform: "uppercase", letterSpacing: "0.05em",
              }}>Активний</span>
            )}
            <span style={{ fontSize: 12, color: "#6e6e73" }}>
              {fmtDatetime(incident.started_at)}
            </span>
          </div>
          {incident.resolved_at && (
            <span style={{ fontSize: 12, color: "#d6ff3f" }}>
              ↳ Відновлено {fmtDatetime(incident.resolved_at)}
            </span>
          )}
        </div>
      </div>
      <span style={{
        fontSize: 13, fontWeight: 600, flexShrink: 0,
        color: isOpen ? "#F5675A" : "#a1a1a6",
      }}>
        {duration}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export function StatusPageClient({ data }: { data: StatusData }) {
  const {
    site, currentStatus, historyDays, uptimePct7d, avgSpeedMs,
    dailyUptime, incidents, ssl, whiteLabel, generatedAt,
  } = data;

  const brandName = whiteLabel?.companyName || "Qorax";
  const brandLogoUrl = whiteLabel?.logoUrl ?? null;

  const uptimeColor = uptimePct7d >= 99.5 ? "#d6ff3f" : uptimePct7d >= 98 ? "#F5A623" : "#F5675A";
  const openIncident = incidents.find(i => !i.resolved_at);

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#f5f5f7", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Header */}
      <header style={{
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        padding: "16px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        maxWidth: 720,
        margin: "0 auto",
      }}>
        <a href={whiteLabel ? undefined : "https://qorax.app"} target={whiteLabel ? undefined : "_blank"} rel={whiteLabel ? undefined : "noopener"} style={{
          fontSize: 13, fontWeight: 700, color: "#f5f5f7",
          textDecoration: "none", letterSpacing: "-0.02em",
          display: "flex", alignItems: "center", gap: 8,
          cursor: whiteLabel ? "default" : "pointer",
        }}>
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={brandLogoUrl} alt={brandName} style={{ height: 22, maxWidth: 140, objectFit: "contain" }} />
          ) : (
            brandName
          )}
        </a>
        <span style={{ fontSize: 12, color: "#6e6e73" }}>
          Сторінка статусу
        </span>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "40px 24px 80px" }}>

        {/* Site name + status */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
            <div>
              <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" }}>
                {site.displayName}
              </h1>
              <a
                href={site.url.startsWith("http") ? site.url : `https://${site.url}`}
                target="_blank"
                rel="noopener"
                style={{ fontSize: 13, color: "#6e6e73", textDecoration: "none", fontFamily: "monospace" }}
              >
                {site.url}
              </a>
            </div>
            <StatusBadge status={currentStatus} />
          </div>

          {/* Активний інцидент — попередження */}
          {openIncident && (
            <div style={{
              marginTop: 16,
              padding: "14px 16px",
              borderRadius: 12,
              background: "rgba(245,103,90,0.08)",
              border: "1px solid rgba(245,103,90,0.25)",
            }}>
              <p style={{ margin: 0, fontSize: 14, color: "#F5675A", fontWeight: 500 }}>
                ⚠ Наразі спостерігаються проблеми з доступністю сайту
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 12, color: "#a1a1a6" }}>
                Ми стежимо за ситуацією та повідомимо про відновлення
              </p>
            </div>
          )}
        </div>

        {/* Uptime + Speed + SSL — статистика */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginBottom: 32 }}>
          <div style={{
            padding: "16px", borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Uptime {historyDays} днів
            </p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: uptimeColor, letterSpacing: "-0.02em" }}>
              {uptimePct7d.toFixed(2)}%
            </p>
          </div>

          <div style={{
            padding: "16px", borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Відповідь (24 год)
            </p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color: !avgSpeedMs ? "#6e6e73" : avgSpeedMs <= 1500 ? "#d6ff3f" : avgSpeedMs <= 3000 ? "#F5A623" : "#F5675A", letterSpacing: "-0.02em" }}>
              {avgSpeedMs ? fmtMs(avgSpeedMs) : "—"}
            </p>
          </div>

          <div style={{
            padding: "16px", borderRadius: 14,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}>
            <p style={{ margin: "0 0 6px", fontSize: 11, color: "#6e6e73", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              SSL
            </p>
            <p style={{ margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", color: !ssl ? "#6e6e73" : (ssl.daysLeft ?? 0) > 30 ? "#d6ff3f" : (ssl.daysLeft ?? 0) > 7 ? "#F5A623" : "#F5675A" }}>
              {ssl ? (ssl.daysLeft === 999 || (ssl.daysLeft ?? 0) > 0 ? `${ssl.daysLeft}д` : "Прострочений") : "—"}
            </p>
          </div>
        </div>

        {/* Uptime по днях */}
        <div style={{
          padding: "20px", borderRadius: 14, marginBottom: 24,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <p style={{ margin: "0 0 16px", fontSize: 13, fontWeight: 600, color: "#f5f5f7" }}>
            Доступність за {historyDays} днів
          </p>
          <UptimeBar days={dailyUptime} />
        </div>

        {/* Incidents */}
        <div style={{
          padding: "20px", borderRadius: 14, marginBottom: 32,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <p style={{ margin: "0 0 4px", fontSize: 13, fontWeight: 600, color: "#f5f5f7" }}>
            Інциденти за 30 днів
          </p>
          {incidents.length === 0 ? (
            <div style={{ paddingTop: 16 }}>
              <p style={{ margin: 0, fontSize: 13, color: "#d6ff3f" }}>
                ✓ Жодного інциденту
              </p>
            </div>
          ) : (
            <div>
              {incidents.map(inc => (
                <IncidentRow key={inc.id} incident={inc} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center" }}>
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "#6e6e73" }}>
            Дані оновлюються кожну хвилину
          </p>
          <p style={{ margin: 0, fontSize: 12, color: "#444" }}>
            {whiteLabel ? (
              <>Моніторинг забезпечується <span style={{ color: "#8cf6ff" }}>{brandName}</span></>
            ) : (
              <>
                Моніторинг забезпечується{" "}
                <a href="https://qorax.app" target="_blank" rel="noopener" style={{ color: "#d6ff3f", textDecoration: "none" }}>
                  Qorax
                </a>
              </>
            )}
            {" "}· Оновлено {new Date(generatedAt).toLocaleString("uk-UA", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

      </main>
    </div>
  );
}
