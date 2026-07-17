"use client";

import { useState } from "react";
import { ImageIcon, Loader2, X } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Props {
  organizationId: string;
  getFreshToken: () => Promise<string>;
  onClose: () => void;
}

interface VisualSearchResult {
  palette: string[];
  style: string | null;
  elements: string | null;
}

// VisualSearchModal — MODULE_ROADMAP.md, "Qorax Browser" Visual
// Search. Обсяг звужено (узгоджено з Артемом): roadmap описує
// "пошук джерела, схожих зображень, автоматичний SVG, усе одразу в
// Creator" — недоступно без зовнішнього reverse-image-search API і
// без API прийому візуального контенту в Creator (той самий блокер,
// що Smart Capture). Реалізовано чесно можливе: опис кольорової
// палітри й стилю через Gemini Vision. Правий клік на <img>
// усередині iframe недоступний (cross-origin, той самий блокер, що
// решта функцій Browser) — користувач вставляє URL зображення
// вручну, не виділяє його на сторінці.
export function VisualSearchModal({ organizationId, getFreshToken, onClose }: Props) {
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VisualSearchResult | null>(null);

  async function runSearch() {
    if (!imageUrl.trim()) {
      setError("Вкажіть URL зображення");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/visual-search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, image_url: imageUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося проаналізувати зображення");
        return;
      }
      setResult(data);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl p-5"
        style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <ImageIcon size={14} style={{ color: "#F4A6A0" }} /> Visual Search
          </h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={15} />
          </button>
        </div>

        {!result && (
          <div className="space-y-3">
            <input
              type="text"
              value={imageUrl}
              onChange={e => setImageUrl(e.target.value)}
              placeholder="URL зображення, наприклад https://example.com/photo.jpg"
              autoFocus
              className="w-full text-xs px-3 py-2.5 rounded-lg outline-none placeholder:text-[var(--text-tertiary)]"
              style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)" }}
            />
            {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}
            <button
              onClick={runSearch}
              disabled={loading}
              className="w-full glow-button text-xs !py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <ImageIcon size={13} />}
              {loading ? "Аналізую..." : "Проаналізувати"}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {result.palette.length > 0 && (
              <div>
                <p className="text-xs text-[var(--text-tertiary)] mb-2">Палітра</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.palette.map(color => (
                    <div key={color} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono" style={{ background: "rgba(255,255,255,0.04)" }}>
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, border: "1px solid rgba(255,255,255,0.15)" }} />
                      {color}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {result.elements && (
              <div>
                <p className="text-xs text-[var(--text-tertiary)] mb-1">Що зображено</p>
                <p className="text-sm text-[var(--text-secondary)]">{result.elements}</p>
              </div>
            )}
            {result.style && (
              <div>
                <p className="text-xs text-[var(--text-tertiary)] mb-1">Стиль</p>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{result.style}</p>
              </div>
            )}
            <button onClick={() => setResult(null)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              ← Інше зображення
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
