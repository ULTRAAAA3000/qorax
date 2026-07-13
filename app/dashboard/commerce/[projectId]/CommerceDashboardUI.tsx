"use client";

import { useState, useEffect, useCallback } from "react";
import { Package, ShoppingBag, Tag, Loader2, Plus, X, Trash2, FolderTree, Pencil, Check } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

type TabId = "products" | "categories" | "orders" | "coupons";

const TABS: Array<{ id: TabId; label: string; icon: typeof Package }> = [
  { id: "products", label: "Товари", icon: Package },
  { id: "categories", label: "Категорії", icon: FolderTree },
  { id: "orders", label: "Замовлення", icon: ShoppingBag },
  { id: "coupons", label: "Купони", icon: Tag },
];

interface Category {
  id: string;
  project_id: string;
  name: string;
  slug: string;
  parent_id: string | null;
}

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

interface Coupon {
  id: string;
  code: string;
  discount_type: string;
  discount_value: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
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
      {activeTab === "categories" && <CategoriesTab projectId={projectId} accessToken={accessToken} />}
      {activeTab === "orders" && <OrdersTab projectId={projectId} accessToken={accessToken} />}
      {activeTab === "coupons" && <CouponsTab projectId={projectId} accessToken={accessToken} />}
    </div>
  );
}

// ── Products ──────────────────────────────────────────────────────

