// pdfReport.ts — HTML звіт у фірмовому стилі Qorax (Cyber Minimal),
// що відкривається в браузері і зберігається як PDF через window.print().

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
  whiteLabel?: { agencyName: string; agencyUrl?: string; logoUrl?: string };
}

// ── Кольорова палітра звіту (Cyber Minimal, узгоджена з дашбордом) ──
const C = {
  bg: "#0C111D",
  bgRaised: "#141B2A",
  bgCard: "#111827",
  lime: "#D6FF3F",
  cyan: "#8CF6FF",
  textPrimary: "#F5F5F7",
  textSecondary: "#A1A1A6",
  textTertiary: "#6E6E73",
  border: "rgba(255,255,255,0.08)",
  borderStrong: "rgba(255,255,255,0.14)",
  good: "#8CF6FF",
  warn: "#FFC24B",
  bad: "#FF6B5E",
  bar1: "#D6FF3F",
  bar2: "#2FD9E8",
  bar3: "#8CF6FF",
};

function scoreColor(s: number | null) {
  if (s === null) return C.textTertiary;
  if (s >= 90) return C.good;
  if (s >= 50) return C.warn;
  return C.bad;
}
function uptimeColor(u: number) {
  if (u >= 99.9) return C.good;
  if (u >= 99) return C.lime;
  if (u >= 95) return C.warn;
  return C.bad;
}
function sslColor(d: number | null) {
  if (d === null) return C.textTertiary;
  if (d <= 7) return C.bad;
  if (d <= 30) return C.warn;
  return C.good;
}
function sevColor(s: string) {
  if (s === "critical") return C.bad;
  if (s === "warning") return C.warn;
  return C.cyan;
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
// Escape для значень, що потрапляють у HTML як текст (email/URL агентства
// тощо), щоб уникнути ін'єкції розмітки через whiteLabel-поля з БД.
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function generateReportHtml(data: ReportData): string {
  const brand = data.whiteLabel ? esc(data.whiteLabel.agencyName) : "Qorax";
  const brandUrl = data.whiteLabel?.agencyUrl ? esc(data.whiteLabel.agencyUrl) : "qorax.app";
  const logoUrl = data.whiteLabel?.logoUrl;

  const logoHtml = logoUrl
    ? `<img src="${esc(logoUrl)}" alt="${brand}" style="height:28px;max-width:180px;object-fit:contain;object-position:left center;" />`
    : `<div style="display:flex;align-items:center;gap:8px;">
         <div style="display:flex;align-items:flex-end;gap:2px;height:20px;">
           <span style="width:3px;height:20px;background:${C.bar1};border-radius:1px;"></span>
           <span style="width:3px;height:14px;background:${C.bar2};border-radius:1px;"></span>
           <span style="width:3px;height:17px;background:${C.bar3};border-radius:1px;"></span>
           <span style="width:3px;height:10px;background:${C.textPrimary};border-radius:1px;"></span>
           <span style="width:3px;height:20px;background:${C.textTertiary};border-radius:1px;"></span>
         </div>
         <span style="font-size:15px;font-weight:700;letter-spacing:-.01em;"><span style="color:${C.textPrimary};">Qo</span><span style="color:${C.cyan};">rax</span></span>
       </div>`;

  const insightsHtml = data.insights.length === 0
    ? `<div style="border:1px dashed ${C.border};border-radius:12px;padding:24px;text-align:center;">
        <p style="color:${C.textTertiary};font-size:13px;">Критичних проблем не виявлено — сайт у хорошому стані</p>
      </div>`
    : data.insights.map(ins => `
      <div style="border:1px solid ${C.border};border-left:3px solid ${sevColor(ins.severity)};border-radius:10px;padding:18px 20px;margin-bottom:12px;background:${C.bgRaised};">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:9px;flex-wrap:wrap;">
          <span style="font-size:10px;font-weight:700;letter-spacing:.09em;color:${sevColor(ins.severity)};text-transform:uppercase;">${sevLabel(ins.severity)}</span>
          ${ins.estimatedMonthlyLossUsd ? `<span style="font-size:11px;font-family:'JetBrains Mono','Courier New',monospace;color:${C.bad};background:rgba(255,107,94,0.12);padding:3px 9px;border-radius:5px;">~$${ins.estimatedMonthlyLossUsd}/міс</span>` : ""}
        </div>
        <p style="font-size:14px;font-weight:600;color:${C.textPrimary};margin-bottom:6px;letter-spacing:-.01em;">${ins.problemSummary}</p>
        <p style="font-size:13px;color:${C.textSecondary};line-height:1.6;margin-bottom:10px;">${ins.plainExplanation}</p>
        <div style="display:flex;gap:8px;align-items:flex-start;border-top:1px solid ${C.border};padding-top:10px;">
          <span style="color:${C.lime};font-size:12px;flex-shrink:0;">→</span>
          <p style="font-size:12px;color:${C.textTertiary};line-height:1.55;">${ins.recommendation}</p>
        </div>
      </div>`).join("");

  const statsHtml = [
    { label: "Uptime", value: `${data.uptimePercent.toFixed(2)}%`, color: uptimeColor(data.uptimePercent) },
    { label: "Час відповіді", value: fmtMs(data.avgResponseTimeMs), color: data.avgResponseTimeMs && data.avgResponseTimeMs <= 1500 ? C.good : data.avgResponseTimeMs && data.avgResponseTimeMs <= 3000 ? C.warn : C.bad },
    { label: "PageSpeed", value: data.latestPageSpeedMobile !== null ? String(data.latestPageSpeedMobile) : "—", color: scoreColor(data.latestPageSpeedMobile) },
    { label: "SSL (днів)", value: data.sslDaysLeft !== null ? String(data.sslDaysLeft) : "—", color: sslColor(data.sslDaysLeft) },
  ].map(s => `
    <div style="flex:1;min-width:140px;border:1px solid ${C.border};border-radius:12px;padding:20px 18px;background:${C.bgCard};">
      <div style="font-size:10px;font-weight:600;letter-spacing:.08em;color:${C.textTertiary};text-transform:uppercase;margin-bottom:12px;">${s.label}</div>
      <div style="font-size:28px;font-weight:700;color:${s.color};font-family:'JetBrains Mono','Courier New',monospace;letter-spacing:-.02em;">${s.value}</div>
    </div>`).join("");

  const detailRows = [
    ["Інциденти за місяць", String(data.incidentsCount)],
    ["Загальний downtime", `${data.totalDowntimeMinutes} хв`],
    ...(data.latestLcpMs !== null ? [["LCP (мобільний)", `${(data.latestLcpMs / 1000).toFixed(1)}с`]] : []),
    ...(data.latestClsScore !== null ? [["CLS (мобільний)", data.latestClsScore.toFixed(3)]] : []),
    ...(data.latestPageSpeedDesktop !== null ? [["PageSpeed Desktop", String(data.latestPageSpeedDesktop)]] : []),
  ].map(([k, v], i, arr) => `
    <tr>
      <td style="padding:13px 0;font-size:13px;color:${C.textSecondary};border-bottom:${i < arr.length - 1 ? `1px solid ${C.border}` : "none"};">${k}</td>
      <td style="padding:13px 0;font-size:13px;font-weight:600;color:${C.textPrimary};text-align:right;font-family:'JetBrains Mono','Courier New',monospace;border-bottom:${i < arr.length - 1 ? `1px solid ${C.border}` : "none"};">${v}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${brand} — ${esc(data.siteName)} — ${esc(data.periodLabel)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Inter', -apple-system, sans-serif;
    background: ${C.bg};
    color: ${C.textPrimary};
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 820px; margin: 0 auto; padding: 0 32px 48px; }
  .toolbar {
    background: rgba(12,17,29,0.92);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid ${C.border};
    padding: 16px 32px;
    display: flex; align-items: center; justify-content: space-between;
    position: sticky; top: 0; z-index: 10;
  }
  .toolbar-text { color: ${C.textTertiary}; font-size: 13px; }
  .print-btn {
    background: ${C.lime}; color: ${C.bg}; font-size: 13px; font-weight: 700;
    padding: 10px 22px; border-radius: 10px; border: none; cursor: pointer;
    font-family: inherit; letter-spacing: -.01em;
    transition: opacity 140ms ease-out;
  }
  .print-btn:hover { opacity: 0.85; }
  .card {
    background: ${C.bgCard};
    border: 1px solid ${C.border};
    border-radius: 16px;
    padding: 28px;
    margin-bottom: 20px;
  }
  .section-label {
    display: flex; align-items: center; gap: 9px; margin-bottom: 18px;
  }
  .section-label span {
    font-size: 12px; font-weight: 700; letter-spacing: .07em;
    color: ${C.textSecondary}; text-transform: uppercase;
  }
  @media print {
    body { background: #fff; color: #111827; }
    .toolbar { display: none; }
    .wrap { max-width: 100%; padding: 0 20px 24px; }
    .card {
      background: #fff; border: 1px solid #e5e7eb; box-shadow: none;
      break-inside: avoid; page-break-inside: avoid;
    }
    .hero { background: #111827 !important; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <span class="toolbar-text">${brand} · ${esc(data.siteName)} · ${esc(data.periodLabel)}</span>
  <button class="print-btn" onclick="window.print()">Зберегти PDF</button>
</div>

<div class="wrap">

  <!-- Hero header -->
  <div class="card hero" style="background:linear-gradient(135deg, ${C.bgRaised} 0%, ${C.bg} 100%); border-color:${C.borderStrong}; margin-top:24px;">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:20px;margin-bottom:22px;">
      ${logoHtml}
      <div style="text-align:right;">
        <div style="font-size:11px;font-weight:600;letter-spacing:.08em;color:${C.textTertiary};text-transform:uppercase;">Звіт моніторингу</div>
        <div style="font-size:11px;color:${C.textTertiary};margin-top:2px;">${esc(data.generatedAt)}</div>
      </div>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;">
      <div>
        <h1 style="font-size:32px;font-weight:800;color:${C.textPrimary};letter-spacing:-.02em;margin-bottom:6px;">${esc(data.siteName)}</h1>
        <div style="font-size:13px;color:${C.textTertiary};font-family:'JetBrains Mono','Courier New',monospace;">${esc(data.siteUrl)}</div>
      </div>
      <div style="font-size:20px;font-weight:700;color:${C.cyan};letter-spacing:-.01em;">${esc(data.periodLabel)}</div>
    </div>
  </div>

  <!-- Stats -->
  <div style="display:flex;gap:12px;margin-bottom:20px;flex-wrap:wrap;">
    ${statsHtml}
  </div>

  ${data.totalEstimatedLossUsd > 0 ? `
  <!-- Loss alert -->
  <div style="border:1px solid rgba(255,107,94,0.35);border-left:4px solid ${C.bad};border-radius:14px;padding:20px 22px;margin-bottom:20px;background:rgba(255,107,94,0.06);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;">
    <div>
      <div style="font-size:13px;font-weight:700;color:${C.bad};margin-bottom:4px;letter-spacing:-.01em;">Оціночні втрати від виявлених проблем</div>
      <div style="font-size:12px;color:${C.textTertiary};">Базується на аналізі швидкості, SEO та конверсій</div>
    </div>
    <div style="font-size:30px;font-weight:800;color:${C.bad};font-family:'JetBrains Mono','Courier New',monospace;letter-spacing:-.02em;">~$${data.totalEstimatedLossUsd}<span style="font-size:14px;color:${C.textTertiary};"> /міс</span></div>
  </div>` : ""}

  <!-- AI Insights -->
  <div class="card">
    <div class="section-label">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${C.lime}" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
      <span>AI Revenue Impact</span>
    </div>
    ${insightsHtml}
  </div>

  <!-- Monitoring details -->
  <div class="card">
    <div class="section-label">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="${C.cyan}" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
      <span>Деталі моніторингу</span>
    </div>
    <table style="width:100%;border-collapse:collapse;">
      ${detailRows}
    </table>
  </div>

  <!-- Footer -->
  <div style="display:flex;justify-content:space-between;align-items:center;padding:20px 4px;flex-wrap:wrap;gap:8px;border-top:1px solid ${C.border};margin-top:8px;">
    <div style="font-size:12px;color:${C.textTertiary};">Моніторинг від <strong style="color:${C.textSecondary};">${brand}</strong>${data.whiteLabel?.agencyUrl ? ` · ${brandUrl}` : " · qorax.app"}</div>
    <div style="font-size:12px;color:${C.textTertiary};font-family:'JetBrains Mono','Courier New',monospace;">${esc(data.periodLabel)}</div>
  </div>

</div>
</body>
</html>`;
}
