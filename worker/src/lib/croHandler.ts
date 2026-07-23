// ============================================================
// croHandler.ts — CRO-модуль (MODULE_ROADMAP.md розділ 9;
// EXECUTION_PLAN.md Фаза 2.6). Останній модуль хвилі 2, найризикованіший
// технічно — cro_events росте пропорційно ЗОВНІШНЬОМУ трафіку сайтів
// клієнтів, не діям юзерів Qorax.
//
// КРИТИЧНА ВІДМІННІСТЬ ВІД УСІХ ІНШИХ HANDLER-ІВ ПРОЄКТУ: POST
// /api/cro/track приймає запити з ДОВІЛЬНОГО домену — клієнтський
// сніпет встановлюється на САЙТІ КЛІЄНТА (client-shop.com), не на
// qorax.app. Стандартний corsHeaders() з cors.ts (allowlist
// qorax.app/workers.dev/pages.dev/localhost) ТУТ НЕ ПІДХОДИТЬ — він
// відхилить legit-запит із сайту клієнта. Track-ендпоінт свідомо
// відкритий (Access-Control-Allow-Origin: *), як у Google Analytics/
// будь-якого веб-трекера — це write-only "маяк", не читає нічого
// приватного, захищений snippet_key (не organization secret) і
// rate-limit по IP.
// ============================================================

import type { Env } from "../types";
import { hasProTierAccess } from "./planTiers";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { checkRateLimit, getClientIp } from "./rateLimit";
import { getUserIdFromToken, getOrgIdForSite } from "./gscHandler";

// ── CORS для публічного track-ендпоінта: свідомо відкритий (не qorax-домени) ──

function trackCorsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

const VALID_EVENT_TYPES = ["pageview", "cta_click", "form_start", "form_submit", "scroll_depth"];
const MAX_BATCH_SIZE = 20; // обмеження одного batch-запиту зі сніпета — захист від зловживання ще до rate-limit

interface TrackEvent {
  page_url?: string;
  event_type?: string;
  element_selector?: string;
  session_id?: string;
}

// ── POST /api/cro/track?key=<snippet_key> ── публічний, БЕЗ авторизації.
// body: { events: TrackEvent[] } — batch, сніпет шле events партіями,
// не по одному, щоб не бомбардувати ендпоінт на кожен клік.

