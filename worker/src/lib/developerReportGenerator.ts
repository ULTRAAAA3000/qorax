// ============================================================
// developerReportGenerator.ts — Reporting API (Qorax SEO Platform,
// Developer API), третій ендпоінт з п'яти запланованих.
//
// Узгоджено з Артемом: AI SEO API — НЕ робимо (достатнє AI-
// навантаження вже є на платформі). Reporting API — third pick,
// не потребує Gemini-виклику взагалі.
//
// НАВМИСНО НЕ перевикористовує pdfReport.ts::generateReportHtml() —
// той генератор вимагає ReportData з місячною історією моніторингу
// (uptimePercent/incidentsCount/totalDowntimeMinutes/AI-insights),
// якої фізично не існує для довільного зовнішнього URL через
// Developer API (та історія існує лише для сайтів, відстежуваних
// у власній таблиці sites Qorax). Reporting API натомість будує
// звіт з РЕЗУЛЬТАТУ ОДНОГО аудиту (той самий формат відповіді, що
// /api/v1/audit) — "SEO Audit API" + "Reporting API" по суті
// компонуються в одну дію: аудит → звіт, як описано в початковому
// документі Артема.
//
// Той самий Cyber Minimal колірний код, що pdfReport.ts (C-палітра
// скопійована навмисно, не імпортується — щоб не створювати
// залежність Reporting API від внутрішнього монiторинг-звіту, це
// окремий продукт з окремою еволюцією стилю).
// ============================================================

export interface DeveloperReportInput {
  url: string;
  reachable: boolean;
  httpStatus?: number | null;
  responseTimeMs?: number | null;
  sslValid?: boolean | null;
  pageSizeKb?: number | null;
  meta?: {
    title?: string | null;
    titleLength?: number | null;
    metaDescription?: string | null;
    metaDescriptionLength?: number | null;
    hasViewportMeta?: boolean | null;
    hasH1?: boolean | null;
    h1Count?: number | null;
  };
  pageSpeed?: {
    mobile?: { performanceScore?: number | null };
    desktop?: { performanceScore?: number | null };
  };
  generatedAt: string; // ISO
}

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
  good: "#8CF6FF",
  warn: "#FFC24B",
  bad: "#FF6B5E",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function scoreColor(s: number | null | undefined): string {
  if (s === null || s === undefined) return C.textTertiary;
  if (s >= 90) return C.good;
  if (s >= 50) return C.warn;
  return C.bad;
}

function boolBadge(value: boolean | null | undefined, goodLabel: string, badLabel: string): string {
  if (value === null || value === undefined) return `<span style="color:${C.textTertiary};">—</span>`;
  const color = value ? C.good : C.bad;
  const label = value ? goodLabel : badLabel;
  return `<span style="color:${color};font-weight:600;">${label}</span>`;
}

/**
 * Генерує HTML-звіт (той самий "відкривається в браузері, зберігається
 * як PDF через window.print()" підхід, що pdfReport.ts — Cloudflare
 * Workers не має headless-браузера для справжнього server-side PDF
 * рендерингу, тому "PDF"-формат Developer API technically повертає
 * print-ready HTML з @media print стилями, не бінарний .pdf файл).
 */
