// ============================================================
// audit.ts — типы результата аудита, зеркалят формат ответа
// Qorax API Worker (POST /api/audit).
// ============================================================

export interface AuditFinding {
  severity: "critical" | "warning" | "info";
  problemSummary: string;
  plainExplanation: string;
  estimatedMonthlyLossUsd: number | null;
  recommendation: string;
}

export interface AuditSuccessResult {
  url: string;
  overallSummary: string;
  performanceScoreMobile: number | null;
  performanceScoreDesktop: number | null;
  responseTimeMs: number | null;
  sslValid: boolean;
  pageSizeKb: number | null;
  visibleFindings: AuditFinding[];
  hiddenFindingsCount: number;
  /** Сума estimatedMonthlyLossUsd по ВСІХ findings (включно зі
   * скритими за лід-магніт лімітом) — агрегат для Loss Calculator,
   * не розкриває зміст скритих findings, лише підсумкове число. */
  totalEstimatedMonthlyLossUsd: number;
}

export interface AuditErrorResult {
  error: string;
}

export type AuditResult = AuditSuccessResult | AuditErrorResult;

export function isAuditError(result: AuditResult): result is AuditErrorResult {
  return "error" in result;
}
