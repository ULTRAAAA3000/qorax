// ============================================================
// sitesBuilderHandler.ts — Sites-конструктор (MODULE_ROADMAP.md
// розділ 4; PLATFORM.md; DATA_MODEL.md розділ 2.1; EXECUTION_PLAN.md
// Фаза 3.1). Артем веде паралельно Qorax AI хаб (хвиля 3) — цей файл
// стосується виключно Sites-конструктора, жодних перетинів з
// agents/ai_tasks/ai_memory.
//
// КРИТИЧНЕ ПРАВИЛО, яке цей файл СВІДОМО дотримується (PLATFORM.md,
// DATA_MODEL.md розділ 2.1): "sites" (моніторинг чужого сайту) і
// "projects" (те, що хостить сам Qorax) — НІКОЛИ не змішуються. Усі
// функції тут працюють з projects/project_pages, жодна не приймає
// site_id.
//
// requireOrgAccess() підходить для /api/projects (organization_id
// відомий напряму — той самий випадок, що CRM/Academy). Для
// page-рівня операцій (project_pages не має власного organization_id)
// — вже готовий requireOrgAccessForProject() з orgAuth.ts (доданий
// саме для Sites-конструктора/Commerce, DATA_MODEL.md розділ 2.1),
// не власна копія, як у попередній чернетці цього файлу.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, updateRows } from "./supabase";
import { json } from "./httpUtils";
import { requireOrgAccess, requireOrgAccessForProject } from "./orgAuth";
import { checkRateLimit, getClientIp } from "./rateLimit";

interface ProjectRow {
  id: string;
  organization_id: string;
  name: string;
  domain: string | null;
  status: string;
  settings: Record<string, unknown>;
  created_at: string;
}

