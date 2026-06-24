// app/lib/onboarding-email.ts
// Тонкий wrapper — повертає Promise щоб auth-actions міг
// викликати fire-and-forget без імпорту worker-специфічного коду.

export function buildWelcomeEmail(params: {
  firstName: string;
  email: string;
  dashboardUrl: string;
}): Promise<{ subject: string; html: string }> {
  const subject = `Ласкаво просимо до Qorax — ваш тріал активовано`;

  const steps = [
    ["1️⃣", "Додайте перший сайт", "Qorax одразу почне перевіряти uptime кожні 5 хвилин"],
    ["2️⃣", "Налаштуйте алерти", "Email або Telegram — щоб дізнаватись першими, не від клієнта"],
    ["3️⃣", "Запитайте Qoraxus AI", "«Що виправити в першу чергу?» — відповідь у грошах"],
  ];

  const stepsHtml = steps
    .map(
      ([emoji, title, desc]) => `
      <div style="display:flex;align-items:flex-start;gap:12px;margin-bottom:12px;">
        <span style="font-size:16px;line-height:1.4;">${emoji}</span>
        <div>
          <p style="margin:0 0 2px;font-size:14px;font-weight:500;color:#f5f5f7;">${title}</p>
          <p style="margin:0;font-size:13px;color:#8a9bb0;">${desc}</p>
        </div>
      </div>`
    )
    .join("");

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
        Ваш 14-денний тріал активовано. Повний Starter доступ — uptime, швидкість, SSL, AI-аналіз та email-алерти.
      </p>
    </div>

    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:24px;margin-bottom:24px;">
      <p style="margin:0 0 16px;font-size:14px;font-weight:600;color:#f5f5f7;">З чого почати:</p>
      ${stepsHtml}
    </div>

    <div style="text-align:center;margin-bottom:32px;">
      <a href="${params.dashboardUrl}"
         style="display:inline-block;background:#D6FF3F;color:#0C111D;font-size:14px;font-weight:600;padding:14px 32px;border-radius:12px;text-decoration:none;">
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

  return Promise.resolve({ subject, html });
}
