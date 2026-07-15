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

// ============================================================
// Site Inspector (MODULE_ROADMAP.md, "Qorax Browser" — наступна
// ітерація після MVP AI Sidebar). GET /api/browser/inspect
// ============================================================
// Свідоме обмеження: без DOM-парсера в Cloudflare Workers (той самий
// коментар, що вже є в basicCheck.ts — HTMLRewriter потоковий, не
// дає зручного querySelector-доступу), тому:
// - meta/SEO/технології/аналітика — regex по сирому HTML, той самий
//   підхід, що parseHtmlSignals() в basicCheck.ts
// - кольори/шрифти — НЕ regex по inline-стилях сторінки (це давало б
//   випадкові/неточні значення), а реальна вибірка з перших 1-2
//   зовнішніх CSS-файлів (<link rel="stylesheet">) — значно точніше
//   наближення до того, що реально визначає вигляд сайту

interface InspectResult {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  technologies: string[];
  analytics: string[];
  colors: string[];
  fonts: string[];
  responseTimeMs: number;
  pageSizeKb: number;
}

// Патерни детекту технологій/CMS — той самий принцип, що roadmap
// описує для Site Inspector ("CMS, Framework"), обмежено
// найпоширенішими варіантами, які реально трапляються в HTML-розмітці
// без виконання JS (React/Vue/Next видно по атрибутах чи __NEXT_DATA__,
// решта — по характерних шляхах до статичних файлів чи мета-тегах).
const TECH_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "WordPress", pattern: /wp-content|wp-includes|\/wp-json\// },
  { name: "Shopify", pattern: /cdn\.shopify\.com|Shopify\.theme/ },
  { name: "Wix", pattern: /static\.wixstatic\.com|wix\.com/i },
  { name: "Squarespace", pattern: /squarespace\.com|static1\.squarespace\.com/ },
  { name: "Webflow", pattern: /webflow\.com|data-wf-site/ },
  { name: "Next.js", pattern: /__NEXT_DATA__|_next\/static/ },
  { name: "React", pattern: /data-reactroot|react-dom/ },
  { name: "Vue.js", pattern: /data-v-app|__VUE__|vue\.js/i },
  { name: "Tailwind CSS", pattern: /tailwindcss|tailwind\.min\.css/ },
  { name: "Bootstrap", pattern: /bootstrap(\.min)?\.css|bootstrap(\.min)?\.js/ },
];

const ANALYTICS_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: "Google Analytics", pattern: /gtag\(|googletagmanager\.com\/gtag|google-analytics\.com/ },
  { name: "Google Tag Manager", pattern: /googletagmanager\.com\/gtm\.js/ },
  { name: "Facebook Pixel", pattern: /connect\.facebook\.net.*fbevents/ },
  { name: "Hotjar", pattern: /static\.hotjar\.com/ },
  { name: "Microsoft Clarity", pattern: /clarity\.ms/ },
];

function detectSignatures(html: string, signatures: Array<{ name: string; pattern: RegExp }>): string[] {
  return signatures.filter(sig => sig.pattern.test(html)).map(sig => sig.name);
}

/** HEX/rgb() кольори з тексту CSS, дедуплiковані, обмежені перших 8 —
 * достатньо для орієнтовної палітри, не вичерпний аудит кожного відтінку. */
function extractColors(css: string): string[] {
  const hexMatches = css.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
  const rgbMatches = css.match(/rgba?\([^)]+\)/g) ?? [];
  const unique = Array.from(new Set([...hexMatches, ...rgbMatches]));
  return unique.slice(0, 8);
}

/** font-family значення з CSS, очищені від лапок/fallback-списку —
 * лишаємо перше ім'я з кожного family-переліку. */
function extractFonts(css: string): string[] {
  const matches = css.match(/font-family\s*:\s*([^;}\n]+)/gi) ?? [];
  const names = matches.map(m => {
    const value = m.split(":")[1] ?? "";
    const first = value.split(",")[0] ?? "";
    return first.replace(/["']/g, "").trim();
  });
  return Array.from(new Set(names.filter(Boolean))).slice(0, 6);
}

async function fetchExternalCss(html: string, baseUrl: URL): Promise<string> {
  const linkMatches = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)];
  const hrefs: string[] = [];
  for (const link of linkMatches.slice(0, 2)) {
    // Найперші 2 stylesheet-посилання сторінки — той самий компроміс,
    // що обрізання HTML в handleBrowserAnalyze: досить для орієнтовної
    // палітри/шрифтів, не вимагає вантажити весь CSS сайту.
    const hrefMatch = link[0].match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    try {
      hrefs.push(new URL(hrefMatch[1], baseUrl).toString());
    } catch {
      continue;
    }
  }

  const cssTexts = await Promise.all(
    hrefs.map(async href => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5_000);
        const res = await fetch(href, { signal: controller.signal, headers: { "User-Agent": BROWSER_USER_AGENT } });
        clearTimeout(timeout);
        if (!res.ok) return "";
        return await res.text();
      } catch {
        return "";
      }
    })
  );
  return cssTexts.join("\n");
}

// GET /api/browser/inspect?url=...&organization_id=...
export async function handleBrowserInspect(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const targetUrlRaw = url.searchParams.get("url");
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!targetUrlRaw) return json({ error: "url обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const targetUrl = isValidHttpUrl(targetUrlRaw);
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const startedAt = Date.now();
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
  const responseTimeMs = Date.now() - startedAt;

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);

  const externalCss = await fetchExternalCss(html, targetUrl);
  // Inline <style> блоки теж додаємо до пулу для кольорів/шрифтів —
  // не єдине джерело (як спершу відкидали), а доповнення до
  // зовнішнього CSS, яке нічого не коштує (вже маємо html в пам'яті).
  const inlineStyles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const cssPool = `${externalCss}\n${inlineStyles}`;

  const result: InspectResult = {
    title: titleMatch?.[1]?.trim() || null,
    metaDescription: descMatch?.[1]?.trim() || null,
    h1: h1Match?.[1]?.trim() || null,
    technologies: detectSignatures(html, TECH_SIGNATURES),
    analytics: detectSignatures(html, ANALYTICS_SIGNATURES),
    colors: extractColors(cssPool),
    fonts: extractFonts(cssPool),
    responseTimeMs,
    pageSizeKb: Math.round((new TextEncoder().encode(html).length / 1024) * 10) / 10,
  };

  return json(result, 200, corsHeaders);
}

