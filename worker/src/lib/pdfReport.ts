// ============================================================
// pdfReport.ts — генерация HTML-отчёта который конвертируется
// в PDF на стороне клиента (window.print() / browser print).
//
// Архитектура MVP: Worker генерирует красивый HTML-отчёт,
// возвращает его как строку. Фронтенд открывает в новой вкладке
// и показывает кнопку "Зберегти як PDF" (window.print() с
// @media print CSS). Это работает без платного Puppeteer/Chrome.
//
// В будущем (Phase 2): заменить на wkhtmltopdf или Puppeteer
// в отдельном Cloudflare Browser Rendering Worker ($5/мес)
// и отдавать готовый PDF бинарник с Content-Type: application/pdf.
// ============================================================

export interface ReportData {
  siteName: string;
  siteUrl: string;
  periodLabel: string; // "Травень 2025"
  generatedAt: string;

  // Uptime
  uptimePercent: number;
  totalDowntimeMinutes: number;
  incidentsCount: number;

  // Speed
  avgResponseTimeMs: number | null;
  latestPageSpeedMobile: number | null;
  latestPageSpeedDesktop: number | null;

  // CWV
  latestLcpMs: number | null;
  latestClsScore: number | null;

  // SSL
  sslDaysLeft: number | null;

  // AI insights
  insights: Array<{
    severity: string;
    problemSummary: string;
    plainExplanation: string;
    estimatedMonthlyLossUsd: number | null;
    recommendation: string;
  }>;

  // Totals
  totalEstimatedLossUsd: number;

  // White-label (Agency plan) — якщо задано, замінює брендинг Qorax
  whiteLabel?: {
    agencyName: string;   // Назва агентства
    agencyUrl?: string;   // Сайт агентства (опційно)
  };
}

function scoreColor(score: number | null): string {
  if (score === null) return "#6e6e73";
  if (score >= 90) return "#d6ff3f";
  if (score >= 50) return "#F5A623";
  return "#F5675A";
}

function severityLabel(s: string): string {
  if (s === "critical") return "Критично";
  if (s === "warning") return "Увага";
  return "Інфо";
}

function severityColor(s: string): string {
  if (s === "critical") return "#F5675A";
  if (s === "warning") return "#F5A623";
  return "#8CF6FF";
}

