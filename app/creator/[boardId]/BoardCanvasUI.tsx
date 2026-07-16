"use client";

// Qorax Creator — Website Mode (embedded_editor, ProjectEditorUI
// НАПРЯМУ як React-компонент, не iframe — обґрунтування нижче) +
// Live Objects (live_embed, MODULE_ROADMAP.md "Qorax Creator" —
// "найдешевший спосіб зробити найамбітнішу частину бачення"): iframe
// на вже наявну Dashboard-сторінку (CRM/Analytics/AI Chat/тощо),
// той самий auth-контекст (спільна Supabase-сесія на одному домені).
//
// embedded_editor рендериться НАПРЯМУ як компонент, не iframe —
// ProjectEditorUI вже самодостатній клієнтський компонент без
// власного fullscreen-layout, прямий рендер точніше виконує вимогу
// "той самий редактор, не переписаний вдруге". live_embed, навпаки,
// — саме iframe: план для Live Objects явно описує iframe-підхід
// (CRM/Analytics/AI Chat — повноцінні Dashboard-сторінки з власним
// PlatformSidebar/layout, вбудовувати їх напряму як React-компонент
// означало б тягнути весь Dashboard-каркас усередину canvas-вузла —
// iframe тут дешевший і саме те, що описує план).

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  applyNodeChanges,
  type NodeChange,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Plus, Loader2, X, Globe, Zap, Users, BarChart3, Sparkles, Search, ShoppingCart, Share2, GraduationCap, Users2, Trophy, RefreshCw } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { ProjectEditorUI } from "@/app/dashboard/sites-builder/[projectId]/ProjectEditorUI";

interface CanvasNodeRow {
  id: string;
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
  resolved_data: Record<string, unknown> | null;
}

interface ProjectOption {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  title: string;
  price_cents: number;
  currency: string;
}

// Дзеркалить LIVE_EMBED_ALLOWED у worker/src/lib/creatorHandler.ts —
// джерело істини для безпеки саме там (worker перевіряє live_key
// проти власного whitelist незалежно від того, що надішле клієнт),
// тут лише для читабельних підписів і списку вибору в UI.
const LIVE_EMBED_OPTIONS: Array<{ key: string; label: string; path: string; icon: typeof Users }> = [
  { key: "crm", label: "CRM", path: "/dashboard/crm", icon: Users },
  { key: "analytics", label: "Analytics", path: "/dashboard/analytics", icon: BarChart3 },
  { key: "ai", label: "AI Chat", path: "/dashboard/ai", icon: Sparkles },
  { key: "rank", label: "Rank", path: "/dashboard/rank", icon: Search },
  { key: "commerce", label: "Commerce", path: "/dashboard/commerce", icon: ShoppingCart },
  { key: "social", label: "Social", path: "/dashboard/social", icon: Share2 },
  { key: "academy", label: "Academy", path: "/dashboard/academy", icon: GraduationCap },
  { key: "team", label: "Team", path: "/dashboard/team", icon: Users2 },
  { key: "benchmark", label: "Benchmark", path: "/dashboard/benchmark", icon: Trophy },
];

interface Props {
  boardId: string;
  organizationId: string;
}

async function getFreshToken(): Promise<string> {
  try {
    const { createClient } = await import("@/app/lib/supabase/client");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  } catch {
    return "";
  }
}

// ── node_type='embedded_editor' → React Flow custom node ─────────
// Рамка з заголовком (назва проєкту) і кнопкою видалення, всередині
// — сам ProjectEditorUI у прокручуваному контейнері фіксованого
// розміру (canvas-вузол задає width/height, редактор адаптивний).
function EmbeddedEditorNode({ data }: NodeProps) {
  const projectId = data.projectId as string;
  const projectName = data.projectName as string;
  const onDelete = data.onDelete as () => void;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ width: "100%", height: "100%", background: "var(--bg)", border: "1px solid rgba(255,255,255,0.12)" }}
    >
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2 cursor-move"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Globe size={12} style={{ color: "var(--cyan)" }} />
          <span className="text-xs font-medium truncate">{projectName}</span>
        </div>
        <button onClick={onDelete} className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors nodrag">
          <X size={12} className="text-[var(--text-tertiary)]" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto nodrag nowheel p-3" style={{ background: "var(--bg)" }}>
        <ProjectEditorUI projectId={projectId} />
      </div>
    </div>
  );
}

