"use client";

import { useState } from "react";
import { Brain, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Props {
  organizationId: string;
  getFreshToken: () => Promise<string>;
}

// AiMemoryPanel — MODULE_ROADMAP.md, "Qorax Browser" AI Memory
// (дванадцята ітерація: "браузер пам'ятає, що вже вивчено, які
// сайти проаналізовано, які ідеї збережено"). На відміну від Deep
// Search (пошук у зовнішньому інтернеті) — це запит проти ВЖЕ
// НАКОПИЧЕНОЇ власної історії організації (browser_history +
// browser_collections), AI відповідає суворо на основі того, що
// реально було переглянуто/збережено, не вигадує.
export function AiMemoryPanel({ organizationId, getFreshToken }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [usedEntries, setUsedEntries] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runQuery(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setAnswer(null);
    setUsedEntries(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/ai-memory`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося виконати запит");
        return;
      }
      setAnswer(data.answer ?? "");
      setUsedEntries(typeof data.used_entries === "number" ? data.used_entries : null);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3.5">
      <form onSubmit={runQuery} className="space-y-2">
        <textarea
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Наприклад: що я вже дізнався про конкурентів у fashion-ніші?"
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
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Brain size={13} />}
          {loading ? "Згадую..." : "Запитати пам'ять"}
        </button>
      </form>

      {!answer && !loading && !error && (
        <p className="text-xs text-[var(--text-tertiary)]">
          AI відповідає лише на основі вже переглянутих сайтів і збережених колекцій — не шукає нового в інтернеті (для цього є Deep Search).
        </p>
      )}

      {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

      {answer && (
        <div className="space-y-2">
          <div
            className="rounded-xl p-3.5 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap"
            style={{ background: "rgba(198,255,84,0.05)", border: "1px solid rgba(198,255,84,0.15)" }}
          >
            {answer}
          </div>
          {usedEntries !== null && usedEntries > 0 && (
            <p className="text-[11px] text-[var(--text-tertiary)]">На основі {usedEntries} записів історії.</p>
          )}
        </div>
      )}
    </div>
  );
}
