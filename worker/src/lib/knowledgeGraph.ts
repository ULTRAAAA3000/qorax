// ============================================================
// knowledgeGraph.ts — Knowledge Graph (MODULE_ROADMAP.md, "Четверта
// хвиля", розділ 14). Не окремий модуль з власною сторінкою — шар
// даних, що робить явними зв'язки між сутностями бізнеса клієнта
// (сторінки/товари/ліди/ключові слова), щоб AI Chat (chatHandler.ts)
// міг відповідати на відносні питання ("які сторінки пов'язані з
// товаром X"), а не тільки читати сирі дані окремих модулів.
//
// upsertNode()/addEdge() викликаються НЕ з окремого сервісу, а з
// місць, де вже створюється контент (crmHandler.ts, sitesBuilderHandler.ts,
// rankHandler.ts) — граф наповнюється як побічний ефект вже наявних
// операцій, без нової бізнес-логіки.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRowReturning } from "./supabase";

export type KgNodeType =
  | "service"
  | "category"
  | "page"
  | "product"
  | "customer"
  | "competitor"
  | "keyword"
  | "article"
  | "lead";

export type KgRelation = "related_to" | "targets_keyword" | "mentions" | "competes_with";

interface KgNodeRow {
  id: string;
}

/**
 * Створює або оновлює вузол графа, прив'язаний до реального рядка
 * в іншій таблиці (ref_table/ref_id). Ідемпотентно завдяки
 * unique(organization_id, ref_table, ref_id) в 0065_knowledge_graph.sql —
 * повторний виклик при редагуванні запису (напр. користувач перейменував
 * сторінку) лише оновлює label, не створює дубль.
 *
 * Не кидає виняток при помилці — граф є допоміжним шаром для якості
 * AI Chat, а не критичним шляхом; якщо запис у kg_nodes не вдався,
 * основна операція (створення сторінки/ліда/...) не повинна через це
 * повертати помилку користувачу. Викликач просто ігнорує результат,
 * якщо не потрібен id для addEdge().
 */
export async function upsertNode(
  organizationId: string,
  nodeType: KgNodeType,
  label: string,
  refTable: string | null,
  refId: string | null,
  env: Env
): Promise<string | null> {
  try {
    if (refTable && refId) {
      const existing = await selectRows<KgNodeRow>(
        "kg_nodes",
        `select=id&organization_id=eq.${encodeURIComponent(organizationId)}&ref_table=eq.${encodeURIComponent(refTable)}&ref_id=eq.${encodeURIComponent(refId)}`,
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );
      const existingId = existing.data?.[0]?.id;
      if (existingId) {
        // Вузол вже є — оновлюємо тільки label (напр. користувач перейменував сторінку/товар)
        await fetch(`${env.SUPABASE_URL}/rest/v1/kg_nodes?id=eq.${encodeURIComponent(existingId)}`, {
          method: "PATCH",
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
            "Content-Type": "application/json",
            Prefer: "return=minimal",
          },
          body: JSON.stringify({ label }),
        });
        return existingId;
      }
    }

    const insertRes = await insertRowReturning<KgNodeRow>(
      "kg_nodes",
      { organization_id: organizationId, node_type: nodeType, label, ref_table: refTable, ref_id: refId },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    return insertRes.data?.[0]?.id ?? null;
  } catch (err) {
    console.error("[knowledgeGraph] upsertNode failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Додає зв'язок між двома вже існуючими вузлами. Так само не кидає
 * виняток — той самий принцип "граф не блокує основну операцію".
 * unique(from_node_id, to_node_id, relation) в міграції робить повторний
 * виклик безпечним (409/duplicate ігнорується мовчки).
 */
export async function addEdge(
  organizationId: string,
  fromNodeId: string,
  toNodeId: string,
  relation: KgRelation,
  env: Env,
  weight = 1.0
): Promise<void> {
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/kg_edges`, {
      method: "POST",
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=ignore-duplicates,return=minimal",
      },
      body: JSON.stringify({ organization_id: organizationId, from_node_id: fromNodeId, to_node_id: toNodeId, relation, weight }),
    });
  } catch (err) {
    console.error("[knowledgeGraph] addEdge failed:", err instanceof Error ? err.message : err);
  }
}

interface GraphNodeSummary {
  id: string;
  node_type: KgNodeType;
  label: string;
}

interface GraphEdgeSummary {
  from_node_id: string;
  to_node_id: string;
  relation: string;
}

/**
 * Формує текстовий блок для системного промпту AI Chat
 * (chatHandler.ts, buildOrgScopedPrompt/buildSiteScopedPrompt) — той
 * самий патерн, що buildMemoryContext() в memoryHandler.ts: повертає
 * null, якщо граф ще порожній, щоб не додавати порожній розділ
 * промпту даремно.
 *
 * MVP-версія: показує до `maxNodes` останніх вузлів організації,
 * згрупованих за типом, і зв'язки між ними — без семантичного
 * пошуку релевантності до конкретного запиту користувача (це
 * майбутнє покращення, коли вузлів стане багато і плоский список
 * перестане вміщатись у розумний бюджет токенів промпту).
 */
export async function buildGraphContext(organizationId: string, env: Env, maxNodes = 60): Promise<string | null> {
  const nodesRes = await selectRows<GraphNodeSummary>(
    "kg_nodes",
    `select=id,node_type,label&organization_id=eq.${encodeURIComponent(organizationId)}&order=created_at.desc&limit=${maxNodes}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const nodes = nodesRes.data ?? [];
  if (nodes.length === 0) return null;

  const nodeIds = nodes.map(n => n.id);
  const edgesRes = await selectRows<GraphEdgeSummary>(
    "kg_edges",
    `select=from_node_id,to_node_id,relation&organization_id=eq.${encodeURIComponent(organizationId)}&from_node_id=in.(${nodeIds.map(id => encodeURIComponent(id)).join(",")})`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const edges = edgesRes.data ?? [];

  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const byType = new Map<KgNodeType, string[]>();
  for (const n of nodes) {
    const list = byType.get(n.node_type) ?? [];
    list.push(n.label);
    byType.set(n.node_type, list);
  }

  const lines: string[] = [];
  const typeLabels: Record<string, string> = {
    page: "Сторінки",
    product: "Товари",
    customer: "Клієнти",
    lead: "Ліди",
    keyword: "Ключові слова",
    article: "Статті",
    competitor: "Конкуренти",
    category: "Категорії",
    service: "Послуги",
  };
  for (const [type, labels] of byType) {
    lines.push(`${typeLabels[type] ?? type}: ${labels.slice(0, 15).join(", ")}`);
  }

  if (edges.length > 0) {
    const edgeLines = edges.slice(0, 30).map(e => {
      const from = nodeById.get(e.from_node_id)?.label ?? "?";
      const to = nodeById.get(e.to_node_id)?.label ?? "?";
      return `${from} → (${e.relation}) → ${to}`;
    });
    lines.push(`Зв'язки: ${edgeLines.join("; ")}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}
