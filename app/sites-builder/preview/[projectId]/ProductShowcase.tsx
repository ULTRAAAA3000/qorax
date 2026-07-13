"use client";

import { useState } from "react";
import { API_BASE_URL } from "@/app/lib/config";

export interface PublicProduct {
  id: string;
  title: string;
  description: string | null;
  price_cents: number;
  currency: string;
  image_urls: string[] | null;
  stock_quantity: number | null;
}

function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("uk-UA", { style: "currency", currency }).format(cents / 100);
}

/**
 * Публічна вітрина товарів — вставляється в SitePreviewRenderer.tsx
 * (блок 'products'). Це ЄДИНИЙ клієнтський (interactive) кусок чужого
 * (клієнтського) сайту — решта SitePreviewRenderer лишається чистим
 * server component. Виокремлено в свій файл саме тому, щоб не
 * робити ввесь публічний рендер сторінки клієнтським заради однієї
 * кнопки "Купити".
 *
 * Один товар за раз (не кошик з кількома товарами) — свідоме MVP-
 * спрощення: commerceCheckout.ts вже підтримує масив items з
 * quantity, тому додати кошик пізніше — це розширення тут, не зміна
 * бекенду.
 */
export function ProductShowcase({ projectId, heading, products }: { projectId: string; heading?: string; products: PublicProduct[] }) {
  const [activeProduct, setActiveProduct] = useState<PublicProduct | null>(null);

  if (products.length === 0) return null;

  return (
    <section style={{ padding: "32px 0" }}>
      {heading && <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 20px" }}>{heading}</h2>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 20 }}>
        {products.map(product => (
          <div key={product.id} style={{ border: "1px solid #eee", borderRadius: 12, overflow: "hidden" }}>
            {product.image_urls?.[0] && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={product.image_urls[0]} alt={product.title} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", display: "block" }} />
            )}
            <div style={{ padding: 16 }}>
              <p style={{ fontWeight: 600, margin: "0 0 4px", fontSize: 15 }}>{product.title}</p>
              {product.description && (
                <p style={{ fontSize: 13, color: "#666", margin: "0 0 8px", lineHeight: 1.5 }}>{product.description}</p>
              )}
              <p style={{ fontWeight: 700, margin: "0 0 12px", fontSize: 16 }}>{formatPrice(product.price_cents, product.currency)}</p>
              {product.stock_quantity === 0 ? (
                <p style={{ fontSize: 13, color: "#999" }}>Немає в наявності</p>
              ) : (
                <button
                  onClick={() => setActiveProduct(product)}
                  style={{ width: "100%", padding: "10px 16px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 500, fontSize: 14, cursor: "pointer" }}
                >
                  Купити
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {activeProduct && (
        <CheckoutModal projectId={projectId} product={activeProduct} onClose={() => setActiveProduct(null)} />
      )}
    </section>
  );
}

function CheckoutModal({ projectId, product, onClose }: { projectId: string; product: PublicProduct; onClose: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) { setError("Вкажіть коректний email"); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/commerce/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: projectId,
          customer_email: email.trim(),
          customer_name: name.trim() || undefined,
          items: [{ product_id: product.id, quantity: 1 }],
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkout_url) {
        setError(data.error ?? "Не вдалося оформити замовлення");
        return;
      }
      window.location.href = data.checkout_url;
    } catch {
      setError("Мережева помилка — спробуйте ще раз");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 100 }}
    >
      <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 28, maxWidth: 400, width: "100%" }}>
        <p style={{ fontWeight: 600, fontSize: 16, margin: "0 0 4px" }}>{product.title}</p>
        <p style={{ fontWeight: 700, fontSize: 18, margin: "0 0 20px" }}>{formatPrice(product.price_cents, product.currency)}</p>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            type="email"
            required
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email для отримання замовлення"
            style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}
          />
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Ім'я (необов'язково)"
            style={{ padding: "10px 12px", border: "1px solid #ddd", borderRadius: 8, fontSize: 14 }}
          />
          {error && <p style={{ color: "#c0392b", fontSize: 13, margin: 0 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <button
              type="button"
              onClick={onClose}
              style={{ flex: 1, padding: "10px 16px", background: "#f2f2f2", color: "#333", border: "none", borderRadius: 8, fontSize: 14, cursor: "pointer" }}
            >
              Скасувати
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{ flex: 2, padding: "10px 16px", background: "#1a1a1a", color: "#fff", border: "none", borderRadius: 8, fontWeight: 500, fontSize: 14, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
            >
              {loading ? "Оформлюємо…" : "Перейти до оплати"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
