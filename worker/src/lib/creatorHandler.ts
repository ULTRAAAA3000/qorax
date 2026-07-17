// ============================================================
// QORAX — Qorax Creator: canvas_boards / canvas_nodes (MVP Website Mode)
// ============================================================
// MODULE_ROADMAP.md, "Qorax Creator — візуальна платформа
// створення". MVP цього файлу — ТІЛЬКИ Website Mode: дошка з одним
// node_type='embedded_editor' вузлом, що показує вже наявний
// Sites-редактор (ProjectEditorUI.tsx) у рамці на canvas. Жодної
// нової логіки редагування сторінок тут немає — той самий
// sitesBuilderHandler.ts обслуговує сам контент, цей файл лише
// керує дошками й розташуванням вузлів на них.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow, insertRowReturning, updateRowsReturning } from "./supabase";
import { requireOrgAccess } from "./orgAuth";

function json(data: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

function accessErrorResponse(status: number | undefined, corsHeaders: Record<string, string>): Response {
  if (status === 404) return json({ error: "Не знайдено" }, 404, corsHeaders);
  if (status === 403) return json({ error: "Немає доступу" }, 403, corsHeaders);
  return json({ error: "Unauthorized" }, 401, corsHeaders);
}

interface BoardRow {
  id: string;
  organization_id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

interface NodeRow {
  id: string;
  board_id: string;
  node_type: string;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  data: Record<string, unknown>;
  ref_table: string | null;
  ref_id: string | null;
  bound_ref_table: string | null;
  bound_ref_id: string | null;
  field_bindings: Record<string, string> | null;
}

// Smart Components (MODULE_ROADMAP.md "Qorax Creator", п'ятий крок):
// "жива" картка, що показує дані з реальної таблиці, не з
// заморожених значень у canvas_nodes.data. MVP: тільки 'products'
// (Commerce) — план не вимагає одразу підтримувати довільну
// таблицю, важливо довести сам механізм. Whitelist той самий
// принцип безпеки, що LIVE_EMBED_ALLOWED для Live Objects: без
// нього bound_ref_table (вільний text) дозволив би читати ДОВІЛЬНУ
// таблицю бази за bound_ref_id — потенційний витік чужих даних
// (напр. bound_ref_table='profiles').
const SMART_COMPONENT_ALLOWED_TABLES: Record<string, { columns: string[] }> = {
  products: { columns: ["id", "title", "price_cents", "currency", "image_urls", "status"] },
};

// Читає живі дані для одного bound_ref_table/bound_ref_id вузла й
// застосовує field_bindings. Викликається з handleBoardDetail для
// КОЖНОГО smart_component вузла ПРИ КОЖНОМУ показі дошки — план
// прямо вимагає "не кешувати значення в data жорстко", тому
// резолвиться тут, а не при створенні вузла.
async function resolveSmartComponentData(
  node: NodeRow,
  orgId: string,
  env: Env
): Promise<Record<string, unknown> | null> {
  if (!node.bound_ref_table || !node.bound_ref_id) return null;
  const tableConfig = SMART_COMPONENT_ALLOWED_TABLES[node.bound_ref_table];
  if (!tableConfig) return null;

  if (node.bound_ref_table === "products") {
    const res = await selectRows<{ id: string; project_id: string; title: string; price_cents: number; currency: string; image_urls: string[] | null; status: string }>(
      "products",
      `select=id,project_id,title,price_cents,currency,image_urls,status&id=eq.${encodeURIComponent(node.bound_ref_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const product = res.data?.[0];
    if (!product) return null;

    // Належність до організації — через products.project_id ->
    // projects.organization_id (products не має organization_id
    // напряму, той самий непрямий зв'язок, що вже перевіряється для
    // embedded_editor у handleNodeCreate нижче).
    const projectRes = await selectRows<{ organization_id: string }>(
      "projects",
      `select=organization_id&id=eq.${encodeURIComponent(product.project_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (projectRes.data?.[0]?.organization_id !== orgId) return null;

    const source: Record<string, unknown> = {
      id: product.id,
      title: product.title,
      price_cents: product.price_cents,
      currency: product.currency,
      image_urls: product.image_urls,
      status: product.status,
    };

    // field_bindings — {"slot_name": "source_column"}, з плану:
    // {"title": "name", "price_label": "price_cents"}. Невідомі
    // колонки (не в tableConfig.columns) ігноруються — той самий
    // whitelist-принцип на рівні полів, не тільки таблиці.
    const bindings = node.field_bindings ?? {};
    const resolved: Record<string, unknown> = {};
    for (const [slot, column] of Object.entries(bindings)) {
      if (tableConfig.columns.includes(column)) resolved[slot] = source[column];
    }
    return resolved;
  }

  return null;
}

// ── Допоміжне: дістати organization_id дошки, без відомого org
// наперед (список/деталі дошки викликаються з board_id, не org_id
// в URL — на відміну від Rank/Analytics, де site_id вже містить
// organization-контекст неявно через requireOrgAccessForSite). ──
async function getBoardOrgId(boardId: string, env: Env): Promise<string | null> {
  const res = await selectRows<{ organization_id: string }>(
    "canvas_boards",
    `select=organization_id&id=eq.${encodeURIComponent(boardId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  return res.data?.[0]?.organization_id ?? null;
}

// History (MODULE_ROADMAP.md "Qorax Creator", "Developer Mode,
// History, Multiplayer, Marketplace"): append-only знімок вузла при
// кожній суттєвій зміні. Викликається з handleNodeCreate/
// handleNodeUpdate(геометрія)/handleNodeDelete нижче — усі три
// реальні події зміни вузла зараз у системі (Артем: знімати й
// геометрію, не тільки create/delete). Помилка запису версії НІКОЛИ
// не повинна ронити основну операцію над вузлом — історія
// допоміжний шар, як і Knowledge Graph раніше (той самий принцип
// "не критичний шлях").
async function snapshotNodeVersion(
  node: NodeRow,
  boardId: string,
  event: "created" | "updated" | "deleted",
  userId: string | undefined,
  env: Env
): Promise<void> {
  try {
    await insertRow(
      "canvas_node_versions",
      {
        node_id: node.id,
        board_id: boardId,
        event,
        snapshot: {
          node_type: node.node_type,
          position_x: node.position_x,
          position_y: node.position_y,
          width: node.width,
          height: node.height,
          data: node.data,
          ref_table: node.ref_table,
          ref_id: node.ref_id,
          bound_ref_table: node.bound_ref_table,
          bound_ref_id: node.bound_ref_id,
          field_bindings: node.field_bindings,
        },
        created_by: userId ?? null,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
  } catch (err) {
    console.error("[creator-history] failed to snapshot node version:", node.id, event, err instanceof Error ? err.message : err);
  }
}

// ── GET /api/organizations/:id/canvas-boards ── список дощок організації

export async function handleBoardsList(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<BoardRow>(
    "canvas_boards",
    `select=id,organization_id,title,created_at,updated_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=updated_at.desc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ boards: res.data ?? [] }, 200, corsHeaders);
}

// ── POST /api/organizations/:id/canvas-boards ── нова дошка

export async function handleBoardCreate(request: Request, env: Env, corsHeaders: Record<string, string>, organizationId: string): Promise<Response> {
  const access = await requireOrgAccess(request, organizationId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { title?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const insertRes = await insertRowReturning<BoardRow>(
    "canvas_boards",
    { organization_id: organizationId, title: body.title?.trim() || "Без назви" },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);

  return json({ ok: true, board: insertRes.data?.[0] ?? null }, 201, corsHeaders);
}

// ── GET /api/canvas-boards/:id ── дошка + вузли ──────────────────

export async function handleBoardDetail(request: Request, env: Env, corsHeaders: Record<string, string>, boardId: string): Promise<Response> {
  const orgId = await getBoardOrgId(boardId, env);
  if (!orgId) return json({ error: "Дошку не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const boardRes = await selectRows<BoardRow>(
    "canvas_boards",
    `select=id,organization_id,title,created_at,updated_at&id=eq.${encodeURIComponent(boardId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const board = boardRes.data?.[0];
  if (!board) return json({ error: "Дошку не знайдено" }, 404, corsHeaders);

  const nodesRes = await selectRows<NodeRow>(
    "canvas_nodes",
    `select=id,board_id,node_type,position_x,position_y,width,height,data,ref_table,ref_id,bound_ref_table,bound_ref_id,field_bindings&board_id=eq.${encodeURIComponent(boardId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const nodes = nodesRes.data ?? [];

  // Smart Components: резолвиться ТУТ, при кожному GET дошки — план
  // прямо вимагає "не кешувати значення в data жорстко", живі дані
  // читаються з джерела істини в момент показу, не при створенні
  // вузла. Паралельно (Promise.all), не послідовно — кожен виклик
  // resolveSmartComponentData незалежний, послідовне очікування на
  // дошці з кількома smart-вузлами додало б непотрібну затримку.
  const resolvedData = await Promise.all(
    nodes.map(n => n.bound_ref_table ? resolveSmartComponentData(n, orgId, env) : Promise.resolve(null))
  );
  const nodesWithResolved = nodes.map((n, i) => ({ ...n, resolved_data: resolvedData[i] }));

  return json({ board, nodes: nodesWithResolved }, 200, corsHeaders);
}

// ── POST /api/canvas-boards/:id/nodes ── новий вузол на дошці ────
//
// MVP: 'embedded_editor' (Website Mode) і 'live_embed' (Live Objects,
// MODULE_ROADMAP.md "Qorax Creator" — "найдешевший спосіб зробити
// найамбітнішу частину бачення"). Інші типи (text/shape/component)
// — наступні режими за планом, не додаються тут навмисно.

// Live Objects — iframe на вже наявну Dashboard-сторінку, той самий
// auth-контекст (спільна Supabase-сесія на одному домені, той самий
// принцип, що вже підтверджено для переходів між продуктами
// екосистеми — EXECUTION_PLAN.md "Кешування входу між продуктами").
// НЕ довільний URL від клієнта — whitelist конкретних шляхів. Без
// цього обмеження canvas_nodes.data (jsonb, вільна структура) стало
// б відкритим SSRF/iframe-injection вектором: будь-який користувач
// з editor-доступом до дошки міг би вбудувати довільний зовнішній
// URL у iframe на сторінці Creator.
const LIVE_EMBED_ALLOWED: Record<string, string> = {
  crm: "/dashboard/crm",
  analytics: "/dashboard/analytics",
  ai: "/dashboard/ai",
  rank: "/dashboard/rank",
  commerce: "/dashboard/commerce",
  social: "/dashboard/social",
  academy: "/dashboard/academy",
  team: "/dashboard/team",
  benchmark: "/dashboard/benchmark",
};

export async function handleNodeCreate(request: Request, env: Env, corsHeaders: Record<string, string>, boardId: string): Promise<Response> {
  const orgId = await getBoardOrgId(boardId, env);
  if (!orgId) return json({ error: "Дошку не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { node_type?: string; ref_id?: string; live_key?: string; position_x?: number; position_y?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  if (body.node_type === "live_embed") {
    const liveKey = body.live_key;
    if (!liveKey || !(liveKey in LIVE_EMBED_ALLOWED)) {
      return json({ error: `live_key повинен бути одним з: ${Object.keys(LIVE_EMBED_ALLOWED).join(", ")}` }, 400, corsHeaders);
    }

    const insertRes = await insertRowReturning<NodeRow>(
      "canvas_nodes",
      {
        board_id: boardId,
        node_type: "live_embed",
        position_x: body.position_x ?? 0,
        position_y: body.position_y ?? 0,
        width: 560,
        height: 420,
        // embed_path зберігається в data (jsonb), НЕ приймається як
        // довільний рядок від клієнта при читанні назад — фронтенд
        // все одно резолвить live_key через той самий whitelist
        // (LIVE_EMBED_ALLOWED-еквівалент на клієнті), path тут лише
        // для зручності дебагу/адміна, не єдине джерело істини.
        data: { live_key: liveKey, embed_path: LIVE_EMBED_ALLOWED[liveKey] },
        ref_table: null,
        ref_id: null,
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);
    const createdLiveEmbed = insertRes.data?.[0] ?? null;
    if (createdLiveEmbed) await snapshotNodeVersion(createdLiveEmbed, boardId, "created", access.userId, env);

    return json({ ok: true, node: createdLiveEmbed }, 201, corsHeaders);
  }

  if (body.node_type === "smart_component") {
    // MVP: тільки products (Commerce), той самий whitelist, що
    // resolveSmartComponentData вище використовує для читання.
    // field_bindings фіксований для MVP (не редагується користувачем
    // у цьому проході) — доводить сам механізм "живого зв'язку", не
    // довільний конструктор мапінгів.
    const productId = body.ref_id;
    if (!productId) return json({ error: "ref_id (product_id) обов'язковий для smart_component" }, 400, corsHeaders);

    const productRes = await selectRows<{ id: string; project_id: string }>(
      "products",
      `select=id,project_id&id=eq.${encodeURIComponent(productId)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    const product = productRes.data?.[0];
    if (!product) return json({ error: "Товар не знайдено" }, 404, corsHeaders);

    const productProjectRes = await selectRows<{ organization_id: string }>(
      "projects",
      `select=organization_id&id=eq.${encodeURIComponent(product.project_id)}`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (productProjectRes.data?.[0]?.organization_id !== orgId) {
      return json({ error: "Товар належить іншій організації" }, 404, corsHeaders);
    }

    const insertRes = await insertRowReturning<NodeRow>(
      "canvas_nodes",
      {
        board_id: boardId,
        node_type: "smart_component",
        position_x: body.position_x ?? 0,
        position_y: body.position_y ?? 0,
        width: 280,
        height: 200,
        data: {},
        ref_table: null,
        ref_id: null,
        bound_ref_table: "products",
        bound_ref_id: productId,
        field_bindings: { title: "title", price_label: "price_cents", image: "image_urls" },
      },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);
    const createdSmart = insertRes.data?.[0] ?? null;
    if (createdSmart) await snapshotNodeVersion(createdSmart, boardId, "created", access.userId, env);

    return json({ ok: true, node: createdSmart }, 201, corsHeaders);
  }

  if (body.node_type !== "embedded_editor") {
    return json({ error: "Підтримується лише node_type='embedded_editor', 'live_embed' або 'smart_component'" }, 400, corsHeaders);
  }
  if (!body.ref_id) return json({ error: "ref_id (project_id) обов'язковий для embedded_editor" }, 400, corsHeaders);

  // Перевірка, що project справді належить тій самій організації —
  // без цього дошка однієї організації могла б вбудувати Sites-проєкт
  // чужої (ref_id — м'який зв'язок, не foreign key, БД сама цього не
  // забороняє).
  const projectRes = await selectRows<{ id: string; organization_id: string }>(
    "projects",
    `select=id,organization_id&id=eq.${encodeURIComponent(body.ref_id)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const project = projectRes.data?.[0];
  if (!project || project.organization_id !== orgId) {
    return json({ error: "Проєкт не знайдено або належить іншій організації" }, 404, corsHeaders);
  }

  const insertRes = await insertRowReturning<NodeRow>(
    "canvas_nodes",
    {
      board_id: boardId,
      node_type: "embedded_editor",
      position_x: body.position_x ?? 0,
      position_y: body.position_y ?? 0,
      width: 480,
      height: 360,
      data: {},
      ref_table: "projects",
      ref_id: body.ref_id,
    },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!insertRes.ok) return json({ error: insertRes.error }, 500, corsHeaders);
  const createdEditor = insertRes.data?.[0] ?? null;
  if (createdEditor) await snapshotNodeVersion(createdEditor, boardId, "created", access.userId, env);

  return json({ ok: true, node: createdEditor }, 201, corsHeaders);
}

// ── PATCH /api/canvas-boards/:id/nodes/:nodeId ── позиція/розмір ──
//
// Викликається при drag/resize на canvas — часті виклики, тому
// приймає лише геометрію (position_x/y, width/height), не весь вузол.

export async function handleNodeUpdate(request: Request, env: Env, corsHeaders: Record<string, string>, boardId: string, nodeId: string): Promise<Response> {
  const orgId = await getBoardOrgId(boardId, env);
  if (!orgId) return json({ error: "Дошку не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  let body: { position_x?: number; position_y?: number; width?: number; height?: number };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.position_x === "number") patch.position_x = body.position_x;
  if (typeof body.position_y === "number") patch.position_y = body.position_y;
  if (typeof body.width === "number") patch.width = body.width;
  if (typeof body.height === "number") patch.height = body.height;

  const res = await updateRowsReturning<NodeRow>(
    "canvas_nodes",
    `id=eq.${encodeURIComponent(nodeId)}&board_id=eq.${encodeURIComponent(boardId)}`,
    patch,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);
  const updated = res.data?.[0] ?? null;
  if (updated) await snapshotNodeVersion(updated, boardId, "updated", access.userId, env);

  return json({ ok: true }, 200, corsHeaders);
}

// ── DELETE /api/canvas-boards/:id/nodes/:nodeId ──────────────────

export async function handleNodeDelete(request: Request, env: Env, corsHeaders: Record<string, string>, boardId: string, nodeId: string): Promise<Response> {
  const orgId = await getBoardOrgId(boardId, env);
  if (!orgId) return json({ error: "Дошку не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "editor", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  // Знімок ПЕРЕД видаленням — після DELETE рядка вже не існує, читати
  // нема звідки. snapshotNodeVersion усе одно допоміжна дія
  // (try/catch усередині), не критичний шлях для самого видалення.
  const beforeRes = await selectRows<NodeRow>(
    "canvas_nodes",
    `select=id,board_id,node_type,position_x,position_y,width,height,data,ref_table,ref_id,bound_ref_table,bound_ref_id,field_bindings&id=eq.${encodeURIComponent(nodeId)}&board_id=eq.${encodeURIComponent(boardId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const nodeBeforeDelete = beforeRes.data?.[0] ?? null;

  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/canvas_nodes?id=eq.${encodeURIComponent(nodeId)}&board_id=eq.${encodeURIComponent(boardId)}`,
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

  // canvas_node_versions.node_id -> canvas_nodes(id) on delete SET
  // NULL (не cascade, виправлено при написанні цього ендпоінту —
  // cascade видалив би всю історію разом з вузлом, включно з щойно
  // вставленим знімком "deleted", що суперечило б самій меті
  // append-only History). Рядок історії лишається назавжди, лише
  // node_id стає null після видалення самого вузла.
  if (nodeBeforeDelete) await snapshotNodeVersion(nodeBeforeDelete, boardId, "deleted", access.userId, env);

  return json({ ok: true }, 200, corsHeaders);
}

// ── GET /api/canvas-boards/:id/history ── стрічка версій дошки ───
// MODULE_ROADMAP.md "Qorax Creator", History. Читає всю дошку
// одразу (не по вузлах окремо) — денормалізований board_id у
// 0080_creator_history.sql саме для цього.

interface NodeVersionRow {
  id: string;
  node_id: string | null;
  event: "created" | "updated" | "deleted";
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export async function handleBoardHistory(request: Request, env: Env, corsHeaders: Record<string, string>, boardId: string): Promise<Response> {
  const orgId = await getBoardOrgId(boardId, env);
  if (!orgId) return json({ error: "Дошку не знайдено" }, 404, corsHeaders);

  const access = await requireOrgAccess(request, orgId, "viewer", env);
  if (!access.ok) return accessErrorResponse(access.status, corsHeaders);

  const res = await selectRows<NodeVersionRow>(
    "canvas_node_versions",
    `select=id,node_id,event,snapshot,created_by,created_at&board_id=eq.${encodeURIComponent(boardId)}&order=created_at.desc&limit=100`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!res.ok) return json({ error: res.error }, 500, corsHeaders);

  return json({ versions: res.data ?? [] }, 200, corsHeaders);
}
