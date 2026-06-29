// ============================================================
// email.ts — відправка email-алертів через Resend API.
// Використовується з monitoring.ts при відкритті/закритті інцидентів
// та при наближенні закінчення SSL-сертифіката.
//
// Resend безкоштовний tier: 3,000 листів/місяць, 100/день —
// для MVP більш ніж достатньо (алерти рідкісні по природі).
// ============================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const FROM_ADDRESS = "alerts@qorax.app";
const FROM_NAME = "Qorax Monitoring";

export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
}

export async function sendEmail(
  params: SendEmailParams,
  resendApiKey: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: `${FROM_NAME} <${FROM_ADDRESS}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return { ok: false, error: `Resend API error ${response.status}: ${text.slice(0, 200)}` };
    }

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ─── Email templates ──────────────────────────────────────────

export function buildSiteDownEmail(params: {
  siteDisplayName: string;
  siteUrl: string;
  downtimeSince: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subject = `🔴 ${params.siteDisplayName} — сайт недоступний`;
  const html = `
<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <!-- Logo -->
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
    </div>

    <!-- Alert card -->
    <div style="background:rgba(245,103,90,0.08);border:1px solid rgba(245,103,90,0.35);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:10px;height:10px;border-radius:50%;background:#F5675A;"></div>
        <span style="font-size:13px;font-weight:600;color:#F5675A;text-transform:uppercase;letter-spacing:0.05em;">Сайт недоступний</span>
      </div>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#f5f5f7;">${params.siteDisplayName}</h1>
      <p style="margin:0;font-size:13px;color:#6e6e73;font-family:'Courier New',monospace;">${params.siteUrl}</p>
    </div>

    <!-- Details -->
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#a1a1a6;">
        <strong style="color:#f5f5f7;">Qorax виявив проблему</strong> і вже відстежує відновлення.
      </p>
      <p style="margin:0;font-size:13px;color:#6e6e73;">
        Недоступний з: ${params.downtimeSince}
      </p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.dashboardUrl}" style="display:inline-block;background:#d6ff3f;color:#0a0a0a;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none;">
        Відкрити дашборд →
      </a>
    </div>

    <!-- Footer -->
    <p style="font-size:12px;color:#6e6e73;text-align:center;margin:0;">
      Ви отримали цей лист тому що у вас налаштовані email-алерти в Qorax.<br>
      Ми надішлемо повідомлення коли сайт відновиться.
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