export function generateReportHtml(data: ReportData): string {
  const insightsHtml = data.insights.map(ins => `
    <div class="insight-card insight-${ins.severity}">
      <div class="insight-header">
        <span class="severity-badge" style="color:${severityColor(ins.severity)}">${severityLabel(ins.severity)}</span>
        ${ins.estimatedMonthlyLossUsd ? `<span class="loss-badge">~$${ins.estimatedMonthlyLossUsd}/міс</span>` : ""}
      </div>
      <p class="insight-title">${ins.problemSummary}</p>
      <p class="insight-desc">${ins.plainExplanation}</p>
      <p class="insight-rec">→ ${ins.recommendation}</p>
    </div>
  `).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${data.whiteLabel ? data.whiteLabel.agencyName : "Qorax"} — ${data.siteName} — ${data.periodLabel}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: #0a0a0a;
    color: #f5f5f7;
    font-family: 'Space Grotesk', -apple-system, sans-serif;
    -webkit-font-smoothing: antialiased;
    padding: 0;
  }

  .page {
    max-width: 800px;
    margin: 0 auto;
    padding: 48px 40px;
  }

  /* Header */
  .report-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 48px;
    padding-bottom: 24px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }
  .logo { font-size: 20px; font-weight: 700; letter-spacing: -0.02em; }
  .logo span { color: #8CF6FF; }
  .report-meta { text-align: right; }
  .report-meta .period { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  .report-meta .generated { font-size: 12px; color: #6e6e73; font-family: 'IBM Plex Mono', monospace; }

  /* Site info */
  .site-info { margin-bottom: 40px; }
  .site-info h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.02em; margin-bottom: 4px; }
  .site-url { font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #6e6e73; }

  /* Stats grid */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin-bottom: 40px;
  }
  .stat-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 16px;
  }
  .stat-label { font-size: 11px; color: #6e6e73; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
  .stat-value { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; font-family: 'IBM Plex Mono', monospace; }

  /* Section */
  .section { margin-bottom: 36px; }
  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #6e6e73;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin-bottom: 16px;
  }

  /* Loss total */
  .loss-total {
    background: rgba(245,103,90,0.08);
    border: 1px solid rgba(245,103,90,0.25);
    border-radius: 16px;
    padding: 20px 24px;
    margin-bottom: 40px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .loss-total-label { font-size: 14px; color: #a1a1a6; }
  .loss-total-value { font-size: 28px; font-weight: 700; color: #F5675A; font-family: 'IBM Plex Mono', monospace; }

  /* Insights */
  .insight-card {
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 10px;
  }
  .insight-critical { border-color: rgba(245,103,90,0.35); background: rgba(245,103,90,0.05); }
  .insight-warning { border-color: rgba(245,166,35,0.3); background: rgba(245,166,35,0.04); }
  .insight-header { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
  .severity-badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
  .loss-badge {
    font-size: 11px;
    background: rgba(245,103,90,0.15);
    color: #F5675A;
    padding: 2px 8px;
    border-radius: 6px;
    font-family: 'IBM Plex Mono', monospace;
  }
  .insight-title { font-size: 14px; font-weight: 600; margin-bottom: 4px; }
  .insight-desc { font-size: 13px; color: #a1a1a6; margin-bottom: 6px; line-height: 1.5; }
  .insight-rec { font-size: 12px; color: #6e6e73; }

  /* Footer */
  .report-footer {
    margin-top: 48px;
    padding-top: 20px;
    border-top: 1px solid rgba(255,255,255,0.08);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-brand { font-size: 13px; color: #6e6e73; }
  .footer-brand strong { color: #f5f5f7; }

  /* Print */
  .print-btn {
    display: inline-block;
    background: #d6ff3f;
    color: #0a0a0a;
    font-size: 14px;
    font-weight: 600;
    padding: 12px 28px;
    border-radius: 12px;
    border: none;
    cursor: pointer;
    margin-bottom: 32px;
    font-family: 'Space Grotesk', sans-serif;
  }

  @media print {
    body { background: #fff; color: #000; }
    .print-btn { display: none; }
    .stat-card { background: #f5f5f5; border-color: #ddd; }
    .insight-card { border-color: #ddd; background: #fafafa; }
    .insight-critical { background: #fff5f5; border-color: #ffccc7; }
    .insight-warning { background: #fffbe6; border-color: #ffe58f; }
    .loss-total { background: #fff5f5; border-color: #ffccc7; }
    .logo, .report-meta .period, .site-info h1 { color: #000; }
    .site-url, .stat-label, .insight-desc, .insight-rec { color: #555; }
  }
</style>
</head>
<body>
<div class="page">
  <button class="print-btn" onclick="window.print()">📄 Зберегти як PDF</button>

  <div class="report-header">
    <div class="logo">${data.whiteLabel
      ? `<span style="color:#f5f5f7">${data.whiteLabel.agencyName}</span>`
      : 'Qor<span>ax</span>'
    }</div>
    <div class="report-meta">
      <div class="period">${data.periodLabel}</div>
      <div class="generated">Згенеровано ${data.generatedAt}</div>
    </div>
  </div>

  <div class="site-info">
    <h1>${data.siteName}</h1>
    <div class="site-url">${data.siteUrl}</div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Uptime</div>
      <div class="stat-value" style="color:${data.uptimePercent >= 99 ? "#d6ff3f" : data.uptimePercent >= 95 ? "#F5A623" : "#F5675A"}">${data.uptimePercent.toFixed(1)}%</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">PageSpeed</div>
      <div class="stat-value" style="color:${scoreColor(data.latestPageSpeedMobile)}">${data.latestPageSpeedMobile ?? "—"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Час відповіді</div>
      <div class="stat-value">${data.avgResponseTimeMs ? (data.avgResponseTimeMs >= 1000 ? `${(data.avgResponseTimeMs / 1000).toFixed(1)}с` : `${data.avgResponseTimeMs}мс`) : "—"}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">SSL (днів)</div>
      <div class="stat-value" style="color:${data.sslDaysLeft != null ? data.sslDaysLeft <= 7 ? "#F5675A" : data.sslDaysLeft <= 30 ? "#F5A623" : "#d6ff3f" : "#6e6e73"}">${data.sslDaysLeft ?? "—"}</div>
    </div>
  </div>

  ${data.totalEstimatedLossUsd > 0 ? `
  <div class="loss-total">
    <div>
      <div class="loss-total-label">Оціночні втрати від поточних проблем</div>
      <div style="font-size:12px;color:#6e6e73;margin-top:4px;">На основі аналізу швидкості, SEO та конверсій</div>
    </div>
    <div class="loss-total-value">~$${data.totalEstimatedLossUsd}/міс</div>
  </div>` : ""}

  ${data.insights.length > 0 ? `
  <div class="section">
    <div class="section-title">Знайдені проблеми</div>
    ${insightsHtml}
  </div>` : ""}

  <div class="section">
    <div class="section-title">Деталі моніторингу</div>
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:10px 0;color:#6e6e73;">Інциденти за місяць</td>
          <td style="padding:10px 0;text-align:right;font-family:'IBM Plex Mono',monospace;">${data.incidentsCount}</td>
        </tr>
        <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:10px 0;color:#6e6e73;">Загальний downtime</td>
          <td style="padding:10px 0;text-align:right;font-family:'IBM Plex Mono',monospace;">${data.totalDowntimeMinutes} хв</td>
        </tr>
        ${data.latestLcpMs ? `<tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
          <td style="padding:10px 0;color:#6e6e73;">LCP (мобільний)</td>
          <td style="padding:10px 0;text-align:right;font-family:'IBM Plex Mono',monospace;">${(data.latestLcpMs / 1000).toFixed(1)}с</td>
        </tr>` : ""}
        ${data.latestClsScore != null ? `<tr>
          <td style="padding:10px 0;color:#6e6e73;">CLS (мобільний)</td>
          <td style="padding:10px 0;text-align:right;font-family:'IBM Plex Mono',monospace;">${data.latestClsScore.toFixed(3)}</td>
        </tr>` : ""}
      </table>
    </div>
  </div>

  <div class="report-footer">
    <div class="footer-brand">${data.whiteLabel
      ? `Моніторинг від <strong>${data.whiteLabel.agencyName}</strong>${data.whiteLabel.agencyUrl ? ' · ' + data.whiteLabel.agencyUrl : ''}`
      : 'Моніторинг від <strong>Qorax</strong> · qorax.app'
    }</div>
    <div style="font-size:12px;color:#6e6e73;">${data.periodLabel}</div>
  </div>
</div>
</body>
</html>`;
}