export function generateDeveloperReportHtml(data: DeveloperReportInput): string {
  const mobileScore = data.pageSpeed?.mobile?.performanceScore ?? null;
  const desktopScore = data.pageSpeed?.desktop?.performanceScore ?? null;

  const statsHtml = [
    { label: "HTTP статус", value: data.httpStatus !== null && data.httpStatus !== undefined ? String(data.httpStatus) : "—", color: data.httpStatus === 200 ? C.good : C.warn },
    { label: "Час відповіді", value: data.responseTimeMs !== null && data.responseTimeMs !== undefined ? `${data.responseTimeMs}мс` : "—", color: data.responseTimeMs && data.responseTimeMs <= 1500 ? C.good : C.warn },
    { label: "PageSpeed Mobile", value: mobileScore !== null ? String(mobileScore) : "—", color: scoreColor(mobileScore) },
    { label: "PageSpeed Desktop", value: desktopScore !== null ? String(desktopScore) : "—", color: scoreColor(desktopScore) },
  ].map(s => `
    <div style="flex:1;min-width:140px;border:1px solid ${C.border};border-radius:12px;padding:20px 18px;background:${C.bgCard};">
      <div style="font-size:10px;font-weight:600;letter-spacing:.08em;color:${C.textTertiary};text-transform:uppercase;margin-bottom:12px;">${s.label}</div>
      <div style="font-size:28px;font-weight:700;color:${s.color};font-family:'JetBrains Mono','Courier New',monospace;letter-spacing:-.02em;">${s.value}</div>
    </div>`).join("");

  const metaRows = [
    ["Title", data.meta?.title ? esc(data.meta.title) : "—"],
    ["Довжина Title", data.meta?.titleLength !== null && data.meta?.titleLength !== undefined ? `${data.meta.titleLength} символів` : "—"],
    ["Meta Description", data.meta?.metaDescription ? esc(data.meta.metaDescription) : "—"],
    ["Viewport meta", boolBadge(data.meta?.hasViewportMeta, "Є", "Відсутній")],
    ["H1", data.meta?.hasH1 ? `Є (${data.meta.h1Count ?? 1})` : "Відсутній"],
    ["SSL", boolBadge(data.sslValid, "Дійсний", "Проблема")],
    ["Розмір сторінки", data.pageSizeKb !== null && data.pageSizeKb !== undefined ? `${data.pageSizeKb} KB` : "—"],
  ].map(([k, v], i, arr) => `
    <tr>
      <td style="padding:13px 0;font-size:13px;color:${C.textSecondary};border-bottom:${i < arr.length - 1 ? `1px solid ${C.border}` : "none"};">${k}</td>
      <td style="padding:13px 0;font-size:13px;font-weight:600;color:${C.textPrimary};text-align:right;">${v}</td>
    </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="UTF-8">
<title>SEO звіт — ${esc(data.url)}</title>
<style>
  @media print {
    body { background: white !important; }
    .no-print { display: none !important; }
  }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: ${C.bg}; color: ${C.textPrimary}; }
  .container { max-width: 780px; margin: 0 auto; padding: 48px 32px; }
</style>
</head>
<body>
  <div class="container">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:36px;">
      <div style="font-size:15px;font-weight:700;letter-spacing:-.01em;"><span style="color:${C.textPrimary};">Qo</span><span style="color:${C.cyan};">rax</span> <span style="color:${C.textTertiary};font-weight:400;">SEO Report</span></div>
      <div style="font-size:11px;color:${C.textTertiary};font-family:'JetBrains Mono','Courier New',monospace;">${new Date(data.generatedAt).toLocaleString("uk-UA")}</div>
    </div>

    <h1 style="font-size:22px;font-weight:700;margin-bottom:6px;letter-spacing:-.01em;">${esc(data.url)}</h1>
    <p style="font-size:13px;color:${C.textSecondary};margin-bottom:32px;">
      ${data.reachable ? boolBadge(true, "Доступний", "") : boolBadge(false, "", "Недоступний")}
    </p>

    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:32px;">
      ${statsHtml}
    </div>

    <h2 style="font-size:14px;font-weight:600;color:${C.textTertiary};text-transform:uppercase;letter-spacing:.06em;margin-bottom:16px;">SEO-деталі</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:32px;">
      ${metaRows}
    </table>

    <p style="font-size:11px;color:${C.textTertiary};text-align:center;margin-top:48px;">
      Згенеровано Qorax SEO Platform — <span style="font-family:'JetBrains Mono','Courier New',monospace;">/api/v1/report</span>
    </p>

    <button class="no-print" onclick="window.print()" style="display:block;margin:24px auto 0;padding:10px 20px;border-radius:10px;border:1px solid ${C.border};background:${C.bgCard};color:${C.textPrimary};font-size:13px;cursor:pointer;">
      Зберегти як PDF
    </button>
  </div>
</body>
</html>`;
}
