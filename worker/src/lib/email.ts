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
