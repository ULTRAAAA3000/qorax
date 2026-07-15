// ============================================================
// browserHandler.ts — Qorax Browser MVP
// (MODULE_ROADMAP.md, "Qorax Browser — окремий продукт екосистеми")
// ============================================================
// MVP-обсяг (узгоджено з Артемом): лише URL bar + proxy-перегляд
// сайту + AI Sidebar ("що це за сайт?"). Жодних Collections/Smart
// Capture/Site Inspector/Component Extractor — ці лишаються
// майбутніми ітераціями за roadmap.
//
// ── Технічний підхід proxy: <base href> rewrite, НЕ повне
// проксування всіх ресурсів сторінки ──────────────────────────
// Worker завантажує лише HTML-документ і переписує його так, щоб
// CSS/JS/зображення/шрифти вантажились браузером користувача НАПРЯМУ
// з оригінального сайту (не через Worker). Це свідомий компроміс:
// - X-Frame-Options/CSP frame-ancestors блокують ЛИШЕ сам HTML-документ
//   в iframe, не суб-ресурси — тому ми знімаємо ці заголовки з відповіді
//   проксі, а не намагаємось проксувати кожен CSS/JS-файл окремо
// - <base href="{origin}/"> в <head> — усі відносні шляхи сторінки
//   (href="/style.css", src="/logo.png") автоматично резолвляться в
//   абсолютні URL оригінального сайту, браузер вантажить їх сам
// - SPA/JS-важкі сайти (React/Vue), сайти з жорсткими anti-bot
//   захистами (Cloudflare/DataDome/reCAPTCHA), і сайти з CSP, що явно
//   забороняє власний домен у frame-ancestors на рівні meta-тегу
//   (не лише HTTP-заголовка) — можуть відображатись некоректно або
//   не відображатись зовсім. Це відоме обмеження MVP, не баг.

import type { Env } from "../types";
import { json } from "./httpUtils";
import { requireOrgAccess } from "./orgAuth";
import { insertRow, selectRows } from "./supabase";
import { checkAiCredits, deductAiCredits } from "./aiCredits";
import { callGemini } from "./contentGeneration";

// Справжній браузерний User-Agent — на відміну від DEFAULT_USER_AGENT
// в httpUtils.ts (той навмисно бот-агент "QoraxBot/1.0" для чесного
// SEO-моніторингу). Тут навпаки: сайт має віддати ту саму версію
// сторінки, що звичайному відвідувачу в Chrome, інакше proxy
// показуватиме урізаний/інший контент.
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const FETCH_TIMEOUT_MS = 15_000;

function isValidHttpUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Вставляє <base href="{origin}/"> одразу після <head ...> (або на
 * початок документа, якщо <head> відсутній) — робить усі відносні
 * шляхи сторінки абсолютними відносно оригінального сайту.
 */
function injectBaseHref(html: string, origin: string): string {
  const baseTag = `<base href="${origin}/">`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    const idx = html.indexOf(headMatch[0]) + headMatch[0].length;
    return html.slice(0, idx) + baseTag + html.slice(idx);
  }
  return baseTag + html;
}

// GET /api/browser/proxy?url=...&organization_id=...
// Повертає HTML сторінки з <base href> rewrite, без frame-blocking
// заголовків. Рендериться в <iframe> на фронтенді.
export async function handleBrowserProxy(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const targetUrlRaw = url.searchParams.get("url");
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!targetUrlRaw) return json({ error: "url обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const targetUrl = isValidHttpUrl(targetUrlRaw);
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let upstream: Response;
  try {
    upstream = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
  } catch {
    clearTimeout(timeout);
    return json({ error: "Не вдалося завантажити сайт (таймаут або сайт недоступний)" }, 502, corsHeaders);
  }
  clearTimeout(timeout);

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!upstream.ok) {
    return json({ error: `Сайт повернув помилку: HTTP ${upstream.status}` }, 502, corsHeaders);
  }
  if (!contentType.includes("text/html")) {
    // Не-HTML ресурс за цим URL (наприклад пряме посилання на PDF/зображення) —
    // proxy MVP свідомо працює лише з HTML-сторінками, не універсальний файловий proxy.
    return json({ error: "URL веде не на HTML-сторінку" }, 415, corsHeaders);
  }

  const html = await upstream.text();
  const rewritten = injectBaseHref(html, targetUrl.origin);

  // Навмисно НЕ передаємо жодних заголовків з upstream (X-Frame-Options/
  // CSP/тощо) — тільки наші власні corsHeaders + content-type. Це і є
  // технічний механізм, що дозволяє показати сторінку в iframe.
  return new Response(rewritten, {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "text/html; charset=utf-8" },
  });
}

