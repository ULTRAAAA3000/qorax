"use client";

import { useState } from "react";
import { Search, Loader2, ExternalLink, SearchX } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Props {
  organizationId: string;
  getFreshToken: () => Promise<string>;
  onNavigate: (url: string) => void;
}

interface Source {
  title: string;
  uri: string;
}

// DeepSearchPanel — MODULE_ROADMAP.md, "Qorax Browser" Deep Search
// (одинадцята ітерація: "пошук по інтернету з AI, що сам підбирає
// приклади за складним природномовним запитом"). На відміну від
// Translate/Summarize (QuickActionsMenu) — це НЕ дія над конкретним
// відкритим сайтом, а самостійний глобальний пошук, тому окремий таб
// сайдбара поруч з AI/Inspector/Колекції, не пункт One Click Actions.
export function DeepSearchPanel({ organizationId, getFreshToken, onNavigate }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function runSearch(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setAnswer(null);
    setSources([]);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/deep-search`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося виконати пошук");
        return;
      }
      setAnswer(data.answer ?? "");
      setSources(data.sources ?? []);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3.5">
      <form onSubmit={runSearch} className="space-y-2">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Наприклад: приклади лендінгів для fitness-додатків"
          rows={3}
          maxLength={500}
          className="w-full text-xs rounded-lg p-2.5 outline-none resize-none placeholder:text-[var(--text-tertiary)]"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
        />
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="w-full glow-button text-xs !py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
          {loading ? "Шукаю..." : "Deep Search"}
        </button>
      </form>

      {!answer && !loading && !error && (
        <p className="text-xs text-[var(--text-tertiary)]">
          AI сам сформулює пошукові запити і синтезує відповідь із реальних результатів — не проста видача посилань.
        </p>
      )}

      {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

      {answer && (
        <div className="space-y-3">
          <div
            className="rounded-xl p-3.5 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap"
            style={{ background: "rgba(140,246,255,0.05)", border: "1px solid rgba(140,246,255,0.15)" }}
          >
            {answer}
          </div>

          {sources.length > 0 && (
            <div>
              <p className="text-xs text-[var(--text-tertiary)] mb-1.5">Джерела</p>
              <div className="space-y-1">
                {sources.map(source => (
                  <button
                    key={source.uri}
                    onClick={() => onNavigate(source.uri)}
                    className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs text-left hover:bg-white/5 transition-colors"
                    style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)" }}
                  >
                    <span className="truncate">{source.title}</span>
                    <ExternalLink size={11} className="flex-shrink-0 text-[var(--text-tertiary)]" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {sources.length === 0 && (
            <p className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1.5">
              <SearchX size={11} /> AI не повернув конкретні джерела для цієї відповіді.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