export function buildSiteRecoveredEmail(params: {
  siteDisplayName: string;
  siteUrl: string;
  downtimeDurationMinutes: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subject = `✅ ${params.siteDisplayName} — сайт відновлено`;
  const durationText = params.downtimeDurationMinutes < 60
    ? `${params.downtimeDurationMinutes} хв`
    : `${Math.round(params.downtimeDurationMinutes / 60)} год ${params.downtimeDurationMinutes % 60} хв`;

  const html = `
<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
    </div>

    <div style="background:rgba(214,255,63,0.06);border:1px solid rgba(214,255,63,0.3);border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:10px;height:10px;border-radius:50%;background:#d6ff3f;"></div>
        <span style="font-size:13px;font-weight:600;color:#d6ff3f;text-transform:uppercase;letter-spacing:0.05em;">Сайт відновлено</span>
      </div>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#f5f5f7;">${params.siteDisplayName}</h1>
      <p style="margin:0;font-size:13px;color:#6e6e73;font-family:'Courier New',monospace;">${params.siteUrl}</p>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:14px;color:#a1a1a6;">
        Сайт знову доступний. Тривалість простою: <strong style="color:#f5f5f7;">${durationText}</strong>.
      </p>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.dashboardUrl}" style="display:inline-block;background:#d6ff3f;color:#0a0a0a;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none;">
        Відкрити дашборд →
      </a>
    </div>

    <p style="font-size:12px;color:#6e6e73;text-align:center;margin:0;">
      Qorax продовжує стежити за вашим сайтом.
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

export function buildSslExpiryEmail(params: {
  siteDisplayName: string;
  siteUrl: string;
  daysLeft: number;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const isUrgent = params.daysLeft <= 7;
  const subject = `${isUrgent ? "🚨" : "⚠️"} ${params.siteDisplayName} — SSL закінчується через ${params.daysLeft} днів`;
  const accentColor = isUrgent ? "#F5675A" : "#F5A623";
  const accentBg = isUrgent ? "rgba(245,103,90,0.08)" : "rgba(245,166,35,0.08)";
  const accentBorder = isUrgent ? "rgba(245,103,90,0.35)" : "rgba(245,166,35,0.3)";

  const html = `
<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
    </div>

    <div style="background:${accentBg};border:1px solid ${accentBorder};border-radius:16px;padding:24px;margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${accentColor};"></div>
        <span style="font-size:13px;font-weight:600;color:${accentColor};text-transform:uppercase;letter-spacing:0.05em;">
          SSL закінчується через ${params.daysLeft} днів
        </span>
      </div>
      <h1 style="margin:0 0 6px;font-size:20px;font-weight:600;color:#f5f5f7;">${params.siteDisplayName}</h1>
      <p style="margin:0;font-size:13px;color:#6e6e73;font-family:'Courier New',monospace;">${params.siteUrl}</p>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:20px;margin-bottom:24px;">
      <p style="margin:0;font-size:14px;color:#a1a1a6;">
        Після закінчення SSL браузери показуватимуть відвідувачам попередження про небезпеку.
        Поновіть сертифікат у свого хостинг-провайдера якнайшвидше.
      </p>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.dashboardUrl}" style="display:inline-block;background:#d6ff3f;color:#0a0a0a;font-size:14px;font-weight:600;padding:12px 28px;border-radius:12px;text-decoration:none;">
        Відкрити дашборд →
      </a>
    </div>

    <p style="font-size:12px;color:#6e6e73;text-align:center;margin:0;">
      Qorax автоматично перевіряє SSL кожні 5 хвилин.
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

// ─── Onboarding email templates ──────────────────────────────

export function buildWelcomeEmail(params: {
  firstName: string;
  email: string;
  dashboardUrl: string;
}): { subject: string; html: string } {
  const subject = `Ласкаво просимо до Qorax — ваш тріал активовано`;
  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
    </div>

    <div style="background:rgba(214,255,63,0.06);border:1px solid rgba(214,255,63,0.25);border-radius:16px;padding:28px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:22px;font-weight:600;color:#f5f5f7;">
        Привіт, ${params.firstName}! 👋
      </p>
      <p style="margin:0;font-size:15px;color:#8a9bb0;line-height:1.6;">
        Ваш 14-денний тріал активовано. Ви маєте повний доступ до Starter функцій — uptime, швидкість, SSL, AI-аналіз та email-алерти.
      </p>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#f5f5f7;">З чого почати:</p>
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:16px;line-height:1;">1️⃣</span>
          <div>
            <p style="margin:0 0 2px;font-size:14px;font-weight:500;color:#f5f5f7;">Додайте перший сайт</p>
            <p style="margin:0;font-size:13px;color:#8a9bb0;">Qorax одразу почне перевіряти uptime кожні 5 хвилин</p>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:16px;line-height:1;">2️⃣</span>
          <div>
            <p style="margin:0 0 2px;font-size:14px;font-weight:500;color:#f5f5f7;">Налаштуйте алерти</p>
            <p style="margin:0;font-size:13px;color:#8a9bb0;">Email або Telegram — щоб дізнаватись першими, не від клієнта</p>
          </div>
        </div>
        <div style="display:flex;align-items:flex-start;gap:12px;">
          <span style="font-size:16px;line-height:1;">3️⃣</span>
          <div>
            <p style="margin:0 0 2px;font-size:14px;font-weight:500;color:#f5f5f7;">Запитайте Qoraxus AI</p>
            <p style="margin:0;font-size:13px;color:#8a9bb0;">«Що виправити в першу чергу?» — і отримайте відповідь у грошах</p>
          </div>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.dashboardUrl}" style="display:inline-block;background:#D6FF3F;color:#0C111D;font-size:14px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">
        Відкрити дашборд →
      </a>
    </div>

    <p style="font-size:13px;color:#5a7090;text-align:center;margin:0;line-height:1.6;">
      Є питання? Просто відповідайте на цей лист.<br>
      Qorax · Моніторинг сайтів для бізнесу
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

export function buildTrialReminderEmail(params: {
  firstName: string;
  daysLeft: number;
  dashboardUrl: string;
  upgradeUrl: string;
}): { subject: string; html: string } {
  const isUrgent = params.daysLeft <= 3;
  const subject = isUrgent
    ? `⏰ Залишилось ${params.daysLeft} ${params.daysLeft === 1 ? "день" : "дні"} тріалу Qorax`
    : `Ваш тріал Qorax закінчується через ${params.daysLeft} днів`;

  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
    </div>

    <div style="background:${isUrgent ? "rgba(245,166,35,0.08)" : "rgba(140,246,255,0.06)"};border:1px solid ${isUrgent ? "rgba(245,166,35,0.3)" : "rgba(140,246,255,0.2)"};border-radius:16px;padding:28px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:13px;font-weight:600;color:${isUrgent ? "#F5A623" : "#8CF6FF"};text-transform:uppercase;letter-spacing:0.05em;">
        ${isUrgent ? "⏰ Скоро закінчується" : "Нагадування"}
      </p>
      <p style="margin:8px 0 0;font-size:20px;font-weight:600;color:#f5f5f7;">
        ${params.firstName}, ваш тріал закінчується через ${params.daysLeft} ${params.daysLeft === 1 ? "день" : params.daysLeft < 5 ? "дні" : "днів"}
      </p>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px;font-size:14px;color:#8a9bb0;line-height:1.6;">
        Після закінчення тріалу ваш акаунт перейде на <strong style="color:#f5f5f7;">безкоштовний план</strong> — uptime раз на 30 хвилин, без AI та SSL моніторингу.
      </p>
      <p style="margin:0;font-size:14px;color:#8a9bb0;line-height:1.6;">
        Оберіть план щоб зберегти повний доступ:
      </p>
      <div style="margin-top:16px;display:flex;flex-direction:column;gap:8px;">
        <div style="background:rgba(214,255,63,0.08);border:1px solid rgba(214,255,63,0.2);border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#f5f5f7;">Starter</p>
            <p style="margin:0;font-size:12px;color:#8a9bb0;">Uptime кожні 5 хв · SSL · AI-інсайти</p>
          </div>
          <span style="font-size:15px;font-weight:700;color:#D6FF3F;">$49/міс</span>
        </div>
        <div style="background:rgba(140,246,255,0.06);border:1px solid rgba(140,246,255,0.15);border-radius:10px;padding:14px 16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="margin:0 0 2px;font-size:14px;font-weight:600;color:#f5f5f7;">Growth</p>
            <p style="margin:0;font-size:12px;color:#8a9bb0;">+ CWV · SEO · Конкуренти · Qoraxus AI</p>
          </div>
          <span style="font-size:15px;font-weight:700;color:#8CF6FF;">$99/міс</span>
        </div>
      </div>
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.upgradeUrl}" style="display:inline-block;background:#D6FF3F;color:#0C111D;font-size:14px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">
        Обрати план →
      </a>
    </div>

    <p style="font-size:12px;color:#5a7090;text-align:center;margin:0;">
      Qorax · Моніторинг сайтів
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

export function buildTrialExpiredEmail(params: {
  firstName: string;
  dashboardUrl: string;
  upgradeUrl: string;
}): { subject: string; html: string } {
  const subject = `Ваш тріал Qorax закінчився — оберіть план`;
  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0C111D;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <div style="margin-bottom:32px;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
    </div>

    <div style="background:rgba(245,103,90,0.06);border:1px solid rgba(245,103,90,0.25);border-radius:16px;padding:28px;margin-bottom:24px;">
      <p style="margin:0 0 8px;font-size:20px;font-weight:600;color:#f5f5f7;">
        ${params.firstName}, ваш тріал закінчився
      </p>
      <p style="margin:0;font-size:15px;color:#8a9bb0;line-height:1.6;">
        Моніторинг переведено на безкоштовний план — uptime перевіряється раз на 30 хвилин, AI та SSL вимкнені.
      </p>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 12px;font-size:14px;font-weight:600;color:#f5f5f7;">Що ви втрачаєте на free плані:</p>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${[
          "Перевірка кожні 5 хвилин (замість 30)",
          "SSL та domain моніторинг",
          "AI-аналіз з revenue impact",
          "SEO аудит та Core Web Vitals",
          "Миттєві Telegram алерти",
        ].map(f => `<div style="display:flex;align-items:center;gap:8px;">
          <span style="color:#F5675A;font-size:14px;">✕</span>
          <span style="font-size:14px;color:#8a9bb0;">${f}</span>
        </div>`).join("")}
      </div>
    </div>

    <div style="text-align:center;margin-bottom:16px;">
      <a href="${params.upgradeUrl}" style="display:inline-block;background:#D6FF3F;color:#0C111D;font-size:14px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">
        Відновити доступ →
      </a>
    </div>
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.dashboardUrl}" style="font-size:13px;color:#5a7090;text-decoration:none;">
        Перейти до дашборду
      </a>
    </div>

    <p style="font-size:12px;color:#5a7090;text-align:center;margin:0;">
      Питання? Відповідайте на цей лист — ми допоможемо.<br>
      Qorax · Моніторинг сайтів
    </p>
  </div>