interface AnalyzeBody {
  url: string;
  organization_id: string;
}

// POST /api/browser/analyze — AI Sidebar "що це за сайт?" + базовий
// SEO-огляд. Переюзовує callGemini з contentGeneration.ts (не новий
// AI-виклик з нуля) і checkAiCredits/deductAiCredits з aiCredits.ts
// (той самий безлімітний-для-адміна credit pool, що решта AI-фіч
// Business — Browser це окремий продукт, але кредити спільні).
export async function handleBrowserAnalyze(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: AnalyzeBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const targetUrl = isValidHttpUrl(body.url ?? "");
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  // Кеш: якщо цей самий URL вже аналізувався для організації нещодавно —
  // повертаємо збережений ai_summary замість повторного виклику Gemini.
  const cachedRes = await selectRows<{ id: string; ai_summary: string | null }>(
    "browser_history",
    `select=id,ai_summary&organization_id=eq.${encodeURIComponent(body.organization_id)}&url=eq.${encodeURIComponent(targetUrl.toString())}&ai_summary=not.is.null&order=visited_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const cached = cachedRes.data?.[0];
  if (cached?.ai_summary) {
    return json({ summary: cached.ai_summary, cached: true }, 200, corsHeaders);
  }

  const creditsCheck = await checkAiCredits(body.organization_id, env);
  if (!creditsCheck.ok) {
    return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const upstream = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });
    html = await upstream.text();
  } catch {
    clearTimeout(timeout);
    return json({ error: "Не вдалося завантажити сайт для аналізу" }, 502, corsHeaders);
  }
  clearTimeout(timeout);

  // Обрізаємо HTML перед промптом — сирі сторінки бувають сотні KB,
  // а для "що це за сайт" достатньо перших ~15000 символів (title,
  // meta, hero-контент зазвичай на початку документа).
  const truncatedHtml = html.slice(0, 15_000);

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const prompt = `Ти — AI Sidebar у браузері Qorax. Користувач відкрив сайт ${targetUrl.toString()}.
Ось сирий HTML цієї сторінки (може містити зайві теги, ігноруй розмітку, аналізуй зміст):
${truncatedHtml}

Дай коротку відповідь українською (3-5 речень): що це за сайт/сторінка, чим займається компанія чи автор, і один короткий SEO-спостереження (наприклад про title/meta чи структуру, якщо є на що звернути увагу). Без вступних фраз на кшталт "Ось аналіз", одразу суть.`;

  const result = await callGemini(prompt, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);

  // Записуємо в історію (і кешуємо ai_summary для наступного разу)
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  await insertRow(
    "browser_history",
    {
      organization_id: body.organization_id,
      url: targetUrl.toString(),
      title: titleMatch?.[1]?.trim() ?? null,
      ai_summary: result.text,
      visited_by: access.userId ?? null,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return json({ summary: result.text, cached: false, credits_remaining: creditsRemaining, unlimited: creditsCheck.unlimited }, 200, corsHeaders);
}

// GET /api/browser/history?organization_id=... — недавні відвідані сайти
export async function handleBrowserHistory(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<{ id: string; url: string; title: string | null; visited_at: string }>(
    "browser_history",
    `select=id,url,title,visited_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=visited_at.desc&limit=20`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ history: res.data }, 200, corsHeaders);
}