function ProductsTab({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [price, setPrice] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openCategoryPickerFor, setOpenCategoryPickerFor] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/products`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setProducts(data.products ?? []);
  }, [projectId, accessToken]);

  // Категорії завантажуються тут же (не тільки в CategoriesTab) — потрібні
  // для пікера категорій на кожній картці товару, без переходу на інший таб.
  const loadCategories = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/categories`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setCategories(data.categories ?? []);
  }, [projectId, accessToken]);

  useEffect(() => {
    (async () => {
      await Promise.all([load(), loadCategories()]);
    })();
  }, [load, loadCategories]);

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
            const pickerOpen = openCategoryPickerFor === product.id;
            return (
              <div key={product.id} className="glow-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{product.title}</p>
                    <p className="text-xs text-[var(--text-tertiary)]">{formatMoney(product.price_cents, product.currency)}</p>
                  </div>
                  <button
                    onClick={() => setOpenCategoryPickerFor(pickerOpen ? null : product.id)}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    title="Категорії товару"
                  >
                    <FolderTree size={14} style={{ color: pickerOpen ? "var(--lime)" : "var(--text-tertiary)" }} />
                  </button>
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
                {pickerOpen && (
                  <ProductCategoryPicker
                    projectId={projectId}
                    accessToken={accessToken}
                    productId={product.id}
                    categories={categories}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Product category picker (усередині картки товару) ───────────────
// Окремий компонент — власний стан завантажених category_ids товару,
// щоб не тримати цей стан у батьківському ProductsTab для КОЖНОГО
// товару одразу (завантажується лише коли пікер реально відкрито).

function buildCategoryTree(categories: Category[]): Array<Category & { depth: number }> {
  const byParent = new Map<string | null, Category[]>();
  for (const cat of categories) {
    const key = cat.parent_id;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(cat);
  }
  const result: Array<Category & { depth: number }> = [];
  function walk(parentId: string | null, depth: number) {
    const children = byParent.get(parentId) ?? [];
    for (const child of children) {
      result.push({ ...child, depth });
      walk(child.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

function ProductCategoryPicker({
  projectId,
  accessToken,
  productId,
  categories,
}: {
  projectId: string;
  accessToken: string;
  productId: string;
  categories: Category[];
}) {
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/products/${productId}/categories`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setSelected(new Set<string>(data.category_ids ?? []));
    })();
  }, [projectId, accessToken, productId]);

  async function toggle(categoryId: string) {
    if (!selected) return;
    const next = new Set(selected);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    setSelected(next);
    setSaving(true);
    try {
      await fetch(`${API_BASE_URL}/api/projects/${projectId}/products/${productId}/categories`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ category_ids: Array.from(next) }),
      });
    } finally {
      setSaving(false);
    }
  }

  const tree = buildCategoryTree(categories);

  return (
    <div
      className="rounded-xl p-3 space-y-1.5"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-[var(--text-tertiary)]">Категорії товару</span>
        {saving && <Loader2 size={12} className="animate-spin text-[var(--text-tertiary)]" />}
      </div>
      {categories.length === 0 && (
        <p className="text-xs text-[var(--text-tertiary)] py-1">
          Ще немає категорій — створіть їх у табі «Категорії».
        </p>
      )}
      {selected === null && categories.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-1">
          <Loader2 size={12} className="animate-spin" /> Завантаження...
        </div>
      )}
      {selected !== null &&
        tree.map(cat => (
          <label
            key={cat.id}
            className="flex items-center gap-2 py-1 cursor-pointer text-sm"
            style={{ paddingLeft: `${cat.depth * 16}px` }}
          >
            <input
              type="checkbox"
              checked={selected.has(cat.id)}
              onChange={() => toggle(cat.id)}
              className="accent-[var(--lime)]"
            />
            <span className="truncate">{cat.name}</span>
          </label>
        ))}
    </div>
  );
}

// ── Categories ────────────────────────────────────────────────────
// Дерево категорій (parent_id, 0061_commerce_module.sql). Плоский
// список categories з бекенду рендериться як дерево через
// buildCategoryTree (визначено вище, розділяється з ProductCategoryPicker).

function CategoriesTab({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/categories`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setCategories(data.categories ?? []);
  }, [projectId, accessToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function createCategory(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError("Вкажіть назву категорії"); return; }
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/categories`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), parent_id: parentId || null }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setName("");
      setParentId("");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setEditingName(cat.name);
  }

  async function saveEdit(cat: Category) {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === cat.name) { setEditingId(null); return; }
    await fetch(`${API_BASE_URL}/api/projects/${projectId}/categories/${cat.id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmed }),
    });
    setEditingId(null);
    await load();
  }

  async function deleteCategory(id: string) {
    await fetch(`${API_BASE_URL}/api/projects/${projectId}/categories/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Дочірні категорії стають кореневими (parent_id → null, on delete set
    // null у схемі) — сервер вже це зробив, просто перезавантажуємо список.
    await load();
  }

  const tree = categories ? buildCategoryTree(categories) : [];

  return (
    <div className="space-y-4">
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
          <Plus size={14} /> Додати категорію
        </button>
      ) : (
        <form onSubmit={createCategory} className="glow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Нова категорія</span>
            <button type="button" onClick={() => setShowCreate(false)}><X size={16} className="text-[var(--text-tertiary)]" /></button>
          </div>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Назва категорії" maxLength={100}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <select
            value={parentId} onChange={e => setParentId(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            <option value="">Без батьківської категорії (корінь)</option>
            {tree.map(cat => (
              <option key={cat.id} value={cat.id}>
                {"— ".repeat(cat.depth)}{cat.name}
              </option>
            ))}
          </select>
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

      {!categories && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {categories?.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Ще немає категорій.</p>
      )}

      {categories && categories.length > 0 && (
        <div className="space-y-2">
          {tree.map(cat => (
            <div
              key={cat.id}
              className="glow-card p-4 flex items-center gap-3"
              style={{ marginLeft: `${cat.depth * 20}px` }}
            >
              <FolderTree size={14} className="text-[var(--text-tertiary)] shrink-0" />
              {editingId === cat.id ? (
                <input
                  autoFocus
                  type="text"
                  value={editingName}
                  onChange={e => setEditingName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveEdit(cat); if (e.key === "Escape") setEditingId(null); }}
                  maxLength={100}
                  className="flex-1 min-w-0 rounded-lg px-2 py-1 text-sm outline-none"
                  style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)" }}
                />
              ) : (
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{cat.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] font-mono truncate">{cat.slug}</p>
                </div>
              )}
              {editingId === cat.id ? (
                <button onClick={() => saveEdit(cat)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <Check size={14} style={{ color: "var(--lime)" }} />
                </button>
              ) : (
                <button onClick={() => startEdit(cat)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <Pencil size={14} className="text-[var(--text-tertiary)]" />
                </button>
              )}
              <button onClick={() => deleteCategory(cat.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                <Trash2 size={14} className="text-[var(--text-tertiary)]" />
              </button>
            </div>
          ))}
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

// ── Coupons ───────────────────────────────────────────────────────

function formatDiscount(coupon: Coupon): string {
  // coupons не має власної currency в схемі (0061_commerce_module.sql) —
  // fixed знижка показується без символу валюти, щоб не вигадувати
  // невірний USD для магазину, що працює в іншій валюті.
  return coupon.discount_type === "percent" ? `${coupon.discount_value}%` : (coupon.discount_value / 100).toFixed(2);
}

function formatExpiry(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  return new Date(expiresAt).toLocaleDateString("uk-UA", { day: "2-digit", month: "short", year: "numeric" });
}

function CouponsTab({ projectId, accessToken }: { projectId: string; accessToken: string }) {
  const [coupons, setCoupons] = useState<Coupon[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/coupons`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setCoupons(data.coupons ?? []);
  }, [projectId, accessToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    const value = parseFloat(discountValue);
    if (!code.trim()) { setError("Вкажіть код купона"); return; }
    if (isNaN(value) || value <= 0) { setError("Вкажіть коректний розмір знижки"); return; }
    if (discountType === "percent" && value > 100) { setError("Знижка у відсотках не може перевищувати 100"); return; }

    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/coupons`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          code: code.trim(),
          discount_type: discountType,
          // fixed зберігається в центах (той самий формат, що price_cents товарів)
          discount_value: discountType === "fixed" ? Math.round(value * 100) : Math.round(value),
          max_uses: maxUses.trim() ? parseInt(maxUses, 10) : null,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setCode(""); setDiscountValue(""); setMaxUses(""); setExpiresAt(""); setDiscountType("percent");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function deleteCoupon(id: string) {
    await fetch(`${API_BASE_URL}/api/projects/${projectId}/coupons/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setCoupons(prev => prev?.filter(c => c.id !== id) ?? null);
  }

  return (
    <div className="space-y-4">
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
          <Plus size={14} /> Додати купон
        </button>
      ) : (
        <form onSubmit={createCoupon} className="glow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Новий купон</span>
            <button type="button" onClick={() => setShowCreate(false)}><X size={16} className="text-[var(--text-tertiary)]" /></button>
          </div>
          <input
            type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
            placeholder="Код (напр. SUMMER20)" maxLength={50}
            className="w-full rounded-xl px-3 py-2 text-sm font-mono outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <div className="flex gap-2">
            <select
              value={discountType} onChange={e => setDiscountType(e.target.value as "percent" | "fixed")}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value="percent">Відсоток</option>
              <option value="fixed">Фіксована сума</option>
            </select>
            <input
              type="number" value={discountValue} onChange={e => setDiscountValue(e.target.value)}
              placeholder={discountType === "percent" ? "напр. 20" : "напр. 5.00"}
              step={discountType === "percent" ? "1" : "0.01"} min="0" max={discountType === "percent" ? "100" : undefined}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div className="flex gap-2">
            <input
              type="number" value={maxUses} onChange={e => setMaxUses(e.target.value)}
              placeholder="Ліміт використань (необов'язково)" min="1"
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <input
              type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              className="rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", colorScheme: "dark" }}
            />
          </div>
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

      {!coupons && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {coupons?.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Ще немає купонів.</p>
      )}

      {coupons && coupons.length > 0 && (
        <div className="space-y-2">
          {coupons.map(coupon => {
            const expired = coupon.expires_at ? new Date(coupon.expires_at) < new Date() : false;
            const exhausted = coupon.max_uses !== null && coupon.used_count >= coupon.max_uses;
            const inactive = expired || exhausted;
            const expiryLabel = formatExpiry(coupon.expires_at);
            return (
              <div key={coupon.id} className="glow-card p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono font-medium truncate">{coupon.code}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    −{formatDiscount(coupon)}
                    {" · "}
                    {coupon.used_count}{coupon.max_uses !== null ? ` / ${coupon.max_uses}` : ""} використань
                    {expiryLabel ? ` · до ${expiryLabel}` : ""}
                  </p>
                </div>
                {inactive && (
                  <span
                    className="text-xs font-mono px-2.5 py-1 rounded-full shrink-0"
                    style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}
                  >
                    {expired ? "Прострочено" : "Вичерпано"}
                  </span>
                )}
                <button onClick={() => deleteCoupon(coupon.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
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
