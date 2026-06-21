"use client";

import { motion } from "motion/react";
import type { AuditSuccessResult } from "../lib/audit";

/**
 * AuditResultPanel — renders the real audit response: overall summary,
 * key metrics, the visible findings (lead-magnet limited to 2), and a
 * teaser for the hidden remainder, nudging toward the $19 full audit
 * or a subscription.
 */

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#F5675A",
  warning: "#F5A623",
  info: "var(--cyan)",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Критично",
  warning: "Важливо",
  info: "До уваги",
};

export function AuditResultPanel({ result }: { result: AuditSuccessResult }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="mt-6 rounded-2xl border hairline bg-[var(--bg-raised)] overflow-hidden"
    >
      <div className="px-5 sm:px-6 py-5 border-b hairline">
        <p className="font-mono text-xs text-[var(--text-tertiary)] mb-2">{result.url}</p>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {result.overallSummary}
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-[var(--border-hairline)] border-b hairline">
        <MetricCell
          label="Швидкість (моб.)"
          value={result.performanceScoreMobile !== null ? `${result.performanceScoreMobile}/100` : "—"}
          tone={
            result.performanceScoreMobile !== null && result.performanceScoreMobile < 50 ? "bad" : "good"
          }
        />
        <MetricCell
          label="Швидкість (ПК)"
          value={result.performanceScoreDesktop !== null ? `${result.performanceScoreDesktop}/100` : "—"}
          tone={
            result.performanceScoreDesktop !== null && result.performanceScoreDesktop < 50 ? "bad" : "good"
          }
        />
        <MetricCell label="SSL" value={result.sslValid ? "Діє" : "Відсутній"} tone={result.sslValid ? "good" : "bad"} />
        <MetricCell
          label="Розмір сторінки"
          value={result.pageSizeKb !== null ? `${result.pageSizeKb} КБ` : "—"}
          tone={result.pageSizeKb !== null && result.pageSizeKb > 3000 ? "bad" : "good"}
        />
      </div>

      <div className="divide-y divide-[var(--border-hairline)]">
        {result.visibleFindings.map((finding, i) => (
          <div key={i} className="px-5 sm:px-6 py-4">
            <div className="flex items-center gap-2 mb-1.5">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: SEVERITY_COLOR[finding.severity] }}
              />
              <span
                className="font-mono text-[10px] tracking-wide"
                style={{ color: SEVERITY_COLOR[finding.severity] }}
              >
                {SEVERITY_LABEL[finding.severity]}
              </span>
              {finding.estimatedMonthlyLossUsd !== null && (
                <span className="font-mono text-[10px] text-[var(--text-tertiary)] ml-auto">
                  ~−${finding.estimatedMonthlyLossUsd}/міс
                </span>
              )}
            </div>
            <p className="text-sm text-[var(--text-primary)] font-medium mb-1">
              {finding.problemSummary}
            </p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {finding.plainExplanation}
            </p>
          </div>
        ))}
      </div>

      {result.hiddenFindingsCount > 0 && (
        <div className="px-5 sm:px-6 py-4 bg-[var(--bg-raised-2)] flex items-center justify-between gap-4">
          <p className="text-sm text-[var(--text-secondary)]">
            Ще {result.hiddenFindingsCount}{" "}
            {result.hiddenFindingsCount === 1 ? "проблема знайдена" : "проблем знайдено"} —
            повний звіт за $19.
          </p>
          <button
            className="shrink-0 text-sm font-medium rounded-lg px-4 py-2 whitespace-nowrap"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            Повний звіт
          </button>
        </div>
      )}
    </motion.div>
  );
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "bad";
}) {
  return (
    <div className="px-5 py-4 text-center">
      <div
        className="font-mono text-lg tabular mb-0.5"
        style={{ color: tone === "bad" ? "#F5A623" : "var(--text-primary)" }}
      >
        {value}
      </div>
      <div className="text-xs text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}