interface ProjectPageRow {
  id: string;
  project_id: string;
  slug: string;
  content: { blocks?: unknown[] };
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

// ── GET /api/projects?organization_id=... ── список проектів організації

export async function handleProjectsList(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  const organizationId = url.searchParams.get("organization_id");
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<ProjectRow>(
    "projects",
    `select=id,organization_id,name,domain,status,settings,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ projects: res.data ?? [] }, 200, corsHeaders);
}

// ── GET /api/project-templates ── каталог шаблонів (публічний каталог, лише JWT-перевірка, без org-контексту — той самий підхід, що Academy courses)

export async function handleProjectTemplatesList(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401, corsHeaders);

  const res = await selectRows<{ id: string; name: string; description: string | null; preview_image_url: string | null; sort_order: number }>(
    "project_templates",
    `select=id,name,description,preview_image_url,sort_order&order=sort_order.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ templates: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/projects ── body: { organization_id, name, template_id? } —
// створює проект + сторінки з шаблону (якщо template_id вказано)

export async function handleProjectCreate(request: Request, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
  let body: { organization_id?: string; name?: string; template_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const organizationId = body.organization_id;
  if (!organizationId) return json({ error: "organization_id обов'язковий" }, 400, corsHeaders);

  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const name = body.name?.trim();
  if (!name) return json({ error: "Назва проекту обов'язкова" }, 400, corsHeaders);
  if (name.length > 200) return json({ error: "Назва занадто довга (макс. 200 символів)" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "projects",
    { organization_id: organizationId, name, status: "draft" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 400, corsHeaders);

  const projectRes = await selectRows<ProjectRow>(
    "projects",
    `select=id,organization_id,name,domain,status,settings,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&name=eq.${encodeURIComponent(name)}&order=created_at.desc&limit=1`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const project = projectRes.data?.[0];
  if (!project) return json({ error: "Не вдалось створити проект" }, 500, corsHeaders);

  // Якщо обрано шаблон — копіюємо default_pages у project_pages
  if (body.template_id) {
    const templateRes = await selectRows<{ default_pages: Array<{ slug: string; seo_title?: string; seo_description?: string; content: unknown }> }>(
      "project_templates",
      `select=default_pages&id=eq.${encodeURIComponent(body.template_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const defaultPages = templateRes.data?.[0]?.default_pages ?? [];
    for (const page of defaultPages) {
      await insertRow(
        "project_pages",
        {
          project_id: project.id,
          slug: page.slug,
          content: page.content,
          seo_title: page.seo_title ?? null,
          seo_description: page.seo_description ?? null,
        },
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
    }
  } else {
    // Без шаблону — порожня сторінка index, щоб редактор завжди мав з чого почати
    await insertRow(
      "project_pages",
      { project_id: project.id, slug: "index", content: { blocks: [] } },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  }

  return json({ ok: true, project }, 201, corsHeaders);
}

// ── GET /api/projects/:id ── деталі проекту + сторінки

export async function handleProjectDetail(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const projectRes = await selectRows<ProjectRow>(
    "projects",
    `select=id,organization_id,name,domain,status,settings,created_at&id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const project = projectRes.data?.[0];
  if (!project) return json({ error: "Проект не знайдено" }, 404, corsHeaders);

  const pagesRes = await selectRows<ProjectPageRow>(
    "project_pages",
    `select=id,project_id,slug,content,seo_title,seo_description,updated_at&project_id=eq.${encodeURIComponent(projectId)}&order=slug.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  return json({ project, pages: pagesRes.data ?? [] }, 200, corsHeaders);
}

// ── PATCH /api/projects/:id/pages/:pageId ── body: { content?, seo_title?, seo_description? }

export async function handleProjectPageUpdate(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  projectId: string,
  pageId: string
): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { content?: { blocks: unknown[] }; seo_title?: string; seo_description?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = {};
  if (body.content) {
    if (!Array.isArray(body.content.blocks)) return json({ error: "content.blocks має бути масивом" }, 400, corsHeaders);
    patch.content = body.content;
  }
  if (typeof body.seo_title === "string") patch.seo_title = body.seo_title.slice(0, 200);
  if (typeof body.seo_description === "string") patch.seo_description = body.seo_description.slice(0, 500);

  if (Object.keys(patch).length === 0) return json({ error: "Немає що оновлювати" }, 400, corsHeaders);

  const updateRes = await updateRows(
    "project_pages",
    `id=eq.${encodeURIComponent(pageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    patch,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /api/projects/:id/pages ── body: { slug } — додати нову порожню сторінку

export async function handleProjectPageCreate(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { slug?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const slug = body.slug?.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  if (!slug) return json({ error: "slug обов'язковий" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "project_pages",
    { project_id: projectId, slug, content: { blocks: [] } },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error?.includes("duplicate") ? "Сторінка з таким slug вже існує" : insertRes.error }, 400, corsHeaders);

  return json({ ok: true }, 201, corsHeaders);
}

// ── DELETE /api/projects/:id/pages/:pageId ── admin+ (той самий рівень, що project_pages_delete_own_org policy)

export async function handleProjectPageDelete(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  projectId: string,
  pageId: string
): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "admin", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const pagesRes = await selectRows<{ id: string }>(
    "project_pages",
    `select=id&project_id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if ((pagesRes.data?.length ?? 0) <= 1) {
    return json({ error: "Не можна видалити останню сторінку проекту" }, 400, corsHeaders);
  }

  const deleteResp = await fetch(
    `${env.SUPABASE_URL}/rest/v1/project_pages?id=eq.${encodeURIComponent(pageId)}&project_id=eq.${encodeURIComponent(projectId)}`,
    {
      method: "DELETE",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        Prefer: "return=minimal",
      },
    }
  );
  if (!deleteResp.ok) return json({ error: `Delete failed: ${deleteResp.status}` }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── POST /api/projects/:id/publish ── публікація: status='draft' → 'published'

export async function handleProjectPublish(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const pagesRes = await selectRows<{ id: string }>(
    "project_pages",
    `select=id&project_id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!pagesRes.data?.length) return json({ error: "Додайте хоча б одну сторінку перед публікацією" }, 400, corsHeaders);

  const updateRes = await updateRows(
    "projects",
    `id=eq.${encodeURIComponent(projectId)}`,
    { status: "published" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true, published_url: `/sites-builder/preview/${projectId}` }, 200, corsHeaders);
}

// ── POST /api/projects/:id/unpublish ── зняти з публікації: 'published' → 'draft'

export async function handleProjectUnpublish(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const access = await requireOrgAccessForProject(request, projectId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const updateRes = await updateRows(
    "projects",
    `id=eq.${encodeURIComponent(projectId)}`,
    { status: "draft" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!updateRes.ok) return json({ error: updateRes.error }, 500, corsHeaders);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/sites-content/:projectId ── ПУБЛІЧНИЙ, без авторизації.
// Використовується SSR-сторінкою app/sites-builder/preview/[projectId]
// для рендерингу опублікованого проекту (MODULE_ROADMAP.md розділ 4
// Крок 2, варіант А — SSR через існуючий Next.js Worker, той самий
// підхід, що app/status/[slug] уже використовує для публічних даних,
// включно з тим самим обмеженням Cloudflare error 1042 — Worker не
// може fetch() інший Worker того ж акаунта за публічним URL, тому
// сторінка звертається через Service Binding, не напряму сюди по
// http; цей ендпоінт існує для binding-виклику й для локальної
// розробки без wrangler dev).
// Повертає 404 якщо проект не 'published' — не показуємо чернетки
// публічно за прямим посиланням.

export async function handleSitesContentPublic(request: Request, env: Env, corsHeaders: Record<string, string>, projectId: string): Promise<Response> {
  const clientIp = getClientIp(request);
  const rateLimit = await checkRateLimit(env.RATE_LIMIT_KV, `sites-content:${clientIp}`, 60, 60);
  if (!rateLimit.allowed) return json({ error: "Rate limited" }, 429, corsHeaders);

  const projectRes = await selectRows<{ id: string; name: string; status: string; domain: string | null }>(
    "projects",
    `select=id,name,status,domain&id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const project = projectRes.data?.[0];
  if (!project || project.status !== "published") return json({ error: "Not found" }, 404, corsHeaders);

  const pagesRes = await selectRows<ProjectPageRow>(
    "project_pages",
    `select=id,project_id,slug,content,seo_title,seo_description,updated_at&project_id=eq.${encodeURIComponent(projectId)}&order=slug.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  // Translator-модуль (0060_translator_module.sql): якщо у проекта
  // підключені мови, повертаємо їх список — SSR-сторінка preview
  // будує з нього <link rel="alternate" hreflang> (roadmap Translator
  // Крок 2: "hreflang генерується на льоту в SSR-рендерингу Sites").
  // Проект без жодної підключеної мови (більшість) — languages: [],
  // Translator для нього просто не використовується, зайвого запиту
  // page_translations без потреби не робимо.
  const languagesRes = await selectRows<{ locale: string; is_default: boolean; url_prefix: string | null }>(
    "project_languages",
    `select=locale,is_default,url_prefix&project_id=eq.${encodeURIComponent(projectId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const languages = languagesRes.data ?? [];

  // Commerce (0061_commerce_module.sql): якщо в проєкті є опубліковані
  // товари, повертаємо їх у тій самій відповіді — публічна сторінка
  // (SitePreviewRenderer, блок 'products') рендерить сітку товарів без
  // окремого мережевого запиту з клієнта. Тільки status='published' і
  // тільки поля, потрібні для вітрини — не віддаємо sku/seo_title/
  // seo_description (внутрішні деталі керування каталогом, не для
  // публічного перегляду).
  const productsRes = await selectRows<{ id: string; title: string; description: string | null; price_cents: number; currency: string; image_urls: string[] | null; stock_quantity: number | null }>(
    "products",
    `select=id,title,description,price_cents,currency,image_urls,stock_quantity&project_id=eq.${encodeURIComponent(projectId)}&status=eq.published&order=created_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const products = productsRes.data ?? [];

  let pages = pagesRes.data ?? [];

  // ?locale=xx — підміняємо title/description/content на переклад,
  // якщо він існує й опублікований (reviewed чи published; draft — ще
  // не перевірений людиною, не показуємо відвідувачам публічно)
  const url = new URL(request.url);
  const locale = url.searchParams.get("locale");
  if (locale && languages.some(l => l.locale === locale)) {
    const pageIds = pages.map(p => p.id);
    if (pageIds.length > 0) {
      const translationsRes = await selectRows<{ project_page_id: string; title: string | null; description: string | null; content: { blocks?: unknown[] } | null; status: string }>(
        "page_translations",
        `select=project_page_id,title,description,content,status&project_page_id=in.(${pageIds.join(",")})&locale=eq.${encodeURIComponent(locale)}&status=in.(reviewed,published)`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const translationByPageId = new Map((translationsRes.data ?? []).map(t => [t.project_page_id, t]));

      pages = pages.map(p => {
        const t = translationByPageId.get(p.id);
        if (!t) return p;
        return {
          ...p,
          seo_title: t.title || p.seo_title,
          seo_description: t.description || p.seo_description,
          content: t.content?.blocks?.length ? t.content : p.content,
        };
      });
    }
  }

  return json({ project: { id: project.id, name: project.name }, pages, languages, products }, 200, corsHeaders);
}
