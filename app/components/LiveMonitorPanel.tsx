"use client";

/**
 * LiveMonitorPanel — the hero's real subject: a believable slice of the
 * actual Qorax product UI, not an abstract illustration.
 *
 * Modeled after Linear's homepage technique: show the tool doing its job
 * (an issue list, a diff, a dashboard) rather than an icon representing
 * the idea of the tool. Here: a checks list with live status + a tiny
 * inline sparkline, exactly what a Starter/Growth dashboard would render.
 *
 * Motion is restrained and purposeful: a status dot pulses only on the
 * one row currently "running" (state indication), rows fade in once on
 * mount (entrance, not loop). Nothing spins for decoration.
 */

import { motion, useReducedMotion } from "motion/react";

type CheckRow = {
  id: string;
  label: string;
  detail: string;
  status: "ok" | "warn" | "running";
  value: string;
};

const ROWS: CheckRow[] = [
  { id: "uptime", label: "Uptime", detail: "qorax-client.com.ua", status: "ok", value: "99.98%" },
  { id: "speed", label: "Швидкість", detail: "Largest Contentful Paint", status: "ok", value: "1.2s" },
  { id: "ssl", label: "SSL сертифікат", detail: "діє ще", status: "ok", value: "84 дні" },
  { id: "links", label: "Биті посилання", detail: "сканування сторінок", status: "running", value: "—" },
  { id: "mobile", label: "Мобільна версія", detail: "viewport, тап-таргети", status: "ok", value: "Готово" },
];

const STATUS_COLOR: Record<CheckRow["status"], string> = {
  ok: "var(--lime)",
  warn: "#F5A623",
  running: "var(--cyan)",
};

export function LiveMonitorPanel() {
  const reduceMotion = useReducedMotion();

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b hairline">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-[var(--text-tertiary)]">qorax-client.com.ua</span>
        </div>
        <span className="font-mono text-[10px] text-[var(--text-tertiary)] tabular">
          оновлено зараз
        </span>
      </div>

      <div className="divide-y divide-[var(--border-hairline)]">
        {ROWS.map((row, i) => (
          <motion.div
            key={row.id}
            className="flex items-center gap-3 px-5 py-3.5"
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

      <div className="px-5 py-3 border-t hairline flex items-center justify-between bg-[var(--bg-raised-2)]">
        <span className="text-xs text-[var(--text-secondary)]">5 перевірок щохвилини</span>
        <span className="font-mono text-xs text-[var(--lime)]">●  усе в нормі</span>
      </div>
    </div>
  );
}
