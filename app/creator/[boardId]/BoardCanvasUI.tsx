"use client";

// Qorax Creator — Website Mode MVP (MODULE_ROADMAP.md "Qorax
// Creator"). Один node_type='embedded_editor' — рендерить вже
// наявний ProjectEditorUI (Sites-конструктор) НАПРЯМУ як React-
// компонент усередині canvas-вузла, не через iframe. План описував
// iframe-підхід для Live Objects (окремий, пізніший пункт — CRM/
// Analytics/AI Chat як готові Next.js сторінки), але
// ProjectEditorUI — вже самодостатній клієнтський компонент без
// власного fullscreen-layout, тож прямий рендер точніше виконує
// вимогу плану "той самий редактор, не переписаний вдруге", ніж
// iframe додав би зайвий шар (сесія, комунікація між фреймами).

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
import { Plus, Loader2, X, Globe } from "lucide-react";
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
}

interface ProjectOption {
  id: string;
  name: string;
}

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

const nodeTypes = { embeddedEditor: EmbeddedEditorNode };

export function BoardCanvasUI({ boardId, organizationId }: Props) {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [loading, setLoading] = useState(true);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [projects, setProjects] = useState<ProjectOption[] | null>(null);
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
    setNodes(rows.filter(r => r.node_type === "embedded_editor").map(toFlowNode));
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
            <Plus size={14} /> Додати сайт на дошку
          </button>
        ) : (
          <div className="glow-card p-2 w-64 max-h-80 overflow-auto space-y-1">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium text-[var(--text-tertiary)]">Оберіть проєкт Sites</span>
              <button onClick={() => setShowAddMenu(false)}><X size={13} className="text-[var(--text-tertiary)]" /></button>
            </div>
            {!projects || projects.length === 0 ? (
              <p className="text-xs text-[var(--text-tertiary)] px-2 py-3">Немає проєктів у Sites-конструкторі. Створіть проєкт спочатку.</p>
            ) : (
              projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => addProjectNode(p.id)}
                  className="w-full text-left text-sm px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors truncate"
                >
                  {p.name}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
