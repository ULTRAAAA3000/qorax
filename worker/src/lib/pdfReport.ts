// pdfReport.ts — HTML звіт що відкривається в браузері і зберігається як PDF через window.print()

export interface ReportData {
  siteName: string;
  siteUrl: string;
  periodLabel: string;
  generatedAt: string;
  uptimePercent: number;
  totalDowntimeMinutes: number;
  incidentsCount: number;
  avgResponseTimeMs: number | null;
  latestPageSpeedMobile: number | null;
  latestPageSpeedDesktop: number | null;
  latestLcpMs: number | null;
  latestClsScore: number | null;
  sslDaysLeft: number | null;
  insights: Array<{
    severity: string;
    problemSummary: string;
    plainExplanation: string;
    estimatedMonthlyLossUsd: number | null;
    recommendation: string;
  }>;
  totalEstimatedLossUsd: number;
  whiteLabel?: { agencyName: string; agencyUrl?: string };
}

function scoreColor(s: number | null) {
  if (s === null) return "#999";
  if (s >= 90) return "#22c55e";
  if (s >= 50) return "#f59e0b";
  return "#ef4444";
}
function uptimeColor(u: number) {
  if (u >= 99.9) return "#22c55e";
  if (u >= 99) return "#84cc16";
  if (u >= 95) return "#f59e0b";
  return "#ef4444";
}
function sslColor(d: number | null) {
  if (d === null) return "#999";
  if (d <= 7) return "#ef4444";
  if (d <= 30) return "#f59e0b";
  return "#22c55e";
}
function sevColor(s: string) {
  if (s === "critical") return "#ef4444";
  if (s === "warning") return "#f59e0b";
  return "#3b82f6";
}
function sevLabel(s: string) {
  if (s === "critical") return "Критично";
  if (s === "warning") return "Увага";
  return "Інфо";
}
function fmtMs(ms: number | null) {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
}