</body>
</html>`;
  return { subject, html };
}

// ─── Weekly Digest Email ──────────────────────────────────────

export function buildWeeklyDigestEmail(params: {
  firstName: string;
  siteName: string;
  siteUrl: string;
  dashboardUrl: string;
  uptimePct: number;
  avgSpeedMs: number | null;
  prevAvgSpeedMs: number | null;
  incidentsCount: number;
  totalDowntimeMinutes: number;
  newSeoIssues: number;
  sslDaysLeft: number | null;
}): { subject: string; html: string } {
  const subject = `📊 Тижневий звіт Qorax — ${params.siteName}`;

  const uptimeColor = params.uptimePct >= 99.5 ? "#d6ff3f" : params.uptimePct >= 98 ? "#F5A623" : "#F5675A";
  const uptimeLabel = params.uptimePct >= 99.5 ? "Відмінно" : params.uptimePct >= 98 ? "Прийнятно" : "Увага";

  const speedDelta = params.avgSpeedMs && params.prevAvgSpeedMs
    ? params.avgSpeedMs - params.prevAvgSpeedMs
    : null;
  const speedColor = !params.avgSpeedMs ? "#6e6e73"
    : params.avgSpeedMs <= 1500 ? "#d6ff3f"
    : params.avgSpeedMs <= 3000 ? "#F5A623" : "#F5675A";

  const fmtMs = (ms: number) => ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
  const fmtUptime = (pct: number) => pct.toFixed(2) + "%";

  const speedDeltaHtml = speedDelta !== null
    ? `<span style="font-size:12px;color:${speedDelta > 0 ? "#F5675A" : "#d6ff3f"};margin-left:6px;">${speedDelta > 0 ? "▲" : "▼"} ${fmtMs(Math.abs(speedDelta))} vs минулого тижня</span>`
    : "";

  const downtimeHtml = params.totalDowntimeMinutes > 0
    ? `<div style="background:rgba(245,103,90,0.06);border:1px solid rgba(245,103,90,0.2);border-radius:10px;padding:14px 16px;margin-top:12px;">
        <p style="margin:0;font-size:13px;color:#a1a1a6;">Загальний простій: <strong style="color:#F5675A;">${params.totalDowntimeMinutes} хв</strong> за ${params.incidentsCount} ${params.incidentsCount === 1 ? "інцидент" : "інциденти"}</p>
      </div>`
    : `<div style="background:rgba(214,255,63,0.05);border:1px solid rgba(214,255,63,0.15);border-radius:10px;padding:14px 16px;margin-top:12px;">
        <p style="margin:0;font-size:13px;color:#a1a1a6;">✓ Жодного падіння за тиждень</p>
      </div>`;

  const seoHtml = params.newSeoIssues > 0
    ? `<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
        <span style="font-size:13px;color:#a1a1a6;">Нові SEO проблеми</span>
        <span style="font-size:13px;font-weight:600;color:#F5A623;">${params.newSeoIssues}</span>
      </div>`
    : "";

  const sslHtml = params.sslDaysLeft !== null && params.sslDaysLeft < 30
    ? `<div style="background:rgba(245,166,35,0.06);border:1px solid rgba(245,166,35,0.2);border-radius:10px;padding:14px 16px;margin-top:12px;">
        <p style="margin:0;font-size:13px;color:#a1a1a6;">⚠️ SSL закінчується через <strong style="color:#F5A623;">${params.sslDaysLeft} днів</strong> — поновіть вчасно</p>
      </div>`
    : "";

  const html = `<!DOCTYPE html>
<html lang="uk">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 24px;">

    <div style="margin-bottom:28px;display:flex;align-items:center;justify-content:space-between;">
      <span style="font-size:18px;font-weight:700;color:#f5f5f7;letter-spacing:-0.02em;">Qorax</span>
      <span style="font-size:12px;color:#6e6e73;">Тижневий звіт</span>
    </div>

    <div style="margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:20px;font-weight:600;color:#f5f5f7;">${params.siteName}</p>
      <p style="margin:0;font-size:13px;color:#6e6e73;font-family:'Courier New',monospace;">${params.siteUrl}</p>
    </div>

    <!-- Uptime блок -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;margin-bottom:16px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.06em;">Доступність</p>
      <div style="display:flex;align-items:baseline;gap:10px;">
        <span style="font-size:36px;font-weight:700;color:${uptimeColor};letter-spacing:-0.02em;">${fmtUptime(params.uptimePct)}</span>
        <span style="font-size:12px;color:${uptimeColor};font-weight:600;">${uptimeLabel}</span>
      </div>
      ${downtimeHtml}
    </div>

    <!-- Speed блок -->
    <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;margin-bottom:16px;">
      <p style="margin:0 0 12px;font-size:12px;font-weight:600;color:#6e6e73;text-transform:uppercase;letter-spacing:0.06em;">Час відповіді (середній)</p>
      ${params.avgSpeedMs
        ? `<div style="display:flex;align-items:baseline;gap:8px;">
            <span style="font-size:32px;font-weight:700;color:${speedColor};letter-spacing:-0.02em;">${fmtMs(params.avgSpeedMs)}</span>
            ${speedDeltaHtml}
          </div>`
        : `<span style="font-size:14px;color:#6e6e73;">Дані з'являться після першого скану</span>`
      }
    </div>

    <!-- Метрики рядок -->
    ${(seoHtml || sslHtml) ? `<div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.07);border-radius:16px;padding:20px;margin-bottom:16px;">${seoHtml}${sslHtml}</div>` : ""}

    <div style="text-align:center;margin:28px 0;">
      <a href="${params.dashboardUrl}" style="display:inline-block;background:#d6ff3f;color:#0a0a0a;font-size:14px;font-weight:600;padding:13px 28px;border-radius:12px;text-decoration:none;">
        Повний звіт у дашборді →
      </a>
    </div>

    <p style="font-size:12px;color:#6e6e73;text-align:center;margin:0;line-height:1.7;">
      Звіт генерується щопонеділка автоматично.<br>
      Qorax · Моніторинг сайтів
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
}
