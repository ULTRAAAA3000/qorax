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
import { insertRow, selectRows, updateRows } from "./supabase";
import { checkAiCredits, deductAiCredits } from "./aiCredits";
import { callGemini, callGeminiVision } from "./contentGeneration";
import { handleDocCreate } from "./officeHandler";
import { checkRateLimit, getClientIp } from "./rateLimit";

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

/**
 * Smart Capture (MODULE_ROADMAP.md, "Qorax Browser") — вставляє
 * скрипт, що слухає selectionchange всередині проксованої сторінки
 * і шле postMessage батьківському вікну з виділеним текстом.
 *
 * Навіщо взагалі потрібен цей інжект: фронтенд (Next.js Worker) і
 * API_BASE_URL (qorax-api Worker) — РІЗНІ origin у продакшені, тому
 * `iframe.contentWindow.getSelection()` з батьківської сторінки
 * заблоковано same-origin policy браузера, попри sandbox=
 * "allow-same-origin" (той дозволяє iframe поводитись як
 * same-origin ВІДНОСНО СЕБЕ, не дає доступу батьківському вікну,
 * якщо origin реально різні). postMessage — єдиний надійний міст
 * між origin в цій ситуації, тому скрипт інжектиться на сервері
 * (не можна покластись на code в самому чужому сайті).
 */
function injectSelectionScript(html: string): string {
  const script = `<script>
(function() {
  document.addEventListener("selectionchange", function() {
    var text = (document.getSelection() || {}).toString();
    if (text && text.trim().length > 0) {
      window.parent.postMessage({ source: "qorax-browser", type: "selection", text: text.trim() }, "*");
    }
  });
})();
</script>`;
  const bodyCloseIdx = html.lastIndexOf("</body>");
  if (bodyCloseIdx !== -1) {
    return html.slice(0, bodyCloseIdx) + script + html.slice(bodyCloseIdx);
  }
  return html + script;
}

// ── Proxy token (виправлення критичного бага) ──────────────────────
// <iframe src="..."> — це звичайна браузерна навігація, вона фізично
// НЕ МОЖЕ надіслати заголовок Authorization: Bearer <token> (той
// працює лише для fetch()-запитів з JS). Тому requireOrgAccess()
// (що читає саме цей заголовок) завжди повертав Unauthorized для
// прямого <iframe src>, ЩО Й БУЛО БАГОМ — proxy ніколи не міг
// спрацювати через iframe з таким типом авторизації.
//
// Рішення: короткоживущий одноразовий токен у query-параметрі.
// Фронтенд СПОЧАТКУ робить звичайний authenticated fetch (Bearer JWT)
// на /api/browser/proxy-token, отримує токен, ПОТІМ підставляє його
// в src iframe замість organization_id. Токен зберігається в
// RATE_LIMIT_KV (перевикористання наявного KV namespace, не новий
// біндинг) з TTL 60 секунд — достатньо для завантаження iframe,
// замало для практичного зловживання навіть якщо токен кудись
// протече (напр. в логи сервера через query-параметр).

const PROXY_TOKEN_TTL_SEC = 60;

interface ProxyTokenBody {
  organization_id: string;
}

// POST /api/browser/proxy-token
export async function handleProxyTokenIssue(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: ProxyTokenBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const token = crypto.randomUUID();
  await env.RATE_LIMIT_KV.put(`browser-proxy-token:${token}`, body.organization_id, { expirationTtl: PROXY_TOKEN_TTL_SEC });

  return json({ token }, 200, corsHeaders);
}

// GET /api/browser/proxy?url=...&token=...
// Повертає HTML сторінки з <base href> rewrite, без frame-blocking
// заголовків. Рендериться в <iframe> на фронтенді.
export async function handleBrowserProxy(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const targetUrlRaw = url.searchParams.get("url");
  const token = url.searchParams.get("token");
  if (!token) return json({ error: "token обов'язковий" }, 400, corsHeaders);
  if (!targetUrlRaw) return json({ error: "url обов'язковий" }, 400, corsHeaders);

  // Rate limit по IP — proxy виконує зовнішній fetch на довільний URL,
  // без ліміту Worker можна використати як анонімний HTTP-проксі
  // (відомий пробіл, зафіксований ще в EXECUTION_PLAN.md при MVP).
  const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `browser-proxy:${getClientIp(request)}`, 60, 60);
  if (!rateLimit.allowed) return json({ error: "Забагато запитів, спробуйте пізніше" }, 429, corsHeaders);

  const organizationId = await env.RATE_LIMIT_KV.get(`browser-proxy-token:${token}`);
  if (!organizationId) return json({ error: "Токен недійсний або прострочений" }, 401, corsHeaders);

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
  const withBase = injectBaseHref(html, targetUrl.origin);
  const rewritten = injectSelectionScript(withBase);

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
  const collectionId = url.searchParams.get("collection_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  // Без collection_id — загальна історія (останні 20, як і раніше).
  // З collection_id — усі записи саме цієї колекції (без ліміту 20,
  // колекція — свідомо збережений список, не "недавнє").
  const filter = collectionId
    ? `collection_id=eq.${encodeURIComponent(collectionId)}`
    : `order=visited_at.desc&limit=20`;

  const res = await selectRows<{ id: string; url: string; title: string | null; visited_at: string; collection_id: string | null; note: string | null }>(
    "browser_history",
    `select=id,url,title,visited_at,collection_id,note&organization_id=eq.${encodeURIComponent(organizationId)}&${filter}`,
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
/** Спільне ядро Site Inspector — виділено з handleBrowserInspect, щоб
 * AI Compare міг перевикористати той самий аналіз для ДВОХ сайтів
 * замість дублювання fetch+regex-парсингу вдруге. */
async function inspectUrl(targetUrl: URL): Promise<InspectResult | null> {
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
    return null;
  }
  clearTimeout(timeout);
  const responseTimeMs = Date.now() - startedAt;

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);

  const externalCss = await fetchExternalCss(html, targetUrl);
  const inlineStyles = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join("\n");
  const cssPool = `${externalCss}\n${inlineStyles}`;

  return {
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
}

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

  const result = await inspectUrl(targetUrl);
  if (!result) return json({ error: "Не вдалося завантажити сайт для аналізу" }, 502, corsHeaders);

  return json(result, 200, corsHeaders);
}