export function generateReportHtml(data: ReportData): string {
  const brand = data.whiteLabel ? data.whiteLabel.agencyName : "Qorax";
  const brandUrl = data.whiteLabel?.agencyUrl ?? "qorax.app";

  const insightsHtml = data.insights.length === 0
    ? `<p style="color:#888;font-size:13px;">Критичних проблем не виявлено</p>`
    : data.insights.map(ins => `
      <div style="border:1px solid ${sevColor(ins.severity)}33;border-left:3px solid ${sevColor(ins.severity)};border-radius:8px;padding:16px 18px;margin-bottom:10px;background:${sevColor(ins.severity)}08;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="font-size:10px;font-weight:700;letter-spacing:.08em;color:${sevColor(ins.severity)};text-transform:uppercase;">${sevLabel(ins.severity)}</span>
          ${ins.estimatedMonthlyLossUsd ? `<span style="font-size:11px;font-family:'Courier New',monospace;color:#ef4444;background:#ef444415;padding:2px 8px;border-radius:4px;">~$${ins.estimatedMonthlyLossUsd}/міс</span>` : ""}
        </div>
        <p style="font-size:14px;font-weight:600;color:#1a1a1a;margin-bottom:5px;">${ins.problemSummary}</p>
        <p style="font-size:13px;color:#555;line-height:1.55;margin-bottom:8px;">${ins.plainExplanation}</p>
        <p style="font-size:12px;color:#777;border-top:1px solid #eee;padding-top:8px;">→ ${ins.recommendation}</p>
      </div>`).join("");

  const statsHtml = [
    { label: "Uptime", value: `${data.uptimePercent.toFixed(2)}%`, color: uptimeColor(data.uptimePercent) },
    { label: "Час відповіді", value: fmtMs(data.avgResponseTimeMs), color: data.avgResponseTimeMs && data.avgResponseTimeMs <= 1500 ? "#22c55e" : data.avgResponseTimeMs && data.avgResponseTimeMs <= 3000 ? "#f59e0b" : "#ef4444" },
    { label: "PageSpeed", value: data.latestPageSpeedMobile !== null ? String(data.latestPageSpeedMobile) : "—", color: scoreColor(data.latestPageSpeedMobile) },
    { label: "SSL (днів)", value: data.sslDaysLeft !== null ? String(data.sslDaysLeft) : "—", color: sslColor(data.sslDaysLeft) },
  ].map(s => `
    <div style="flex:1;min-width:0;border:1px solid #e5e7eb;border-radius:10px;padding:18px 16px;">
      <div style="font-size:10px;font-weight:600;letter-spacing:.07em;color:#9ca3af;text-transform:uppercase;margin-bottom:10px;">${s.label}</div>
      <div style="font-size:26px;font-weight:700;color:${s.color};font-family:'Courier New',monospace;letter-spacing:-.01em;">${s.value}</div>
    </div>`).join("");

  const detailRows = [
    ["Інциденти за місяць", String(data.incidentsCount)],
    ["Загальний downtime", `${data.totalDowntimeMinutes} хв`],
    ...(data.latestLcpMs !== null ? [["LCP (мобільний)", `${(data.latestLcpMs / 1000).toFixed(1)}с`]] : []),
    ...(data.latestClsScore !== null ? [["CLS (мобільний)", data.latestClsScore.toFixed(3)]] : []),
    ...(data.latestPageSpeedDesktop !== null ? [["PageSpeed Desktop", String(data.latestPageSpeedDesktop)]] : []),
  ].map(([k, v], i, arr) => `
    <tr>
      <td style="padding:11px 0;font-size:13px;color:#6b7280;border-bottom:${i < arr.length - 1 ? "1px solid #f3f4f6" : "none"};">${k}</td>
      <td style="padding:11px 0;font-size:13px;font-weight:600;text-align:right;font-family:'Courier New',monospace;border-bottom:${i < arr.length - 1 ? "1px solid #f3f4f6" : "none"};">${v}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${brand} — ${data.siteName} — ${data.periodLabel}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, sans-serif; background: #f9fafb; color: #111827; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 40px 32px; }
  .print-bar { background: #111827; padding: 14px 32px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 10; }
  .print-bar-text { color: #9ca3af; font-size: 13px; }
  .print-btn { background: #d6ff3f; color: #111827; font-size: 13px; font-weight: 700; padding: 9px 22px; border-radius: 8px; border: none; cursor: pointer; font-family: inherit; letter-spacing: -.01em; }
  .print-btn:hover { background: #c8f032; }
  /* Card */
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 28px 28px; margin-bottom: 20px; }
  /* Divider */
  .divider { height: 1px; background: #f3f4f6; margin: 20px 0; }
  @media print {
    body { background: #fff; }
    .print-bar { display: none; }
    .wrap { padding: 28px 24px; }
    .card { border-color: #e5e7eb; box-shadow: none; }
  }
</style>
</head>
<body>

<div class="print-bar">
  <span class="print-bar-text">${brand} · ${data.siteName} · ${data.periodLabel}</span>
  <button class="print-btn" onclick="window.print()">Зберегти PDF</button>
</div>

<div class="wrap">

  <!-- Header -->
  <div class="card" style="background:linear-gradient(135deg,#111827 0%,#1f2937 100%);border-color:#374151;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
      <div>
        <div style="font-size:11px;font-weight:600;letter-spacing:.1em;color:#6b7280;text-transform:uppercase;margin-bottom:8px;">${brand}</div>
        <h1 style="font-size:30px;font-weight:700;color:#f9fafb;letter-spacing:-.02em;margin-bottom:4px;">${data.siteName}</h1>
        <div style="font-size:13px;color:#6b7280;font-family:'Courier New',monospace;">${data.siteUrl}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:20px;font-weight:700;color:#f9fafb;letter-spacing:-.01em;margin-bottom:4px;">${data.periodLabel}</div>
        <div style="font-size:11px;color:#6b7280;">Згенеровано ${data.generatedAt}</div>
      </div>
    </div>
  </div>

  <!-- Stats -->
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
    ${statsHtml}
  </div>

  ${data.totalEstimatedLossUsd > 0 ? `
  <!-- Loss alert -->
  <div style="border:1px solid #fca5a5;border-left:4px solid #ef4444;border-radius:10px;padding:18px 20px;margin-bottom:20px;background:#fef2f2;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;">
    <div>
      <div style="font-size:13px;font-weight:600;color:#dc2626;margin-bottom:3px;">Оціночні втрати від виявлених проблем</div>
      <div style="font-size:12px;color:#991b1b;">Базується на аналізі швидкості, SEO та конверсій</div>
    </div>
    <div style="font-size:28px;font-weight:700;color:#dc2626;font-family:'Courier New',monospace;">~$${data.totalEstimatedLossUsd}<span style="font-size:14px;">/міс</span></div>
  </div>` : ""}

  <!-- AI Insights -->
  <div class="card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span style="font-size:13px;font-weight:700;letter-spacing:.04em;color:#374151;text-transform:uppercase;">AI Revenue Impact</span>
    </div>
    ${insightsHtml}
  </div>

  <!-- Monitoring details -->
  <div class="card">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:18px;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <span style="font-size:13px;font-weight:700;letter-spacing:.04em;color:#374151;text-transform:uppercase;">Деталі моніторингу</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${detailRows}
    </table>
  </div>

  <!-- Footer -->
  <div style="display:flex;justify-content:space-between;align-items:center;padding:16px 0;flex-wrap:wrap;gap:8px;">
    <div style="font-size:12px;color:#9ca3af;">Моніторинг від <strong style="color:#6b7280;">${brand}</strong>${data.whiteLabel?.agencyUrl ? ` · ${brandUrl}` : " · qorax.app"}</div>
    <div style="font-size:12px;color:#9ca3af;font-family:'Courier New',monospace;">${data.periodLabel}</div>
  </div>

</div>
</body>
</html>`;
}