// ── node_type='live_embed' → iframe на Dashboard-сторінку ─────────
// Той самий origin (Creator і Dashboard — один Next.js застосунок,
// один домен), тому iframe успадковує сесію без жодної додаткової
// авторизації чи передачі токена — браузер сам додає ті самі
// cookies. embed_path завжди береться з локального LIVE_EMBED_OPTIONS
// за live_key (не з data.embed_path, яке worker повертає лише для
// зручності перегляду/дебагу) — той самий принцип подвійного
// захисту, що описаний у creatorHandler.ts: навіть якщо хтось
// підмінить значення в БД напряму, фронтенд все одно резолвить шлях
// через власний whitelist, не довіряючи довільному рядку з відповіді.
function LiveEmbedNode({ data }: NodeProps) {
  const liveKey = data.liveKey as string;
  const onDelete = data.onDelete as () => void;
  const option = LIVE_EMBED_OPTIONS.find(o => o.key === liveKey);
  const Icon = option?.icon ?? Zap;

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ width: "100%", height: "100%", background: "var(--bg)", border: "1px solid rgba(255,255,255,0.12)" }}
    >
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2 cursor-move"
        style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <Icon size={12} style={{ color: "var(--lime)" }} />
          <span className="text-xs font-medium truncate">{option?.label ?? "Live Object"}</span>
        </div>
        <button onClick={onDelete} className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors nodrag">
          <X size={12} className="text-[var(--text-tertiary)]" />
        </button>
      </div>
      <div className="flex-1 min-h-0 nodrag nowheel">
        {option ? (
          <iframe
            src={option.path}
            className="w-full h-full border-0"
            title={option.label}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-xs text-[var(--text-tertiary)]">Невідомий модуль</div>
        )}
      </div>
    </div>
  );
}

// ── node_type='smart_component' → "жива" картка товару ────────────
// MODULE_ROADMAP.md "Qorax Creator", Smart Components: значення тут
// НЕ з canvas_nodes.data (заморожені), а з resolvedData у
// data.resolved — worker резолвить bound_ref_table/bound_ref_id ПРИ
// КОЖНОМУ GET дошки (creatorHandler.ts::resolveSmartComponentData),
// тому просте перезавантаження дошки показує актуальну ціну без
// жодної дії користувача над самою карткою.
function SmartComponentNode({ data }: NodeProps) {
  const resolved = data.resolved as Record<string, unknown> | null;
  const onDelete = data.onDelete as () => void;

  const title = resolved?.title as string | undefined;
  const priceCents = resolved?.price_label as number | undefined;
  const imageUrls = resolved?.image as string[] | null | undefined;
  const image = imageUrls?.[0];

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{ width: "100%", height: "100%", background: "var(--bg-raised)", border: "1px solid rgba(214,255,63,0.2)" }}
    >
      <div
        className="shrink-0 flex items-center justify-between px-3 py-2"
        style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <RefreshCw size={11} style={{ color: "var(--lime)" }} />
          <span className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-tertiary)]">Live · Commerce</span>
        </div>
        <button onClick={onDelete} className="shrink-0 p-1 rounded-lg hover:bg-white/10 transition-colors nodrag">
          <X size={12} className="text-[var(--text-tertiary)]" />
        </button>
      </div>
      <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
        {image && (
          <div className="w-full h-24 rounded-lg overflow-hidden shrink-0" style={{ background: "rgba(255,255,255,0.03)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- зовнішній URL товару, невідомий заздалегідь домен, next/image вимагав би whitelist домену на кожен магазин клієнта */}
            <img src={image} alt={title ?? ""} className="w-full h-full object-cover" />
          </div>
        )}
        <p className="text-sm font-medium truncate">{title ?? "Товар не знайдено"}</p>
        {priceCents != null && (
          <p className="text-lg font-display font-semibold" style={{ color: "var(--lime)" }}>
            {(priceCents / 100).toFixed(2)}
          </p>
        )}
      </div>
    </div>
  );
}

const nodeTypes = { embeddedEditor: EmbeddedEditorNode, liveEmbed: LiveEmbedNode, smartComponent: SmartComponentNode };