// ============================================================
// Collections (MODULE_ROADMAP.md, "Qorax Browser" — третя ітерація
// після MVP AI Sidebar → Site Inspector). "Вбивця закладок" — проєкт,
// що групує вже наявні browser_history записи + нотатки.
// ============================================================

interface CollectionRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// GET /api/browser/collections?organization_id=...
export async function handleCollectionsList(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await selectRows<CollectionRow>(
    "browser_collections",
    `select=id,organization_id,title,description,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ collections: res.data }, 200, corsHeaders);
}

interface CreateCollectionBody {
  organization_id: string;
  title: string;
  description?: string;
}

// POST /api/browser/collections
export async function handleCollectionCreate(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: CreateCollectionBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!body.title?.trim()) return json({ error: "Назва колекції обов'язкова" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await insertRow(
    "browser_collections",
    { organization_id: body.organization_id, title: body.title.trim(), description: body.description?.trim() || null, created_by: access.userId ?? null },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

async function getCollectionOrgId(collectionId: string, env: Env): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "browser_collections",
    `select=organization_id&id=eq.${encodeURIComponent(collectionId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data?.[0]?.organization_id ?? null;
}

// DELETE /api/browser/collections/:id
export async function handleCollectionDelete(request: Request, env: Env, corsHeaders: Record<string, string>, collectionId: string): Promise<Response> {
  const organizationId = await getCollectionOrgId(collectionId, env);
  if (!organizationId) return json({ error: "Колекцію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  // on delete set null на browser_history.collection_id (0077) сам
  // розгрупує записи — видаляємо лише саму колекцію.
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/browser_collections?id=eq.${encodeURIComponent(collectionId)}&organization_id=eq.${encodeURIComponent(organizationId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!res.ok) return json({ error: `Delete failed: ${res.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

interface SaveToCollectionBody {
  organization_id: string;
  url: string;
  title?: string;
  collection_id: string;
  note?: string;
}

// POST /api/browser/collections/save — зберігає поточний сайт у
// колекцію. Якщо запис з таким url вже є в загальній історії — оновлює
// його (додає collection_id/note), інакше створює новий запис
// browser_history одразу з collection_id.
export async function handleCollectionSaveItem(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: SaveToCollectionBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!body.collection_id) return json({ error: "collection_id обов'язковий" }, 400, corsHeaders);
  const targetUrl = isValidHttpUrl(body.url ?? "");
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const existingRes = await selectRows<{ id: string }>(
    "browser_history",
    `select=id&organization_id=eq.${encodeURIComponent(body.organization_id)}&url=eq.${encodeURIComponent(targetUrl.toString())}&order=visited_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const existing = existingRes.data?.[0];

  if (existing) {
    const updateRes = await updateRows(
      "browser_history",
      `id=eq.${encodeURIComponent(existing.id)}`,
      { collection_id: body.collection_id, note: body.note?.trim() || null },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);
  } else {
    const insertRes = await insertRow(
      "browser_history",
      {
        organization_id: body.organization_id,
        url: targetUrl.toString(),
        title: body.title?.trim() || null,
        collection_id: body.collection_id,
        note: body.note?.trim() || null,
        visited_by: access.userId ?? null,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);
  }

  return json({ ok: true }, 200, corsHeaders);
}

// ============================================================
// Smart Capture (MODULE_ROADMAP.md, "Qorax Browser" — четверта
// ітерація після MVP AI Sidebar → Site Inspector → Collections).
// ============================================================
// Обсяг узгоджено з Артемом: лише "виділений текст → Office" — єдиний
// продукт екосистеми, що реально готовий приймати довільний текстовий
// контент ззовні (office_documents.content.blocks). Creator (лише
// embedded_editor/live_embed вузли) і Mail (ще заглушка) не мають
// готового API прийому — залишені майбутньою ітерацією, у UI
// позначені "скоро" без активної дії.

interface CaptureToOfficeBody {
  organization_id: string;
  text: string;
  source_url?: string;
  source_title?: string;
}

// POST /api/browser/capture/office
export async function handleCaptureToOffice(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: CaptureToOfficeBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  if (!body.text?.trim()) return json({ error: "Немає виділеного тексту" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const docTitle = body.source_title?.trim() || (body.source_url ? new URL(body.source_url).hostname : "Захоплений текст");

  const blocks: Array<{ id: string; type: "heading" | "paragraph"; level?: 1; text: string }> = [
    { id: crypto.randomUUID(), type: "heading", level: 1, text: docTitle },
  ];
  if (body.source_url) {
    blocks.push({ id: crypto.randomUUID(), type: "paragraph", text: `Джерело: ${body.source_url}` });
  }
  blocks.push({ id: crypto.randomUUID(), type: "paragraph", text: body.text.trim() });

  // handleDocCreate (officeHandler.ts) читає body через request.json()
  // із оригінального Request — тому конструюємо новий Request з
  // потрібним тілом замість дублювання логіки створення документа.
  const forwardedRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({ title: docTitle, content: { blocks } }),
  });

  return handleDocCreate(forwardedRequest, env, corsHeaders, body.organization_id);
}

// ============================================================
// One Click Actions (MODULE_ROADMAP.md, "Qorax Browser" — п'ята
// ітерація після MVP AI Sidebar → Site Inspector → Collections →
// Smart Capture).
// ============================================================
// Roadmap перелічує: Analyze SEO / Save to Project / Create Design /
// Generate Email / Translate / Summarize / Export PDF / Create
// Report / Add Task. Реалізовано лише те, що реально має готовий
// приймач: Analyze SEO і Save to Project — уже існуючі AI Sidebar/
// Collections (просто зведені в одне меню на фронтенді, нового
// backend не потрібно). Translate/Summarize — нові, самодостатні
// (Gemini, той самий credit pool). Add Task — Business вже має
// готовий /api/tasks endpoint (taskHandler.ts), просто виклик з
// контекстом URL. Create Design (Creator) і Generate Email (Mail) —
// той самий блокер, що Smart Capture: немає готового API прийому
// довільного контенту, лишаються "скоро" в UI. Export PDF/Create
// Report — не цей прохід (потребують окремого PDF-рушія на
// сирому HTML стороннього сайту, вищий ризик поламаного вигляду).

/** Спільний fetch+truncate HTML для Translate/Summarize — той самий
 * підхід, що вже в handleBrowserAnalyze (15000 символів досить для
 * hero-контенту, не вимагає вантажити весь документ у промпт). */
async function fetchAndTruncateHtml(targetUrl: URL): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const upstream = await fetch(targetUrl.toString(), {
      signal: controller.signal,
      headers: { "User-Agent": BROWSER_USER_AGENT },
    });
    const html = await upstream.text();
    return html.slice(0, 15_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

interface QuickActionBody {
  organization_id: string;
  url: string;
}

// POST /api/browser/translate — переклад видимого тексту сторінки
// українською (той самий кейс, що людина відкрила іноземний сайт).
export async function handleBrowserTranslate(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: QuickActionBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  const targetUrl = isValidHttpUrl(body.url ?? "");
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const creditsCheck = await checkAiCredits(body.organization_id, env);
  if (!creditsCheck.ok) return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);

  const html = await fetchAndTruncateHtml(targetUrl);
  if (html === null) return json({ error: "Не вдалося завантажити сайт" }, 502, corsHeaders);

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const prompt = `Ось сирий HTML сторінки ${targetUrl.toString()} (ігноруй розмітку, аналізуй лише текстовий зміст):
${html}

Витягни основний текстовий контент цієї сторінки (заголовки, абзаци, ключові речення — не меню/футер/рекламу) і переклади його українською. Форматуй як зв'язний текст, збережи структуру заголовків якщо вона є. Без вступних фраз, одразу переклад.`;

  const result = await callGemini(prompt, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
  return json({ translation: result.text, credits_remaining: creditsRemaining, unlimited: creditsCheck.unlimited }, 200, corsHeaders);
}

// POST /api/browser/summarize — Reading Mode-подібний короткий зміст
// (roadmap описує Reading Mode як окрему майбутню фічу з очищенням
// сторінки; ця дія — той самий Gemini-виклик, простіший обсяг:
// лише текстовий summary без окремого UI-режиму читання).
export async function handleBrowserSummarize(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: QuickActionBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  const targetUrl = isValidHttpUrl(body.url ?? "");
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const creditsCheck = await checkAiCredits(body.organization_id, env);
  if (!creditsCheck.ok) return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);

  const html = await fetchAndTruncateHtml(targetUrl);
  if (html === null) return json({ error: "Не вдалося завантажити сайт" }, 502, corsHeaders);

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const prompt = `Ось сирий HTML сторінки ${targetUrl.toString()} (ігноруй розмітку, аналізуй лише текстовий зміст):
${html}

Зроби короткий структурований конспект українською: 3-6 буллет-пунктів з ключовими фактами/тезами сторінки. Без вступних фраз, одразу список.`;

  const result = await callGemini(prompt, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
  return json({ summary: result.text, credits_remaining: creditsRemaining, unlimited: creditsCheck.unlimited }, 200, corsHeaders);
}

// ============================================================
// AI Compare (MODULE_ROADMAP.md, "Qorax Browser" — шоста ітерація
// після MVP AI Sidebar → Site Inspector → Collections → Smart
// Capture → One Click Actions).
// ============================================================
// Roadmap: "свій сайт vs конкурент → різниці → рекомендації".
// Переюзовує inspectUrl() (спільне ядро з Site Inspector) для ОБОХ
// сайтів паралельно, потім Gemini порівнює вже структуровані дані
// (title/meta/technologies/швидкість тощо), а НЕ сирий HTML обох
// сторінок — дешевше і точніше, ніж просити AI самому парсити два
// документи HTML в одному промпті.

interface CompareBody {
  organization_id: string;
  your_url: string;
  competitor_url: string;
}

// POST /api/browser/compare
export async function handleBrowserCompare(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: CompareBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const yourUrl = isValidHttpUrl(body.your_url ?? "");
  const competitorUrl = isValidHttpUrl(body.competitor_url ?? "");
  if (!yourUrl || !competitorUrl) return json({ error: "Обидва URL мають бути коректними" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const creditsCheck = await checkAiCredits(body.organization_id, env);
  if (!creditsCheck.ok) return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);

  const [yourInspect, competitorInspect] = await Promise.all([inspectUrl(yourUrl), inspectUrl(competitorUrl)]);
  if (!yourInspect || !competitorInspect) {
    return json({ error: "Не вдалося завантажити один із сайтів для порівняння" }, 502, corsHeaders);
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const describeInspect = (label: string, url: URL, r: InspectResult) => `${label} (${url.toString()}):
- Title: ${r.title ?? "—"}
- Meta description: ${r.metaDescription ?? "—"}
- H1: ${r.h1 ?? "—"}
- Технології: ${r.technologies.join(", ") || "—"}
- Аналітика: ${r.analytics.join(", ") || "—"}
- Швидкість відповіді: ${r.responseTimeMs} мс
- Розмір HTML: ${r.pageSizeKb} КБ`;

  const prompt = `Ти — аналітик Qorax Browser. Порівняй два сайти на основі технічних даних нижче і дай короткі практичні рекомендації українською.

${describeInspect("Ваш сайт", yourUrl, yourInspect)}

${describeInspect("Сайт конкурента", competitorUrl, competitorInspect)}

Напиши структуровано (без markdown-заголовків, простим текстом):
1. Ключові відмінності (2-4 пункти)
2. Що конкурент робить краще
3. Одна конкретна рекомендація, що покращити на вашому сайті
Без вступних фраз, одразу суть.`;

  const result = await callGemini(prompt, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
  return json(
    {
      comparison: result.text,
      your_site: yourInspect,
      competitor_site: competitorInspect,
      credits_remaining: creditsRemaining,
      unlimited: creditsCheck.unlimited,
    },
    200,
    corsHeaders
  );
}


// ============================================================
// Reading Mode (MODULE_ROADMAP.md, "Qorax Browser" — сьома
// ітерація після MVP AI Sidebar → Site Inspector → Collections →
// Smart Capture → One Click Actions → AI Compare).
// ============================================================
// Roadmap: "не просто чистий текст, а AI-стислий зміст, витягнуті
// факти, автоматичні нотатки" — відрізняється від уже наявного
// Summarize (One Click Actions) тим, що це ОКРЕМИЙ РЕЖИМ ПЕРЕГЛЯДУ
// (замінює вигляд сторінки на очищений читабельний layout), а не
// швидка модалка з конспектом поверх звичайного перегляду.
//
// Технічний підхід очищення: той самий принцип, що вже в проєкті —
// немає DOM-парсера в Cloudflare Workers, тому видалення
// nav/header/footer/aside/script/style/svg ЦІЛИМИ БЛОКАМИ через
// regex (не просто strip тегів — інакше текст меню/футера
// потрапляв би в "читабельний" контент), потім витяг h1-h3/p/li як
// структурованих блоків.

interface ReadingBlock {
  type: "heading" | "paragraph" | "list_item";
  text: string;
}

interface ReadingModeResult {
  title: string | null;
  blocks: ReadingBlock[];
  keyFacts: string[] | null;
  notes: string | null;
}

const NOISE_TAG_PATTERN = /<(script|style|nav|header|footer|aside|svg|noscript|form|iframe)[^>]*>[\s\S]*?<\/\1>/gi;

function stripHtmlTags(fragment: string): string {
  return fragment.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
}

/** Витягує читабельний контент зі сторінки: видаляє шумові блоки
 * цілком (nav/header/footer/тощо), потім послідовно проходить
 * заголовки/параграфи/пункти списків у порядку появи в документі. */
function extractReadableContent(html: string): ReadingBlock[] {
  const cleaned = html.replace(NOISE_TAG_PATTERN, "");

  const blocks: ReadingBlock[] = [];
  const blockPattern = /<(h[1-3]|p|li)[^>]*>([\s\S]*?)<\/\1>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(cleaned)) !== null) {
    const tag = match[1].toLowerCase();
    const text = stripHtmlTags(match[2]);
    if (!text || text.length < 3) continue; // порожні/декоративні елементи — не текстовий контент
    blocks.push({ type: tag.startsWith("h") ? "heading" : tag === "li" ? "list_item" : "paragraph", text });
  }
  return blocks.slice(0, 80); // достатньо для читабельного викладу однієї сторінки, не безлімітний документ
}

interface ReadingModeBody {
  organization_id: string;
  url: string;
  with_ai?: boolean;
}

// POST /api/browser/reading-mode
export async function handleBrowserReadingMode(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: ReadingModeBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  const targetUrl = isValidHttpUrl(body.url ?? "");
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let html: string;
  try {
    const upstream = await fetch(targetUrl.toString(), { signal: controller.signal, headers: { "User-Agent": BROWSER_USER_AGENT } });
    html = await upstream.text();
  } catch {
    clearTimeout(timeout);
    return json({ error: "Не вдалося завантажити сайт" }, 502, corsHeaders);
  }
  clearTimeout(timeout);

  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const blocks = extractReadableContent(html);

  let keyFacts: string[] | null = null;
  let notes: string | null = null;
  let creditsRemaining: number | undefined;
  let unlimited = false;

  // AI-збагачення (ключові факти + нотатки) — опціональне, окремо
  // від чистого витягу тексту (той працює завжди безкоштовно, без
  // AI-виклику, схоже на "просто чистий текст" з roadmap). with_ai
  // додає саме той шар, що roadmap виділяє як відмінність Reading
  // Mode від звичайного reader-режиму браузерів.
  if (body.with_ai) {
    const creditsCheck = await checkAiCredits(body.organization_id, env);
    if (!creditsCheck.ok) {
      return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);
    }
    const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
    if (apiKey && blocks.length > 0) {
      const plainText = blocks.map(b => b.text).join("\n").slice(0, 12_000);
      const prompt = `Ось текстовий зміст сторінки ${targetUrl.toString()}:
${plainText}

Дай дві речі українською:
1. "ФАКТИ:" — 3-5 ключових конкретних фактів зі сторінки (цифри, назви, дати, якщо є)
2. "НОТАТКА:" — одне коротке речення-нотатка, чому ця сторінка може бути корисна користувачу
Формат рівно такий: рядок "ФАКТИ:" далі буллети, потім рядок "НОТАТКА:" далі текст.`;
      const result = await callGemini(prompt, apiKey);
      if (result.ok) {
        const factsMatch = result.text.match(/ФАКТИ:([\s\S]*?)НОТАТКА:/i);
        const noteMatch = result.text.match(/НОТАТКА:([\s\S]*)/i);
        keyFacts = factsMatch
          ? factsMatch[1].split("\n").map(l => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean)
          : null;
        notes = noteMatch ? noteMatch[1].trim() : null;
        creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);
        unlimited = creditsCheck.unlimited;
      }
    }
  }

  const result: ReadingModeResult = {
    title: titleMatch?.[1]?.trim() || null,
    blocks,
    keyFacts,
    notes,
  };

  return json({ ...result, credits_remaining: creditsRemaining, unlimited }, 200, corsHeaders);
}

// ============================================================
// Visual Search (MODULE_ROADMAP.md, "Qorax Browser" — восьма
// ітерація). Обсяг звужено (узгоджено з Артемом): roadmap описує
// "пошук джерела, схожих зображень, автоматичний SVG, усе одразу в
// Creator" — недоступно без зовнішнього reverse-image-search API
// (якого немає) і без API прийому візуального контенту в Creator
// (той самий блокер, що Smart Capture/Create Design: лише
// embedded_editor/live_embed/smart_component вузли, жодного "довільне
// зображення"). Реалізовано те, що чесно можливо: опис кольорової
// палітри й стилю зображення через Gemini Vision (Cloudflare Workers
// не має Canvas API чи PNG/JPEG-декодера для реального pixel-аналізу
// "з коробки" — тому текстовий опис від AI, не точні HEX-коди з
// пікселів).

const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 МБ — з запасом під ліміт inline_data Gemini API

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 8192; // уникаємо String.fromCharCode(...bytes) на весь масив одразу — стек-ліміт на великих зображеннях
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

interface VisualSearchBody {
  organization_id: string;
  image_url: string;
}

// POST /api/browser/visual-search
export async function handleVisualSearch(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: VisualSearchBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  const imageUrl = isValidHttpUrl(body.image_url ?? "");
  if (!imageUrl) return json({ error: "Некоректний URL зображення" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const creditsCheck = await checkAiCredits(body.organization_id, env);
  if (!creditsCheck.ok) return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let imageBuffer: ArrayBuffer;
  let mimeType: string;
  try {
    const upstream = await fetch(imageUrl.toString(), { signal: controller.signal, headers: { "User-Agent": BROWSER_USER_AGENT } });
    if (!upstream.ok) return json({ error: `Не вдалося завантажити зображення: HTTP ${upstream.status}` }, 502, corsHeaders);
    mimeType = upstream.headers.get("content-type") ?? "";
    if (!mimeType.startsWith("image/")) return json({ error: "URL не веде на зображення" }, 415, corsHeaders);
    imageBuffer = await upstream.arrayBuffer();
  } catch {
    clearTimeout(timeout);
    return json({ error: "Не вдалося завантажити зображення" }, 502, corsHeaders);
  } finally {
    clearTimeout(timeout);
  }

  if (imageBuffer.byteLength > MAX_IMAGE_BYTES) {
    return json({ error: "Зображення завелике для аналізу (макс. 4 МБ)" }, 413, corsHeaders);
  }

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const base64Image = arrayBufferToBase64(imageBuffer);
  const prompt = `Проаналізуй це зображення для дизайнера. Дай відповідь українською у форматі рівно такому:
ПАЛІТРА: перелічи 4-6 основних кольорів зображення як HEX-коди через кому (твоя найкраща оцінка на око, не точний пік-аналіз)
СТИЛЬ: 1-2 речення опису стилю/настрою зображення (мінімалізм, яскравий, корпоративний тощо)
ЕЛЕМЕНТИ: коротко що зображено (2-4 слова)`;

  const result = await callGeminiVision(prompt, base64Image, mimeType, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const paletteMatch = result.text.match(/ПАЛІТРА:\s*(.+)/i);
  const styleMatch = result.text.match(/СТИЛЬ:\s*(.+)/i);
  const elementsMatch = result.text.match(/ЕЛЕМЕНТИ:\s*(.+)/i);

  const palette = paletteMatch
    ? paletteMatch[1].split(",").map(c => c.trim()).filter(c => /^#[0-9a-fA-F]{3,8}$/.test(c))
    : [];

  const creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);

  return json(
    {
      palette,
      style: styleMatch?.[1]?.trim() ?? null,
      elements: elementsMatch?.[1]?.trim() ?? null,
      raw_analysis: result.text,
      credits_remaining: creditsRemaining,
      unlimited: creditsCheck.unlimited,
    },
    200,
    corsHeaders
  );
}

// ============================================================
// Website Timeline (MODULE_ROADMAP.md, "Qorax Browser" — дев'ята
// ітерація, продовжуємо список: Research Mode і Component
// Extractor свідомо пропущено — сам roadmap позначає обидва
// найризикованішими технічно й юридично, копірайт чужого контенту).
// ============================================================
// Roadmap: "як сайт виглядав раніше, AI показує зміни". Єдиний
// реалістичний шлях без власної інфраструктури збереження історії
// чужих сайтів — публічний Wayback Machine CDX API (archive.org),
// безкоштовний, без авторизації (узгоджено з Артемом). НЕ власне
// збереження знімків — Qorax Browser не зберігає копії чужого
// контенту, лише посилається на вже існуючі публічні архівні записи
// Internet Archive.

const WAYBACK_CDX_ENDPOINT = "http://web.archive.org/cdx/search/cdx";
const WAYBACK_FETCH_TIMEOUT_MS = 10_000;

interface TimelineSnapshot {
  timestamp: string; // yyyyMMddhhmmss, формат Wayback Machine
  date: string; // ISO-формат для зручного відображення на фронтенді
  archiveUrl: string; // посилання на сам знімок на web.archive.org
  statusCode: string;
}

interface WebsiteTimelineBody {
  organization_id: string;
  url: string;
}

// POST /api/browser/timeline
export async function handleWebsiteTimeline(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: WebsiteTimelineBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  const targetUrl = isValidHttpUrl(body.url ?? "");
  if (!targetUrl) return json({ error: "Некоректний URL" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  // collapse=digest — дедуплікація знімків з ідентичним вмістом
  // (інакше Wayback Machine повертає сотні записів навіть для
  // сторінки, що не змінювалась роками — кожен crawl-прохід окремий
  // запис). limit=20 — досить для огляду історії, не весь архів.
  const cdxUrl = `${WAYBACK_CDX_ENDPOINT}?url=${encodeURIComponent(targetUrl.toString())}&output=json&collapse=digest&limit=20&fl=timestamp,original,statuscode`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WAYBACK_FETCH_TIMEOUT_MS);
  let rows: string[][];
  try {
    const res = await fetch(cdxUrl, { signal: controller.signal });
    if (!res.ok) return json({ error: "Wayback Machine недоступний" }, 502, corsHeaders);
    rows = await res.json();
  } catch {
    clearTimeout(timeout);
    return json({ error: "Не вдалося отримати історію сайту" }, 502, corsHeaders);
  } finally {
    clearTimeout(timeout);
  }

  // Перший рядок відповіді CDX API — заголовки полів, не дані
  // (["timestamp","original","statuscode"]), решта — самі знімки.
  const dataRows = rows.slice(1);
  const snapshots: TimelineSnapshot[] = dataRows.map(row => {
    const [timestamp, original, statusCode] = row;
    const year = timestamp.slice(0, 4);
    const month = timestamp.slice(4, 6);
    const day = timestamp.slice(6, 8);
    return {
      timestamp,
      date: `${year}-${month}-${day}`,
      archiveUrl: `https://web.archive.org/web/${timestamp}/${original}`,
      statusCode,
    };
  });

  return json({ snapshots, available: snapshots.length > 0 }, 200, corsHeaders);
}

// ============================================================
// Workspace Tabs (MODULE_ROADMAP.md, "Qorax Browser" — десята
// ітерація). Roadmap: "вкладки групуються в проєкти" (приклад:
// проєкт "Nike" — 20 сайтів + 3 PDF + 2 Email + 5 документів в
// одному Workspace). Сайти вже групуються через
// browser_history.collection_id (Collections, 0077). Ця ітерація
// розширює ту саму колекцію ще одним типом вмісту — документами
// Qorax Office (office_documents), єдиним реалістично доступним
// "іншим типом" зараз (Mail лише має CRM-контакти, не листи як
// об'єкти; Creator — окремий продукт поза цим роадмап-пунктом).

interface CollectionItemRow {
  id: string;
  office_document_id: string;
  added_at: string;
}

interface OfficeDocRow {
  id: string;
  title: string;
  updated_at: string;
}

// GET /api/browser/collections/:id/items — документи, додані в колекцію
export async function handleCollectionItemsList(request: Request, env: Env, corsHeaders: Record<string, string>, collectionId: string): Promise<Response> {
  const organizationId = await getCollectionOrgId(collectionId, env);
  if (!organizationId) return json({ error: "Колекцію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const itemsRes = await selectRows<CollectionItemRow>(
    "browser_collection_items",
    `select=id,office_document_id,added_at&collection_id=eq.${encodeURIComponent(collectionId)}&order=added_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!itemsRes.ok) return json({ error: itemsRes.error }, 500, corsHeaders);

  const items = itemsRes.data ?? [];
  if (items.length === 0) return json({ items: [] }, 200, corsHeaders);

  // Один додатковий select за назвами документів — items зазвичай
  // невелика кількість (одна колекція), не вимагає JOIN-запиту.
  const docIds = items.map(i => i.office_document_id).join(",");
  const docsRes = await selectRows<OfficeDocRow>(
    "office_documents",
    `select=id,title,updated_at&id=in.(${docIds})`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const docsById = new Map((docsRes.data ?? []).map(d => [d.id, d]));

  const result = items.map(item => ({
    id: item.id,
    office_document_id: item.office_document_id,
    added_at: item.added_at,
    title: docsById.get(item.office_document_id)?.title ?? "Видалений документ",
  }));

  return json({ items: result }, 200, corsHeaders);
}

interface AddCollectionItemBody {
  office_document_id: string;
}

// POST /api/browser/collections/:id/items
export async function handleCollectionItemAdd(request: Request, env: Env, corsHeaders: Record<string, string>, collectionId: string): Promise<Response> {
  const organizationId = await getCollectionOrgId(collectionId, env);
  if (!organizationId) return json({ error: "Колекцію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  let body: AddCollectionItemBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.office_document_id) return json({ error: "office_document_id обов'язковий" }, 400, corsHeaders);

  // Перевіряємо, що документ належить ТІЙ САМІЙ організації —
  // інакше можна було б прив'язати чужий документ до своєї колекції.
  const docRes = await selectRows<{ organization_id: string }>(
    "office_documents",
    `select=organization_id&id=eq.${encodeURIComponent(body.office_document_id)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (docRes.data?.[0]?.organization_id !== organizationId) {
    return json({ error: "Документ не знайдено" }, 404, corsHeaders);
  }

  const insertRes = await insertRow(
    "browser_collection_items",
    { collection_id: collectionId, item_type: "office_document", office_document_id: body.office_document_id, added_by: access.userId ?? null },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// DELETE /api/browser/collection-items/:itemId
export async function handleCollectionItemDelete(request: Request, env: Env, corsHeaders: Record<string, string>, itemId: string): Promise<Response> {
  const itemRes = await selectRows<{ collection_id: string }>(
    "browser_collection_items",
    `select=collection_id&id=eq.${encodeURIComponent(itemId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const collectionId = itemRes.data?.[0]?.collection_id;
  if (!collectionId) return json({ error: "Елемент не знайдено" }, 404, corsHeaders);

  const organizationId = await getCollectionOrgId(collectionId, env);
  if (!organizationId) return json({ error: "Колекцію не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/browser_collection_items?id=eq.${encodeURIComponent(itemId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!res.ok) return json({ error: `Delete failed: ${res.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ============================================================
// Deep Search (MODULE_ROADMAP.md, "Qorax Browser" — одинадцята
// ітерація, продовжуємо список після Website Timeline і Workspace
// Tabs: "пошук по інтернету з AI, що сам підбирає приклади за
// складним природномовним запитом (не проста видача посилань)").
// ============================================================
// Технічне рішення: жодного окремого пошукового API-ключа в проєкті
// ще немає (перевірено — SUPABASE/GEMINI/LS/TELEGRAM/RESEND, більше
// нічого в env.XXX звертань worker/src/). Заводити новий зовнішній
// провайдер (SerpAPI/Brave/Bing) заради одного ендпоінту — зайва
// інфраструктура. Gemini API нативно підтримує вбудований інструмент
// `google_search` (grounding): модель сама формулює запити, реально
// шукає в Google, і повертає відповідь з переліком джерел
// (groundingChunks) — саме "AI сам підбирає приклади за
// природномовним запитом", а не голий список посилань. Тому власна
// функція виклику Gemini з увімкненим tools, а не переюзання
// callGemini() (той не приймає tools — свідомо не чіпаємо
// contentGeneration.ts заради одного викликача, той самий принцип,
// що вже застосований для callGeminiVision).

const GEMINI_SEARCH_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const DEEP_SEARCH_TIMEOUT_MS = 25_000;

interface DeepSearchBody {
  organization_id: string;
  query: string;
}

interface DeepSearchSource {
  title: string;
  uri: string;
}

interface GeminiGroundingResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    groundingMetadata?: {
      groundingChunks?: Array<{ web?: { uri?: string; title?: string } }>;
    };
  }>;
}

async function callGeminiWithSearch(
  query: string,
  apiKey: string
): Promise<
  | { ok: true; text: string; sources: DeepSearchSource[] }
  | { ok: false; error: string; status: number }
> {
  const body = {
    contents: [
      {
        parts: [
          {
            text: `Запит користувача: "${query}"

Знайди актуальну інформацію в інтернеті за цим запитом і дай структуровану відповідь українською мовою. Не просто перелічуй посилання — синтезуй знайдене у зв'язну відповідь по суті запиту, з конкретними прикладами/фактами/назвами, якщо запит цього просить (наприклад "приклади лендінгів для..." → перелічи конкретні знайдені приклади з коротким описом кожного, не загальні поради).`,
          },
        ],
      },
    ],
    tools: [{ google_search: {} }],
    generationConfig: { temperature: 0.4, maxOutputTokens: 2000 },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEEP_SEARCH_TIMEOUT_MS);
  try {
    const doFetch = () =>
      fetch(`${GEMINI_SEARCH_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify(body),
      });

    let resp = await doFetch();
    if (resp.status === 429 || resp.status === 503) {
      const delay = resp.status === 503 ? 6000 : 4000;
      console.warn(`[deep-search] Gemini ${resp.status} — retrying in ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
      resp = await doFetch();
    }

    if (!resp.ok) {
      const errText = await resp.text();
      console.error("[deep-search] Gemini error:", resp.status, errText.slice(0, 300));
      return { ok: false, error: resp.status === 429 ? "AI перевантажений — спробуйте через хвилину" : "AI тимчасово недоступний", status: 503 };
    }

    const data = (await resp.json()) as GeminiGroundingResponse;
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.map(p => p.text ?? "").join("").trim() ?? "";
    if (!text) return { ok: false, error: "AI не повернув результат — спробуйте переформулювати запит", status: 502 };

    const chunks = candidate?.groundingMetadata?.groundingChunks ?? [];
    const seen = new Set<string>();
    const sources: DeepSearchSource[] = [];
    for (const chunk of chunks) {
      const uri = chunk.web?.uri;
      if (!uri || seen.has(uri)) continue;
      seen.add(uri);
      sources.push({ title: chunk.web?.title ?? uri, uri });
    }

    return { ok: true, text, sources };
  } catch (err) {
    console.error("[deep-search] fetch error:", err);
    return { ok: false, error: "AI тимчасово недоступний", status: 503 };
  } finally {
    clearTimeout(timeout);
  }
}

// POST /api/browser/deep-search — природномовний пошук по інтернету
// з AI-синтезом відповіді (не проста видача посилань, roadmap).
// Rate-limit на IP (а не лише org) — той самий підхід, що інші дорогі
// AI-ендпоінти захищені checkRateLimit деінде в кодовій базі, тут
// додатково важливо через реальний зовнішній пошук за кожен виклик.
export async function handleDeepSearch(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: DeepSearchBody;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Некоректний JSON" }, 400, corsHeaders);
  }
  if (!body.organization_id) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);
  const query = (body.query ?? "").trim();
  if (!query) return json({ error: "Запит не може бути порожнім" }, 400, corsHeaders);
  if (query.length > 500) return json({ error: "Запит завеликий (макс. 500 символів)" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, body.organization_id, "viewer", env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Forbidden" }, access.status ?? 403, corsHeaders);

  const ip = getClientIp(request);
  const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `deep-search:${ip}`, 20, 3600);
  if (!rateLimit.allowed) return json({ error: "Забагато запитів. Спробуйте пізніше." }, 429, corsHeaders);

  const creditsCheck = await checkAiCredits(body.organization_id, env);
  if (!creditsCheck.ok) return json({ error: "Кредити вичерпано. Ліміт оновлюється щомісяця відповідно до тарифу." }, 402, corsHeaders);

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  const result = await callGeminiWithSearch(query, apiKey);
  if (!result.ok) return json({ error: result.error }, result.status, corsHeaders);

  const creditsRemaining = await deductAiCredits(body.organization_id, creditsCheck.creditsRemaining, creditsCheck.unlimited, env);

  return json(
    {
      answer: result.text,
      sources: result.sources,
      credits_remaining: creditsRemaining,
      unlimited: creditsCheck.unlimited,
    },
    200,
    corsHeaders
  );
}
