// ============================================================
// fixRequestHandler.ts — POST /api/fix-request
// Заявка клієнта на виправлення проблеми силами студії Qorax
// (не маркетплейс — заявки йдуть напряму власнику студії через
// email + Telegram, обробка вручну).
//
// Доступно з Growth+ плану. 1 безкоштовна заявка/місяць на
// організацію (сумарно по всіх сайтах), далі — платно за
// домовленістю з клієнтом окремо.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow } from "./supabase";
import { corsHeaders } from "./cors";
import { sendEmail } from "./email";
import { sendTelegramMessage } from "./telegram";

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(origin) },
  });
}

interface FixRequestBody {
  site_id: string;
  insight_id?: string | null;
  problem_description: string;
  site_platform?: string | null;
}

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  organization_id: string;
}

interface PlanRow {
  code: string;
}

interface SubscriptionRow {
  status: string;
  plans: PlanRow | null;
}

const PLATFORM_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  tilda: "Tilda",
  wix: "Wix",
  custom: "Кастомна розробка",
  other: "Інше / не знаю",
};

export async function handleFixRequest(
  request: Request,
  env: Env,
  origin: string | null
): Promise<Response> {
  let body: FixRequestBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Невірний формат запиту" }, 400, origin);
  }

  if (!body.site_id || typeof body.site_id !== "string") {
    return json({ error: "site_id обов'язковий" }, 400, origin);
  }
  const problemDescription = (body.problem_description ?? "").trim();
  if (!problemDescription) {
    return json({ error: "Опишіть проблему" }, 400, origin);
  }

  // Аутентифікація через Supabase JWT
  const authHeader = request.headers.get("Authorization");
  const jwt = authHeader?.replace("Bearer ", "").trim();
  if (!jwt) {
    return json({ error: "Unauthorized" }, 401, origin);
  }

  const userResp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${jwt}`,
    },
  });
  if (!userResp.ok) {
    return json({ error: "Unauthorized" }, 401, origin);
  }
  const user = await userResp.json() as { id: string; email?: string };

  // Перевіряємо що сайт існує і дістаємо organization_id
  const siteResult = await selectRows<SiteRow>(
    "sites",
    `select=id,url,display_name,organization_id&id=eq.${body.site_id}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!siteResult.ok || !siteResult.data[0]) {
    return json({ error: "Сайт не знайдено" }, 404, origin);
  }
  const site = siteResult.data[0];

  // Перевіряємо план — доступно з Growth+
  const subResult = await selectRows<SubscriptionRow>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(site.organization_id)}&status=in.(trialing,active)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const sub = subResult.data[0];
  const planCode = (sub?.plans as PlanRow | null)?.code ?? "free";
  const hasAccess = ["growth", "agency", "admin", "trial"].includes(planCode);
  if (!hasAccess) {
    return json(
      {
        error: "upgrade_required",
        message: "Замовлення виправлень доступне з плану Growth ($99/міс)",
      },
      403,
      origin
    );
  }

  // Рахуємо скільки безкоштовних заявок вже використано цього місяця
  // (по всій організації, а не по конкретному сайту)
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const usedThisMonthResult = await selectRows<{ id: string }>(
    "fix_requests",
    `select=id&organization_id=eq.${encodeURIComponent(site.organization_id)}&is_free=eq.true&created_at=gte.${monthStart.toISOString()}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const freeUsedThisMonth = usedThisMonthResult.data?.length ?? 0;
  const FREE_REQUESTS_PER_MONTH = 1;
  const isFree = freeUsedThisMonth < FREE_REQUESTS_PER_MONTH;

  // Створюємо тикет
  const insertResult = await insertRow(
    "fix_requests",
    {
      organization_id: site.organization_id,
      site_id: site.id,
      insight_id: body.insight_id ?? null,
      requested_by: user.id,
      problem_description: problemDescription,
      site_platform: body.site_platform ?? null,
      is_free: isFree,
      status: "new",
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!insertResult.ok) {
    return json({ error: "Не вдалося створити заявку. Спробуйте пізніше." }, 500, origin);
  }

  // Сповіщення власнику студії — email + Telegram. Не блокуємо відповідь
  // клієнту якщо сповіщення не надішлються (тикет уже збережено в БД,
  // видно в адмінці навіть без сповіщень).
  const platformLabel = body.site_platform ? (PLATFORM_LABELS[body.site_platform] ?? body.site_platform) : "Не вказано";
  const dashboardUrl = `${env.APP_URL}/dashboard/admin`;

  const notifyPromises: Promise<unknown>[] = [];

  if (env.OWNER_EMAIL) {
    const html = `
      <div style="font-family:sans-serif;max-width:560px;">
        <h2 style="margin-bottom:4px;">${isFree ? "🆓" : "💰"} Нова заявка на виправлення</h2>
        <p style="color:#666;margin-top:0;">${isFree ? "Безкоштовна (в межах ліміту плану)" : "Платна — узгодити ціну з клієнтом"}</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
          <tr><td style="padding:6px 0;color:#666;">Сайт</td><td style="padding:6px 0;font-weight:600;">${site.display_name}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">URL</td><td style="padding:6px 0;"><code>${site.url}</code></td></tr>
          <tr><td style="padding:6px 0;color:#666;">Платформа</td><td style="padding:6px 0;">${platformLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#666;">Клієнт</td><td style="padding:6px 0;">${user.email ?? "—"}</td></tr>
        </table>
        <p style="white-space:pre-wrap;background:#f5f5f5;padding:12px;border-radius:8px;">${problemDescription}</p>
        <p><a href="${dashboardUrl}" style="color:#0066cc;">→ Відкрити адмін-панель</a></p>
      </div>`;
    notifyPromises.push(
      sendEmail(
        { to: env.OWNER_EMAIL, subject: `${isFree ? "🆓" : "💰"} Заявка на виправлення — ${site.display_name}`, html },
        env.RESEND_API_KEY
      ).catch(() => {})
    );
  }

  if (env.OWNER_TELEGRAM_CHAT_ID && env.TELEGRAM_BOT_TOKEN) {
    const tgText = `${isFree ? "🆓" : "💰"} <b>Нова заявка на виправлення</b>

<b>${site.display_name}</b>
<code>${site.url}</code>

Платформа: <b>${platformLabel}</b>
Клієнт: ${user.email ?? "—"}
Тип: ${isFree ? "Безкоштовна (ліміт плану)" : "Платна"}

${problemDescription}

<a href="${dashboardUrl}">→ Адмін-панель</a>`;
    notifyPromises.push(
      sendTelegramMessage(env.OWNER_TELEGRAM_CHAT_ID, tgText, env.TELEGRAM_BOT_TOKEN).catch(() => {})
    );
  }

  await Promise.allSettled(notifyPromises);

  return json({ ok: true, isFree }, 200, origin);
}