export function BoardCanvasUI({ boardId, organizationId }: Props) {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
  // Товари прив'язані до конкретного Sites-проєкту (Commerce), не до
  // організації напряму — тому вибір smart_component двоетапний:
  // спочатку проєкт, потім товар цього проєкту (той самий реальний
  // зв'язок даних, не штучне спрощення UI).
  const [productPickerProjectId, setProductPickerProjectId] = useState<string | null>(null);
  const [products, setProducts] = useState<ProductOption[] | null>(null);
  const rawNodesRef = useRef<Map<string, CanvasNodeRow>>(new Map());
  const projectNamesRef = useRef<Map<string, string>>(new Map());

  const deleteNode = useCallback(async (nodeId: string) => {
    setNodes(nds => nds.filter(n => n.id !== nodeId));
    rawNodesRef.current.delete(nodeId);
    const token = await getFreshToken();
    await fetch(`${API_BASE_URL}/api/canvas-boards/${boardId}/nodes/${nodeId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }, [boardId, setNodes]);

  const toFlowNode = useCallback((row: CanvasNodeRow): Node => {
    rawNodesRef.current.set(row.id, row);

    if (row.node_type === "live_embed") {
      return {
        id: row.id,
        type: "liveEmbed",
        position: { x: row.position_x, y: row.position_y },
        style: { width: row.width, height: row.height },
        data: {
          liveKey: row.data.live_key,
          onDelete: () => deleteNode(row.id),
        },
      };
    }

    if (row.node_type === "smart_component") {
      return {
        id: row.id,
        type: "smartComponent",
        position: { x: row.position_x, y: row.position_y },
        style: { width: row.width, height: row.height },
        data: {
          resolved: row.resolved_data,
          onDelete: () => deleteNode(row.id),
        },
      };
    }

    return {
      id: row.id,
      type: "embeddedEditor",
      position: { x: row.position_x, y: row.position_y },
      style: { width: row.width, height: row.height },
      data: {
        projectId: row.ref_id,
        projectName: projectNamesRef.current.get(row.ref_id ?? "") ?? "Сайт",
        onDelete: () => deleteNode(row.id),
      },
    };
  }, [deleteNode]);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const [boardRes, projectsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/canvas-boards/${boardId}`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API_BASE_URL}/api/projects?organization_id=${organizationId}`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const boardData = await boardRes.json();
    const projectsData = await projectsRes.json();

    const projectList: ProjectOption[] = projectsData.projects ?? [];
    projectNamesRef.current = new Map(projectList.map((p) => [p.id, p.name]));
    setProjects(projectList);

    const rows: CanvasNodeRow[] = boardData.nodes ?? [];
    setNodes(rows.filter(r => r.node_type === "embedded_editor" || r.node_type === "live_embed" || r.node_type === "smart_component").map(toFlowNode));
    setLoading(false);
  }, [boardId, organizationId, setNodes, toFlowNode]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  // Позиція/розмір змінюються часто під час drag — застосовуємо
  // локально одразу (applyNodeChanges, стандартний React Flow патерн),
  // персистимо в БД лише по завершенню (onNodeDragStop/onResizeEnd),
  // не на кожен піксель руху.
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    setNodes(nds => applyNodeChanges(changes, nds));
  }, [setNodes]);

  const persistNodeGeometry = useCallback(async (nodeId: string, position: { x: number; y: number }, dimensions?: { width: number; height: number }) => {
    const token = await getFreshToken();
    const patch: Record<string, number> = { position_x: position.x, position_y: position.y };
    if (dimensions) { patch.width = dimensions.width; patch.height = dimensions.height; }
    await fetch(`${API_BASE_URL}/api/canvas-boards/${boardId}/nodes/${nodeId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, [boardId]);

  async function addProjectNode(projectId: string) {
    setShowAddMenu(false);
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/canvas-boards/${boardId}/nodes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ node_type: "embedded_editor", ref_id: projectId, position_x: 40 + nodes.length * 40, position_y: 40 + nodes.length * 40 }),
    });
    const data = await res.json();
    if (data.node) setNodes(nds => [...nds, toFlowNode(data.node)]);
  }

  async function addLiveEmbedNode(liveKey: string) {
    setShowAddMenu(false);
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/canvas-boards/${boardId}/nodes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ node_type: "live_embed", live_key: liveKey, position_x: 40 + nodes.length * 40, position_y: 40 + nodes.length * 40 }),
    });
    const data = await res.json();
    if (data.node) setNodes(nds => [...nds, toFlowNode(data.node)]);
  }

  async function openProductPicker(projectId: string) {
    setProductPickerProjectId(projectId);
    setProducts(null);
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setProducts(data.products ?? []);
  }

  async function addSmartComponentNode(productId: string) {
    setShowAddMenu(false);
    setProductPickerProjectId(null);
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/canvas-boards/${boardId}/nodes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ node_type: "smart_component", ref_id: productId, position_x: 40 + nodes.length * 40, position_y: 40 + nodes.length * 40 }),
    });
    const data = await res.json();
    if (data.node) setNodes(nds => [...nds, toFlowNode(data.node)]);
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        onNodesChange={onNodesChange}
        onNodeDragStop={(_, node) => persistNodeGeometry(node.id, node.position)}
        nodeTypes={nodeTypes}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        minZoom={0.1}
        maxZoom={1.5}
      >
        <Background color="rgba(255,255,255,0.08)" gap={24} />
        <Controls />
        <MiniMap pannable zoomable style={{ background: "var(--bg-raised)" }} />
      </ReactFlow>

      <div className="absolute top-4 left-4 z-10">
        {!showAddMenu ? (
          <button onClick={() => setShowAddMenu(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
            <Plus size={14} /> Додати на дошку
          </button>
        ) : (
          <div className="glow-card p-2 w-72 max-h-96 overflow-auto space-y-3">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-[var(--text-tertiary)]">Додати на дошку</span>
              <button onClick={() => setShowAddMenu(false)}><X size={13} className="text-[var(--text-tertiary)]" /></button>
            </div>

            <div>
              <p className="px-2 text-[10px] font-mono uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Сайт (Website Mode)</p>
              {!projects || projects.length === 0 ? (
                <p className="text-xs text-[var(--text-tertiary)] px-2 py-2">Немає проєктів у Sites-конструкторі.</p>
              ) : (
                <div className="space-y-1">
                  {projects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => addProjectNode(p.id)}
                      className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors truncate flex items-center gap-1.5"
                    >
                      <Globe size={12} className="text-[var(--cyan)] shrink-0" /> {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="px-2 text-[10px] font-mono uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Живий об&apos;єкт (Live Objects)</p>
              <div className="space-y-1">
                {LIVE_EMBED_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => addLiveEmbedNode(opt.key)}
                    className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors truncate flex items-center gap-1.5"
                  >
                    <opt.icon size={12} className="text-[var(--lime)] shrink-0" /> {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="px-2 text-[10px] font-mono uppercase tracking-wide text-[var(--text-tertiary)] mb-1">Живий товар (Smart Component)</p>
              {!productPickerProjectId ? (
                !projects || projects.length === 0 ? (
                  <p className="text-xs text-[var(--text-tertiary)] px-2 py-2">Немає проєктів у Sites-конструкторі.</p>
                ) : (
                  <div className="space-y-1">
                    {projects.map(p => (
                      <button
                        key={p.id}
                        onClick={() => openProductPicker(p.id)}
                        className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors truncate flex items-center gap-1.5"
                      >
                        <RefreshCw size={12} className="text-[var(--lime)] shrink-0" /> {p.name}
                      </button>
                    ))}
                  </div>
                )
              ) : (
                <div className="space-y-1">
                  <button onClick={() => setProductPickerProjectId(null)} className="text-xs text-[var(--text-tertiary)] px-2 py-1 hover:text-[var(--text-primary)] transition-colors">
                    ← Назад до проєктів
                  </button>
                  {!products ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] px-2 py-2"><Loader2 size={12} className="animate-spin" /> Завантаження...</div>
                  ) : products.length === 0 ? (
                    <p className="text-xs text-[var(--text-tertiary)] px-2 py-2">Немає товарів у цьому проєкті.</p>
                  ) : (
                    products.map(p => (
                      <button
                        key={p.id}
                        onClick={() => addSmartComponentNode(p.id)}
                        className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors truncate flex items-center justify-between gap-1.5"
                      >
                        <span className="truncate">{p.title}</span>
                        <span className="text-xs text-[var(--text-tertiary)] shrink-0">{(p.price_cents / 100).toFixed(2)}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
