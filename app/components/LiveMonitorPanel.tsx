"use client";

/**
 * LiveMonitorPanel — glassmorphism dashboard preview card with glow
 * border effect. Shows a realistic monitoring UI slice.
 */

import { motion, useReducedMotion } from "motion/react";
import type { Locale } from "@/app/lib/i18n";

type CheckRow = {
  id: string;
  label: string;
  detail: string;
  status: "ok" | "warn" | "running";
  value: string;
};

const ROWS: Record<Locale, CheckRow[]> = {
  uk: [
    { id: "uptime", label: "Uptime", detail: "qorax-client.com.ua", status: "ok", value: "99.98%" },
    { id: "speed", label: "Швидкість", detail: "Largest Contentful Paint", status: "ok", value: "1.2s" },
    { id: "ssl", label: "SSL сертифікат", detail: "діє ще", status: "ok", value: "84 дні" },
    { id: "links", label: "Биті посилання", detail: "сканування сторінок", status: "running", value: "—" },
    { id: "mobile", label: "Мобільна версія", detail: "viewport, тап-таргети", status: "ok", value: "Готово" },
  ],
  en: [
    { id: "uptime", label: "Uptime", detail: "qorax-client.com", status: "ok", value: "99.98%" },
    { id: "speed", label: "Speed", detail: "Largest Contentful Paint", status: "ok", value: "1.2s" },
    { id: "ssl", label: "SSL certificate", detail: "valid for", status: "ok", value: "84 days" },
    { id: "links", label: "Broken links", detail: "scanning pages", status: "running", value: "—" },
    { id: "mobile", label: "Mobile version", detail: "viewport, tap targets", status: "ok", value: "Done" },
  ],
};

const STATUS_COLOR: Record<CheckRow["status"], string> = {
  ok: "var(--lime)",
  warn: "#F5A623",
  running: "var(--cyan)",
};

const COPY: Record<Locale, { domain: string; live: string; footerLabel: string; footerStatus: string }> = {
  uk: { domain: "qorax-client.com.ua", live: "live", footerLabel: "5 перевірок щохвилини", footerStatus: "усе в нормі" },
  en: { domain: "qorax-client.com", live: "live", footerLabel: "5 checks every minute", footerStatus: "all good" },
};

export function LiveMonitorPanel({ lang = "uk" }: { lang?: Locale }) {
  const reduceMotion = useReducedMotion();
  const rows = ROWS[lang];
  const t = COPY[lang];

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 60px rgba(140, 246, 255, 0.05), 0 20px 60px rgba(0, 0, 0, 0.3)",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
          </div>
          <span className="font-mono text-xs text-[var(--text-tertiary)]">{t.domain}</span>
        </div>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--lime)] animate-pulse-glow" />
          {t.live}
        </span>
      </div>

      {/* Rows */}
      <div>
        {rows.map((row, i) => (
          <motion.div
            key={row.id}
            className="flex items-center gap-3 px-5 py-3.5"
            style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(255, 255, 255, 0.04)" : "none" }}
            initial={reduceMotion ? undefined : { opacity: 0, x: -8 }}
            animate={reduceMotion ? undefined : { opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: 0.08 + i * 0.07, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="relative flex h-2 w-2 shrink-0">
              {row.status === "running" && !reduceMotion && (
                <motion.span
                  className="absolute inline-flex h-full w-full rounded-full"
                  style={{ background: STATUS_COLOR[row.status] }}
                  animate={{ scale: [1, 2.2], opacity: [0.6, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
                />
              )}
              <span
                className="relative inline-flex h-2 w-2 rounded-full"
                style={{ background: STATUS_COLOR[row.status] }}
              />
            </span>

            <div className="flex-1 min-w-0">
              <div className="text-sm text-[var(--text-primary)] font-medium leading-tight">
                {row.label}
              </div>
              <div className="text-xs text-[var(--text-tertiary)] leading-tight mt-0.5">
                {row.detail}
              </div>
            </div>

            <span className="font-mono text-xs tabular text-[var(--text-secondary)] shrink-0">
              {row.value}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Footer */}
      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          background: "rgba(255, 255, 255, 0.02)",
        }}
      >
        <span className="text-xs text-[var(--text-secondary)]">{t.footerLabel}</span>
        <span className="font-mono text-xs flex items-center gap-1.5" style={{ color: "var(--lime)" }}>
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--lime)]" />
          {t.footerStatus}
        </span>
      </div>
    </div>
  );
}
