"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface TrackedQuery {
  id: string;
  query: string;
  target_url: string | null;
  created_at: string;
  latest: { date: string; average_position: number | null; clicks: number; impressions: number } | null;
}

interface HistoryPoint {
  date: string;
  average_position: number | null;
  clicks: number;
  impressions: number;
}

interface Props {
  siteId: string;
  accessToken: string;
}

function fmtPos(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return n.toFixed(1);
}

/** Компактний SVG line-chart позиції по датах. Нижче позиція = вище на графіку (інвертована вісь Y). */
function PositionChart({ history }: { history: HistoryPoint[] }) {
  const points = history.filter(h => h.average_position !== null);
  if (points.length < 2) {
    return (
      <div className="rounded-xl px-4 py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="text-xs text-[var(--text-tertiary)]">Недостатньо даних для графіка — з&apos;являться протягом кількох днів</p>
      </div>
    );
  }

  const width = 600;
  const height = 140;
  const padding = 24;
  const positions = points.map(p => p.average_position as number);
  const minPos = Math.min(...positions, 1);
  const maxPos = Math.max(...positions, minPos + 1);

  const x = (i: number) => padding + (i / (points.length - 1)) * (width - padding * 2);
  // інвертовано: позиція 1 (найкраща) — вгорі графіка
  const y = (pos: number) => padding + ((pos - minPos) / (maxPos - minPos)) * (height - padding * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.average_position as number)}`).join(" ");

  const first = positions[0];
  const last = positions[positions.length - 1];
  const trend = last - first; // від'ємне = позиція покращилась (менше число)

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 160 }}>
        <path d={path} fill="none" stroke="var(--cyan)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.average_position as number)} r={2.5} fill="var(--cyan)" opacity={i === points.length - 1 ? 1 : 0.4} />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-[var(--text-tertiary)]">{points[0].date}</span>
        <span className="flex items-center gap-1 font-medium" style={{ color: trend < 0 ? "var(--lime)" : trend > 0 ? "#F5675A" : "var(--text-tertiary)" }}>
          {trend < 0 ? <TrendingUp size={12} /> : trend > 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
          {trend === 0 ? "без змін" : `${trend < 0 ? "покращення" : "погіршення"} на ${Math.abs(trend).toFixed(1)}`}
        </span>
        <span className="text-[var(--text-tertiary)]">{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

export function RankDetailUI({ siteId, accessToken }: Props) {
  const [queries, setQueries] = useState<TrackedQuery[] | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, HistoryPoint[]>>({});
  const [newQuery, setNewQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/rank/queries`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setQueries(data.queries ?? []);
    } catch {
      setQueries([]);
    }
  }, [siteId, accessToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function addQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!newQuery.trim()) return;
    setAdding(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/rank/queries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: newQuery.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewQuery("");
      await load();
    } finally {
      setAdding(false);
    }
  }

  async function removeQuery(id: string) {
    await fetch(`${API_BASE_URL}/api/sites/${siteId}/rank/queries/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    setQueries(prev => prev?.filter(q => q.id !== id) ?? null);
  }

  async function toggleExpand(query: TrackedQuery) {
    if (expanded === query.id) { setExpanded(null); return; }
    setExpanded(query.id);
    if (!history[query.query]) {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/rank/history?query=${encodeURIComponent(query.query)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setHistory(prev => ({ ...prev, [query.query]: data.history ?? [] }));
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={addQuery} className="flex gap-2">
        <input
          type="text"
          value={newQuery}
          onChange={e => setNewQuery(e.target.value)}
          placeholder="Додати пошуковий запит для відстеження..."
          maxLength={200}
          className="flex-1 rounded-xl px-4 py-2.5 text-sm outline-none"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
        />
        <button
          type="submit"
          disabled={adding || !newQuery.trim()}
          className="glow-button text-sm !py-2.5 !px-4 flex items-center gap-1.5 disabled:opacity-50"
        >
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Додати
        </button>
      </form>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
          {error}
        </div>
      )}

      {!queries && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {queries?.length === 0 && (
        <div className="glow-card p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Ще немає запитів для відстеження.</p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">Додайте запит вище — позиція з&apos;явиться протягом кількох днів.</p>
        </div>
      )}

      {queries && queries.length > 0 && (
        <div className="space-y-2">
          {queries.map(q => (
            <div key={q.id} className="glow-card overflow-hidden">
              <div className="p-4 flex items-center gap-3 cursor-pointer" onClick={() => toggleExpand(q)}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{q.query}</p>
                  {q.target_url && <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">{q.target_url}</p>}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-mono" style={{ color: "var(--cyan)" }}>
                    {q.latest ? `#${fmtPos(q.latest.average_position)}` : "—"}
                  </p>
                  <p className="text-[10px] text-[var(--text-tertiary)]">позиція</p>
                </div>
                <button
                  onClick={e => { e.stopPropagation(); removeQuery(q.id); }}
                  className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                  title="Прибрати"
                >
                  <X size={14} className="text-[var(--text-tertiary)]" />
                </button>
              </div>

              {expanded === q.id && (
                <div className="px-4 pb-4 pt-1" style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  {history[q.query] ? (
                    <PositionChart history={history[q.query]} />
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4 justify-center">
                      <Loader2 size={12} className="animate-spin" /> Завантаження історії...
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