export async function handleCroTrack(request: Request, env: Env): Promise<Response> {
  const cors = trackCorsHeaders();

  const url = new URL(request.url);
  const snippetKey = url.searchParams.get("key");
  if (!snippetKey) return json({ error: "Missing key" }, 400, cors);

  // Rate limit ПЕРЕД будь-якою роботою з БД — найдешевша перевірка спочатку.
  // Ліміт агресивніший за /api/audit (60/хв на IP, не 3/10хв) — це
  // легітимний high-frequency трекінг, а не lead-magnet, але все одно
  // публічний ендпоінт без авторизації, потребує захисту від флуду.
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `cro-track:${clientIp}`, 60, 60);
  if (!rateLimit.allowed) return json({ error: "Rate limited" }, 429, cors);

  let body: { events?: TrackEvent[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }

  const events = body.events;
  if (!events?.length) return json({ error: "events обов'язкові" }, 400, cors);
  if (events.length > MAX_BATCH_SIZE) return json({ error: `Максимум ${MAX_BATCH_SIZE} подій за раз` }, 400, cors);

  const snippetRes = await selectRows<{ site_id: string; is_active: boolean }>(
    "cro_snippets",
    `select=site_id,is_active&snippet_key=eq.${encodeURIComponent(snippetKey)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const snippet = snippetRes.data?.[0];
  if (!snippet || !snippet.is_active) return json({ error: "Invalid key" }, 404, cors);

  const rows = events
    .filter(e => e.page_url && e.event_type && VALID_EVENT_TYPES.includes(e.event_type) && e.session_id)
    .slice(0, MAX_BATCH_SIZE)
    .map(e => ({
      site_id: snippet.site_id,
      page_url: (e.page_url as string).slice(0, 2048),
      event_type: e.event_type,
      element_selector: e.element_selector?.slice(0, 500) ?? null,
      session_id: (e.session_id as string).slice(0, 200),
    }));

  if (rows.length === 0) return json({ error: "Жодної валідної події" }, 400, cors);

  // Пряма вставка без insertRow() (return=minimal) — batch insert масиву,
  // insertRow() у supabase.ts очікує один об'єкт, не масив
  const insertResp = await fetch(`${env.SUPABASE_URL}/rest/v1/cro_events`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(rows),
  });
  if (!insertResp.ok) {
    console.error("[cro-track] insert failed:", insertResp.status, (await insertResp.text()).slice(0, 300));
    return json({ error: "Insert failed" }, 500, cors);
  }

  return json({ ok: true, accepted: rows.length }, 200, cors);
}

export function handleCroTrackOptions(): Response {
  return new Response(null, { status: 204, headers: trackCorsHeaders() });
}

// ── Authenticated routes (site-scoped, той самий патерн, що rankHandler.ts) ──

async function requireSiteAccess(request: Request, siteId: string, env: Env): Promise<{ ok: true; orgId: string } | { ok: false; status: number }> {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "");
  if (!token) return { ok: false, status: 401 };
  const userId = await getUserIdFromToken(token, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!userId) return { ok: false, status: 401 };
  const orgId = await getOrgIdForSite(siteId, userId, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  if (!orgId) return { ok: false, status: 404 };
  return { ok: true, orgId };
}

// PRICING.md розділ 2: тарифи реально в БД — Starter/Growth/Agency + план
// 'admin' (0016_admin_plan.sql, службовий план для platform_role=admin,
// призначається через upgrade_to_admin(email) вручну в SQL Editor).
// CRO гейтиться на Growth+ за тим самим списком planCode, що вже
// використовується в усіх інших фіче-флагах проєкту (index.ts,
// chatHandler.ts, teamHandler.ts, gscHandler.ts, seoChecker.ts,
// competitorChecker.ts, fixRequestHandler.ts) — 'admin' і 'trial'
// завжди мають доступ нарівні з Growth/Agency.
async function canUseCro(orgId: string, env: Env): Promise<boolean> {
  const res = await selectRows<{ status: string; plans: { code: string } }>(
    "subscriptions",
    `select=status,plans(code)&organization_id=eq.${encodeURIComponent(orgId)}&status=in.(active,trialing)&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const planCode = (res.data?.[0]?.plans as { code: string } | null)?.code;
  return hasProTierAccess(planCode ?? "");
}

// ── GET /api/sites/:id/cro/snippet ── отримати/створити snippet_key

export async function handleCroSnippetGet(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireSiteAccess(request, siteId, env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Not found" }, access.status, corsHeaders);

  if (!(await canUseCro(access.orgId, env))) {
    return json({ error: "CRO доступний на тарифі Growth і вище" }, 402, corsHeaders);
  }

  const existingRes = await selectRows<{ id: string; snippet_key: string; is_active: boolean }>(
    "cro_snippets",
    `select=id,snippet_key,is_active&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  let snippet = existingRes.data?.[0];

  if (!snippet) {
    const insertRes = await insertRow(
      "cro_snippets",
      { site_id: siteId },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

    const refetchRes = await selectRows<{ id: string; snippet_key: string; is_active: boolean }>(
      "cro_snippets",
      `select=id,snippet_key,is_active&site_id=eq.${encodeURIComponent(siteId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    snippet = refetchRes.data?.[0];
  }

  if (!snippet) return json({ error: "Не вдалось створити сніпет" }, 500, corsHeaders);

  return json({
    snippet_key: snippet.snippet_key,
    is_active: snippet.is_active,
    install_snippet: buildInstallSnippet(env, snippet.snippet_key),
  }, 200, corsHeaders);
}

function buildInstallSnippet(env: Env, snippetKey: string): string {
  const apiBase = env.API_BASE_URL ?? "https://qorax-api.mrcru96.workers.dev";
  return `<script>
(function(){
  var QORAX_CRO_KEY="${snippetKey}";
  var QORAX_CRO_ENDPOINT="${apiBase}/api/cro/track?key="+QORAX_CRO_KEY;
  var sid=sessionStorage.getItem("_qorax_sid")||(Math.random().toString(36).slice(2)+Date.now().toString(36));
  sessionStorage.setItem("_qorax_sid",sid);
  var queue=[];
  function flush(){
    if(!queue.length)return;
    var batch=queue.splice(0,20);
    fetch(QORAX_CRO_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({events:batch}),keepalive:true}).catch(function(){});
  }
  function track(type,selector){
    queue.push({page_url:location.href,event_type:type,element_selector:selector||null,session_id:sid});
    if(queue.length>=10)flush();
  }
  track("pageview");
  document.addEventListener("click",function(e){
    var el=e.target.closest("[data-cro-cta]");
    if(el)track("cta_click",el.getAttribute("data-cro-cta")||el.tagName);
  });
  document.addEventListener("focusin",function(e){
    if(e.target.closest("form"))track("form_start",e.target.closest("form").getAttribute("data-cro-form")||"form");
  });
  document.addEventListener("submit",function(e){
    track("form_submit",e.target.getAttribute("data-cro-form")||"form");
  });
  window.addEventListener("beforeunload",flush);
  setInterval(flush,5000);
})();
</script>`;
}

// ── PATCH /api/sites/:id/cro/snippet ── body: { is_active } — увімкнути/вимкнути

export async function handleCroSnippetToggle(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireSiteAccess(request, siteId, env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Not found" }, access.status, corsHeaders);

  let body: { is_active?: boolean };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }
  if (typeof body.is_active !== "boolean") return json({ error: "is_active обов'язковий (boolean)" }, 400, corsHeaders);

  const updateRes = await updateRows(
    "cro_snippets",
    `site_id=eq.${encodeURIComponent(siteId)}`,
    { is_active: body.is_active },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/sites/:id/cro/stats ── денна агрегація за останні 30 днів

interface DailyStatRow {
  page_url: string;
  date: string;
  visitors: number;
  cta_clicks: number;
  form_starts: number;
  form_submits: number;
  conversion_rate: number | null;
}

export async function handleCroStats(request: Request, env: Env, corsHeaders: Record<string, string>, siteId: string): Promise<Response> {
  const access = await requireSiteAccess(request, siteId, env);
  if (!access.ok) return json({ error: access.status === 401 ? "Unauthorized" : "Not found" }, access.status, corsHeaders);

  if (!(await canUseCro(access.orgId, env))) {
    return json({ error: "CRO доступний на тарифі Growth і вище" }, 402, corsHeaders);
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const statsRes = await selectRows<DailyStatRow>(
    "cro_daily_stats",
    `select=page_url,date,visitors,cta_clicks,form_starts,form_submits,conversion_rate&site_id=eq.${encodeURIComponent(siteId)}&date=gte.${thirtyDaysAgo}&order=date.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!statsRes.ok) return json({ error: statsRes.error }, 500, corsHeaders);

  const snippetRes = await selectRows<{ is_active: boolean }>(
    "cro_snippets",
    `select=is_active&site_id=eq.${encodeURIComponent(siteId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return json({
    stats: statsRes.data ?? [],
    snippet_installed: !!snippetRes.data?.[0],
    snippet_active: snippetRes.data?.[0]?.is_active ?? false,
  }, 200, corsHeaders);
}

// ── Cron: run-cro-aggregate ── MODULE_ROADMAP.md розділ 9 Крок 2 +
// TTL-архівація (не в чернетці roadmap — свідоме рішення цього проходу,
// EXECUTION_PLAN.md "з самого початку, не постфактум"). Новий cron-тригер,
// Артему потрібно додати вручну в Cloudflare Dashboard.

export async function runCroAggregate(env: Env): Promise<{ aggregated_days: number; deleted_events: number }> {
  // Агрегуємо всі DISTINCT (site_id, page_url, date) з подій старших за
  // 1 годину (даємо запас, щоб не агрегувати ще "теплі" сесії) і без
  // існуючого запису в cro_daily_stats за цю дату — не перезаписуємо
  // вже агреговані дні повторно щохвилини.
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const eventsRes = await selectRows<{ site_id: string; page_url: string; event_type: string; session_id: string; occurred_at: string }>(
    "cro_events",
    `select=site_id,page_url,event_type,session_id,occurred_at&occurred_at=lt.${cutoff}&order=occurred_at.asc&limit=5000`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const events = eventsRes.data ?? [];
  if (events.length === 0) return { aggregated_days: 0, deleted_events: 0 };

  // Групуємо в пам'яті worker-а по (site_id, page_url, date)
  interface Bucket { visitors: Set<string>; cta_clicks: number; form_starts: number; form_submits: number }
  const buckets = new Map<string, Bucket>();

  for (const e of events) {
    const date = e.occurred_at.slice(0, 10);
    const key = `${e.site_id}|${e.page_url}|${date}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { visitors: new Set(), cta_clicks: 0, form_starts: 0, form_submits: 0 };
      buckets.set(key, bucket);
    }
    if (e.event_type === "pageview") bucket.visitors.add(e.session_id);
    if (e.event_type === "cta_click") bucket.cta_clicks++;
    if (e.event_type === "form_start") bucket.form_starts++;
    if (e.event_type === "form_submit") bucket.form_submits++;
  }

  let aggregatedDays = 0;
  for (const [key, bucket] of buckets) {
    const [siteId, pageUrl, date] = key.split("|");
    const visitors = bucket.visitors.size;

    const existingRes = await selectRows<{ id: string; visitors: number; cta_clicks: number; form_starts: number; form_submits: number }>(
      "cro_daily_stats",
      `select=id,visitors,cta_clicks,form_starts,form_submits&site_id=eq.${siteId}&page_url=eq.${encodeURIComponent(pageUrl)}&date=eq.${date}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const existing = existingRes.data?.[0];

    const totalVisitors = (existing?.visitors ?? 0) + visitors;
    const totalCta = (existing?.cta_clicks ?? 0) + bucket.cta_clicks;
    const totalFormStarts = (existing?.form_starts ?? 0) + bucket.form_starts;
    const totalFormSubmits = (existing?.form_submits ?? 0) + bucket.form_submits;
    const totalConversion = totalVisitors > 0 ? Math.round((totalFormSubmits / totalVisitors) * 10000) / 100 : null;

    if (existing) {
      await updateRows("cro_daily_stats", `id=eq.${existing.id}`, {
        visitors: totalVisitors, cta_clicks: totalCta, form_starts: totalFormStarts, form_submits: totalFormSubmits, conversion_rate: totalConversion,
      }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    } else {
      await insertRow("cro_daily_stats", {
        site_id: siteId, page_url: pageUrl, date, visitors: totalVisitors, cta_clicks: totalCta, form_starts: totalFormStarts, form_submits: totalFormSubmits, conversion_rate: totalConversion,
      }, env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    }
    aggregatedDays++;
  }

  // Видаляємо ЩОЙНО заагреговані сирі події — усі events з occurred_at
  // <= час останньої обробленої події в цьому batch-і (не пізніші, що
  // потрапили в БД вже ПІСЛЯ початку агрегації)
  const maxProcessedAt = events[events.length - 1].occurred_at;
  const deleteResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/cro_events?occurred_at=lte.${encodeURIComponent(maxProcessedAt)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  const deletedCount = deleteResp.ok ? events.length : 0;
  if (!deleteResp.ok) {
    console.error("[cro-aggregate] delete failed:", deleteResp.status, (await deleteResp.text()).slice(0, 300));
  }

  return { aggregated_days: aggregatedDays, deleted_events: deletedCount };
}
