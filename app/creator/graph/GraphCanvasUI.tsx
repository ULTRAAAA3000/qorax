"use client";

// Diagram Mode / KG Visualization (MODULE_ROADMAP.md "Qorax
// Creator"). kg_nodes не зберігає позицію (на відміну від
// canvas_nodes у Website Mode) — граф не "дошка", яку хтось
// розкладає вручну, а похідна структура з реальних даних платформи.
// Тому позиція обчислюється на льоту: прості концентричні кільця,
// групування по node_type (keyword/customer/page/... кожен свій
// радіус) — не dagre/elk (нова важка залежність заради MVP
// візуалізації, яку не редагують). Якщо в майбутньому знадобиться
// точний ієрархічний layout, це окреме рішення.

import { useState, useEffect, useCallback } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Loader2, Network, Tag, User, FileText, Package, Building2, KeyRound, Newspaper, UserCircle2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface GraphNode {
  id: string;
  node_type: string;
  label: string;
  ref_table: string | null;
  ref_id: string | null;
}

interface GraphEdge {
  id: string;
  from_node_id: string;
  to_node_id: string;
  relation: string;
  weight: number;
}

interface Props {
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

const TYPE_META: Record<string, { color: string; icon: typeof Tag; label: string }> = {
  keyword: { color: "var(--lime)", icon: KeyRound, label: "Ключове слово" },
  customer: { color: "var(--cyan)", icon: User, label: "Клієнт/Лід" },
  page: { color: "var(--purple)", icon: FileText, label: "Сторінка" },
  product: { color: "#ff9f5a", icon: Package, label: "Товар" },
  competitor: { color: "#f5675a", icon: Building2, label: "Конкурент" },
  article: { color: "#8cf6ff", icon: Newspaper, label: "Стаття" },
  lead: { color: "var(--cyan)", icon: UserCircle2, label: "Лід" },
  service: { color: "var(--lime)", icon: Tag, label: "Послуга" },
  category: { color: "#bf5af2", icon: Tag, label: "Категорія" },
};

function graphNodeMeta(nodeType: string) {
  return TYPE_META[nodeType] ?? { color: "var(--text-tertiary)", icon: Tag, label: nodeType };
}

function KgNode({ data }: NodeProps) {
  const nodeType = data.nodeType as string;
  const label = data.label as string;
  const meta = graphNodeMeta(nodeType);
  const Icon = meta.icon;

  return (
    <div
      className="rounded-xl px-3 py-2 flex items-center gap-2 max-w-[200px]"
      style={{ background: "var(--bg-raised)", border: `1px solid ${meta.color}55` }}
    >
      <Icon size={13} style={{ color: meta.color, flexShrink: 0 }} />
      <span className="text-xs font-medium truncate">{label}</span>
    </div>
  );
}

const nodeTypes = { kgNode: KgNode };

// Концентричні кільця по node_type: кожен тип — своє коло, вузли
// одного типу рівномірно розподілені по колу. Просто, детерміновано,
// не потребує ітеративного force-layout для MVP-кількості вузлів
// (ліміт 300 з worker-ендпоінту).
function layoutNodes(nodes: GraphNode[]): Node[] {
  const byType = new Map<string, GraphNode[]>();
  for (const n of nodes) {
    if (!byType.has(n.node_type)) byType.set(n.node_type, []);
    byType.get(n.node_type)!.push(n);
  }

  const types = Array.from(byType.keys());
  const result: Node[] = [];
  types.forEach((type, typeIndex) => {
    const radius = 220 + typeIndex * 260;
    const group = byType.get(type)!;
    group.forEach((n, i) => {
      const angle = (i / group.length) * Math.PI * 2 + typeIndex * 0.4;
      result.push({
        id: n.id,
        type: "kgNode",
        position: { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius },
        data: { label: n.label, nodeType: n.node_type },
      });
    });
  });
  return result;
}

function layoutEdges(edges: GraphEdge[]): Edge[] {
  return edges.map(e => ({
    id: e.id,
    source: e.from_node_id,
    target: e.to_node_id,
    label: e.relation === "related_to" ? undefined : e.relation,
    style: { stroke: "rgba(255,255,255,0.15)" },
    labelStyle: { fill: "var(--text-tertiary)", fontSize: 10 },
  }));
}

export function GraphCanvasUI({ organizationId }: Props) {
  const [nodes, setNodes] = useNodesState<Node>([]);
  const [edges, setEdges] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/knowledge-graph`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const graphNodes: GraphNode[] = data.nodes ?? [];
    const graphEdges: GraphEdge[] = data.edges ?? [];

    setNodes(layoutNodes(graphNodes));
    setEdges(layoutEdges(graphEdges));
    setEmpty(graphNodes.length === 0);
    setLoading(false);
  }, [organizationId, setNodes, setEdges]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 size={20} className="animate-spin text-[var(--text-tertiary)]" />
      </div>
    );
  }

  if (empty) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center max-w-sm px-6">
          <Network size={24} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm text-[var(--text-secondary)]">
            Граф ще порожній. Він заповнюється автоматично, коли ви додаєте ключові слова в Rank, контакти в CRM або сторінки в Sites.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        colorMode="dark"
        proOptions={{ hideAttribution: true }}
        minZoom={0.05}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        fitView
      >
        <Background color="rgba(255,255,255,0.08)" gap={24} />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable style={{ background: "var(--bg-raised)" }} />
      </ReactFlow>

      <div className="absolute top-4 left-4 z-10 glow-card px-3 py-2 flex items-center gap-1.5">
        <Network size={13} style={{ color: "var(--cyan)" }} />
        <span className="text-xs text-[var(--text-tertiary)]">{nodes.length} вузлів · {edges.length} зв&apos;язків</span>
      </div>
    </div>
  );
}
