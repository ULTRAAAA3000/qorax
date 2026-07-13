// ============================================================
// SitePreviewRenderer — рендерить content.blocks сторінки проекту в
// звичайний HTML. Це ПУБЛІЧНА сторінка ЧУЖОГО (клієнтського) сайту,
// не частина Qorax-дашборду — тому НЕ використовує внутрішні
// CSS-змінні Qorax (var(--lime) тощо) чи фірмовий стиль Qorax.
// Нейтральна, чиста верстка — контент належить клієнту, не Qorax.
//
// Підтримувані типи блоків (той самий формат, що project_templates
// seed, 0059_sites_builder_templates.sql): hero, text, image, cta, faq,
// products (Commerce-вітрина, додано окремо — не в seed-шаблонах,
// підключається вручну в редакторі). Невідомий/зламаний тип блоку —
// пропускається мовчки (safe rendering на публічній сторінці важливіший
// за показ помилки відвідувачу).
// ============================================================

import { ProductShowcase, type PublicProduct } from "./ProductShowcase";

interface Block {
  type?: string;
  heading?: string;
  subheading?: string;
  body?: string;
  cta_text?: string;
  cta_href?: string;
  image_url?: string;
  alt?: string;
  items?: Array<{ question: string; answer: string }>;
}

interface PageData {
  slug: string;
  content: { blocks?: Block[] };
  seo_title: string | null;
  seo_description: string | null;
}

export function SitePreviewRenderer({ page, projectName, projectId, products }: { page: PageData; projectName: string; projectId: string; products: PublicProduct[] }) {
  const blocks = page.content?.blocks ?? [];

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", color: "#1a1a1a", background: "#fff", minHeight: "100vh" }}>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
        {blocks.map((block, i) => (
          <BlockRenderer key={i} block={block} projectId={projectId} products={products} />
        ))}

        {blocks.length === 0 && (
          <div style={{ padding: "80px 0", textAlign: "center", color: "#888" }}>
            <p>Ця сторінка ще порожня.</p>
          </div>
        )}
      </main>

      <footer style={{ textAlign: "center", padding: "32px 24px", color: "#999", fontSize: 13 }}>
        {projectName} · Створено на{" "}
        <a href="https://qorax.app" style={{ color: "#999" }}>
          Qorax
        </a>
      </footer>
    </div>
  );
}

function BlockRenderer({ block, projectId, products }: { block: Block; projectId: string; products: PublicProduct[] }) {
  switch (block.type) {
    case "hero":
      return (
        <section style={{ padding: "64px 0 40px", textAlign: "center" }}>
          {block.heading && <h1 style={{ fontSize: 36, fontWeight: 700, margin: "0 0 12px" }}>{block.heading}</h1>}
          {block.subheading && <p style={{ fontSize: 18, color: "#555", margin: "0 0 24px" }}>{block.subheading}</p>}
          {block.cta_text && (
            <a
              href={block.cta_href || "#"}
              style={{ display: "inline-block", padding: "12px 28px", background: "#1a1a1a", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 500 }}
            >
              {block.cta_text}
            </a>
          )}
        </section>
      );

    case "text":
      return (
        <section style={{ padding: "32px 0" }}>
          {block.heading && <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 12px" }}>{block.heading}</h2>}
          {block.body && <p style={{ fontSize: 16, lineHeight: 1.7, color: "#333", whiteSpace: "pre-wrap" }}>{block.body}</p>}
        </section>
      );

    case "image":
      return block.image_url ? (
        <section style={{ padding: "24px 0" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.image_url} alt={block.alt || ""} style={{ width: "100%", borderRadius: 12, display: "block" }} />
        </section>
      ) : null;

    case "cta":
      return (
        <section style={{ padding: "48px 0", textAlign: "center", borderTop: "1px solid #eee", marginTop: 24 }}>
          {block.heading && <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 16px" }}>{block.heading}</h2>}
          {block.cta_text && (
            <a
              href={block.cta_href || "#"}
              style={{ display: "inline-block", padding: "12px 28px", background: "#1a1a1a", color: "#fff", borderRadius: 8, textDecoration: "none", fontWeight: 500 }}
            >
              {block.cta_text}
            </a>
          )}
        </section>
      );

    case "faq":
      return (
        <section style={{ padding: "32px 0" }}>
          {block.heading && <h2 style={{ fontSize: 24, fontWeight: 600, margin: "0 0 16px" }}>{block.heading}</h2>}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {(block.items ?? []).map((item, i) => (
              <div key={i}>
                <p style={{ fontWeight: 600, margin: "0 0 4px" }}>{item.question}</p>
                <p style={{ color: "#555", margin: 0, lineHeight: 1.6 }}>{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      );

    case "products":
      return <ProductShowcase projectId={projectId} heading={block.heading} products={products} />;

    default:
      return null;
  }
}
