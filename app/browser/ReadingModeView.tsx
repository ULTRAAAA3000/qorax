"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Sparkles, BookOpen } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface ReadingBlock {
  type: "heading" | "paragraph" | "list_item";
  text: string;
}

interface ReadingModeData {
  title: string | null;
  blocks: ReadingBlock[];
  keyFacts: string[] | null;
  notes: string | null;
}

interface Props {
  organizationId: string;
  url: string;
  getFreshToken: () => Promise<string>;
  onClose: () => void;
}

// ReadingModeView — MODULE_ROADMAP.md, "Qorax Browser" Reading Mode.
// НА ВІДМІНУ від Summarize (One Click Actions, модалка поверх
// звичайного перегляду) — це ОКРЕМИЙ РЕЖИМ, що ПОВНІСТЮ ЗАМІНЮЄ
// вигляд viewport на очищений читабельний layout (roadmap: "не
// просто чистий текст"). Чистий текст вантажиться одразу (без AI,
// безкоштовно); "Ключові факти" — окрема AI-дія всередині цього ж
// режиму (with_ai=true), не автоматична — не витрачати кредити,
// доки користувач явно не попросив.
export function ReadingModeView({ organizationId, url, getFreshToken, onClose }: Props) {
  const [data, setData] = useState<ReadingModeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const load = useCallback(async (withAi: boolean) => {
    if (withAi) setAiLoading(true);
    else setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/reading-mode`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, url, with_ai: withAi }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Не вдалося завантажити чистий текст сторінки");
        return;
      }
      setData(json);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
      setAiLoading(false);
    }
  }, [organizationId, url, getFreshToken]);

  useEffect(() => {
    (async () => {
      await load(false);
    })();
  }, [load]);

  return (
    <div className="absolute inset-0 z-10 flex flex-col" style={{ background: "var(--bg)" }}>
      <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <BookOpen size={13} style={{ color: "var(--lime)" }} /> Reading Mode
        </div>
        <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
          <X size={16} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)]">
              <Loader2 size={14} className="animate-spin" /> Очищую сторінку...
            </div>
          )}

          {error && <p className="text-sm" style={{ color: "#F5675A" }}>{error}</p>}

          {data && !loading && (
            <div className="space-y-5">
              {data.title && <h1 className="font-display text-2xl font-semibold">{data.title}</h1>}

              {!data.keyFacts && (
                <button
                  onClick={() => load(true)}
                  disabled={aiLoading}
                  className="glow-button text-xs !py-2 !px-3 flex items-center gap-1.5 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                  {aiLoading ? "Аналізую..." : "Витягти ключові факти"}
                </button>
              )}

              {data.keyFacts && data.keyFacts.length > 0 && (
                <div className="rounded-xl p-4 space-y-2" style={{ background: "rgba(198,255,84,0.05)", border: "1px solid rgba(198,255,84,0.15)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--lime)" }}>Ключові факти</p>
                  <ul className="space-y-1.5">
                    {data.keyFacts.map((fact, i) => (
                      <li key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed">• {fact}</li>
                    ))}
                  </ul>
                  {data.notes && <p className="text-xs text-[var(--text-tertiary)] pt-2 mt-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>{data.notes}</p>}
                </div>
              )}

              <div className="space-y-4 pt-2">
                {data.blocks.length === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)]">Не вдалося витягти текстовий контент цієї сторінки.</p>
                )}
                {data.blocks.map((block, i) => {
                  if (block.type === "heading") {
                    return <h2 key={i} className="font-display text-lg font-medium pt-2">{block.text}</h2>;
                  }
                  if (block.type === "list_item") {
                    return <p key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed pl-4">— {block.text}</p>;
                  }
                  return <p key={i} className="text-sm text-[var(--text-secondary)] leading-relaxed">{block.text}</p>;
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
