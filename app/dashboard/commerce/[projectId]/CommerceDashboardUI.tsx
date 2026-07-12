"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, ShoppingBag, Tag, Loader2, Plus, X, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

type TabId = "products" | "orders" | "coupons";

const TABS: Array<{ id: TabId; label: string; icon: typeof Package }> = [
  { id: "products", label: "Товари", icon: Package },
  { id: "orders", label: "Замовлення", icon: ShoppingBag },
  { id: "coupons", label: "Купони", icon: Tag },
];

interface Product {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  sku: string | null;
  stock_quantity: number | null;
  status: string;
}

interface Order {
  id: string;
  customer_email: string;
  customer_name: string | null;
  status: string;
  total_cents: number;
  currency: string;
  created_at: string;
}

function formatMoney(cents: number, currency: string): string {
  return `${(cents / 100).toFixed(2)} ${currency}`;
}

const ORDER_STATUS_META: Record<string, { label: string; color: string }> = {
  pending: { label: "Очікує оплати", color: "var(--text-tertiary)" },
  paid: { label: "Оплачено", color: "var(--lime)" },
  shipped: { label: "Відправлено", color: "var(--cyan)" },
  cancelled: { label: "Скасовано", color: "#F5675A" },
  refunded: { label: "Повернуто", color: "#F5675A" },
};

const PRODUCT_STATUS_META: Record<string, { label: string; color: string }> = {
  draft: { label: "Чернетка", color: "var(--text-tertiary)" },
  published: { label: "Опубліковано", color: "var(--lime)" },
  archived: { label: "Архів", color: "var(--text-tertiary)" },
};

export function CommerceDashboardUI({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [activeTab, setActiveTab] = useState<TabId>("products");

  return (
    <div>
      <div
        className="flex items-center gap-1 p-1 rounded-xl mb-6 overflow-x-auto"
        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        {TABS.map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
              style={{
                background: isActive ? "rgba(255,255,255,0.06)" : "transparent",
                color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              <Icon size={14} style={{ color: isActive ? "var(--lime)" : "inherit" }} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "products" && <ProductsTab projectId={projectId} accessToken={accessToken} />}
      {activeTab === "orders" && <OrdersTab projectId={projectId} accessToken={accessToken} />}
      {activeTab === "coupons" && <CouponsTab projectId={projectId} />}
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────

function ProductsTab({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/products`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setProducts(data.products ?? []);
  }, [projectId, accessToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function createProduct(e: React.FormEvent) {
    e.preventDefault();
    const priceCents = Math.round(parseFloat(price) * 100);
    if (!title.trim() || isNaN(priceCents) || priceCents < 0) {
      setError("Вкажіть назву та коректну ціну");
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/products`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), price_cents: priceCents }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setTitle("");
      setPrice("");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function toggleStatus(product: Product) {
    const nextStatus = product.status === "published" ? "draft" : "published";
    await fetch(`${API_BASE_URL}/api/projects/${projectId}/products/${product.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status: nextStatus }),
    });
    setProducts(prev => prev?.map(p => (p.id === product.id ? { ...p, status: nextStatus } : p)) ?? null);
  }

  async function deleteProduct(id: string) {
    await fetch(`${API_BASE_URL}/api/projects/${projectId}/products/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setProducts(prev => prev?.filter(p => p.id !== id) ?? null);
  }

  return (
    <div className="space-y-4">
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
          <Plus size={14} /> Додати товар
        </button>
      ) : (
        <form onSubmit={createProduct} className="glow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Новий товар</span>
            <button type="button" onClick={() => setShowCreate(false)}><X size={16} className="text-[var(--text-tertiary)]" /></button>
          </div>
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Назва товару" maxLength={200}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <input
            type="number" value={price} onChange={e => setPrice(e.target.value)}
            placeholder="Ціна (напр. 19.99)" step="0.01" min="0"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button type="submit" disabled={creating} className="glow-button text-sm !py-2 !px-4 disabled:opacity-50">
            {creating ? <Loader2 size={14} className="animate-spin" /> : "Створити"}
          </button>
        </form>
      )}

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
          {error}
        </div>
      )}

      {!products && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {products?.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Ще немає товарів.</p>
      )}

      {products && products.length > 0 && (
        <div className="space-y-2">
          {products.map(product => {
            const meta = PRODUCT_STATUS_META[product.status] ?? PRODUCT_STATUS_META.draft;
            return (
              <div key={product.id} className="glow-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{product.title}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">{formatMoney(product.price_cents, product.currency)}</p>
                </div>
                <button
                  onClick={() => toggleStatus(product)}
                  className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
                  style={{ background: `${meta.color}1A`, color: meta.color, border: `1px solid ${meta.color}33` }}
                >
                  {meta.label}
                </button>
                <button onClick={() => deleteProduct(product.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <Trash2 size={14} className="text-[var(--text-tertiary)]" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Orders ────────────────────────────────────────────────────────

function OrdersTab({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [orders, setOrders] = useState<Order[] | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/orders`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setOrders(data.orders ?? []);
  }, [projectId, accessToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  if (!orders) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
        <Loader2 size={16} className="animate-spin" /> Завантаження...
      </div>
    );
  }

  if (orders.length === 0) {
    return <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Ще немає замовлень.</p>;
  }

  return (
    <div className="space-y-2">
      {orders.map(order => {
        const meta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.pending;
        return (
          <div key={order.id} className="glow-card p-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{order.customer_name || order.customer_email}</p>
              <p className="text-xs text-[var(--text-tertiary)] truncate">{order.customer_email}</p>
            </div>
            <span className="text-sm font-mono shrink-0">{formatMoney(order.total_cents, order.currency)}</span>
            <span
              className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
              style={{ background: `${meta.color}1A`, color: meta.color, border: `1px solid ${meta.color}33` }}
            >
              {meta.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Coupons (мінімальний перегляд — створення купонів прямим SQL/
// адмінкою на першій ітерації, як і решта модулів на MVP-етапі) ────

function CouponsTab({ projectId }: { projectId: string }) {
  return (
    <div className="glow-card p-6 text-center">
      <Tag size={20} className="mx-auto mb-2 opacity-40" />
      <p className="text-sm text-[var(--text-secondary)]">
        Керування купонами з UI — наступна ітерація. Перевірка коду під час
        checkout вже працює (<code className="text-xs">/api/coupons/validate</code>).
      </p>
      <p className="text-xs text-[var(--text-tertiary)] mt-2">project_id: {projectId}</p>
    </div>
  );
}
