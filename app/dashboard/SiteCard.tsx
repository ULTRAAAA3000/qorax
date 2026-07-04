"use client";

import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { useState } from "react";

export function SiteCard({
  site,
  index,
}: {
  site: {
    id: string; url: string; display_name: string; monitoring_enabled: boolean; created_at: string;
    isDown?: boolean; inMaintenance?: boolean;
  };
  index: number;
}) {
  const [hovered, setHovered] = useState(false);
  const [faviconFailed, setFaviconFailed] = useState(false);

  let hostname = site.url;
  try { hostname = new URL(site.url).hostname; } catch { /* keep */ }

  const addedDate = new Date(site.created_at).toLocaleDateString("uk-UA", {
    day: "numeric", month: "short", year: "numeric",
  });

  const isDown = !!site.isDown;
  const inMaintenance = !!site.inMaintenance;

  const dotColor = !site.monitoring_enabled
    ? "var(--text-tertiary)"
    : isDown ? "#F5675A"
    : inMaintenance ? "#F5A623"
    : "var(--lime)";

  const glowColor = site.monitoring_enabled && !isDown && !inMaintenance
    ? index % 2 === 0 ? "rgba(214,255,63,0.35)" : "rgba(140,246,255,0.35)"
    : isDown ? "rgba(245,103,90,0.35)"
    : "transparent";

  return (
    <div
      className="rounded-2xl p-5 flex items-center justify-between gap-4 transition-all duration-200"
      style={{
        background: hovered ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.025)",
        border: `1px solid ${hovered ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.07)"}`,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-4 min-w-0">
        <div className="relative shrink-0">
          {!faviconFailed ? (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center overflow-hidden"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- зовнішній favicon, не потребує оптимізації next/image */}
              <img
                src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`}
                alt=""
                width={20}
                height={20}
                onError={() => setFaviconFailed(true)}
              />
            </div>
          ) : (
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center text-xs font-semibold"
              style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}
            >
              {site.display_name.charAt(0).toUpperCase()}
            </div>
          )}
          <div
            className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
            style={{
              background: dotColor,
              boxShadow: `0 0 6px ${glowColor}`,
              border: "2px solid var(--bg)",
            }}
          />
          {site.monitoring_enabled && !isDown && !inMaintenance && (
            <div
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-ping"
              style={{ background: "var(--lime)", opacity: 0.3 }}
            />
          )}
          {isDown && (
            <div
              className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full animate-ping"
              style={{ background: "#F5675A", opacity: 0.4 }}
            />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-medium text-[var(--text-primary)] truncate">{site.display_name}</span>
            {isDown && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: "rgba(245,103,90,0.12)", color: "#F5675A" }}>
                Недоступний
              </span>
            )}
            {!isDown && inMaintenance && (
              <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-md"
                style={{ background: "rgba(245,166,35,0.12)", color: "#F5A623" }}>
                Обслуговування
              </span>
            )}
          </div>
          <div className="text-xs text-[var(--text-tertiary)] font-mono mt-0.5 truncate">{hostname}</div>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="text-xs text-[var(--text-tertiary)] hidden sm:block">{addedDate}</span>
        <a
          href={site.url}
          target="_blank"
          rel="noopener noreferrer"
          className="h-8 w-8 flex items-center justify-center rounded-lg transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-white/5"
        >
          <ExternalLink size={13} />
        </a>
        <Link
          href={`/dashboard/sites/${site.id}`}
          className="text-sm font-medium px-4 py-2 rounded-xl transition-all"
          style={{
            background: "rgba(255,255,255,0.05)",
            border: "1px solid rgba(255,255,255,0.08)",
            color: "var(--cyan)",
          }}
        >
          Деталі →
        </Link>
      </div>
    </div>
  );
}
