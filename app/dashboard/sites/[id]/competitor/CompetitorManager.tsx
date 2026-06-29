"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Globe, Trash2, Lock, Plus, RefreshCw, ChevronDown, ChevronUp, Clock } from "lucide-react";

interface Competitor {
  id: string;
  url: string;
  display_name: string | null;
  last_checked_at: string | null;
}

interface Change {
  id: string;
  detected_at: string;
  change_summary: string | null;
  old_snapshot: string | null;
  new_snapshot: string | null;
}

interface Props {
  siteId: string;
  competitors: Competitor[];
  isGrowthPlus: boolean;
  planCode: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

function SnapshotDiff({ oldText, newText }: { oldText: string; newText: string }) {
  const oldLines = oldText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const newLines = newText.split(/\n/).map(l => l.trim()).filter(Boolean);
  const newSet = new Set(newLines);
  const oldSet = new Set(oldLines);

  const removed = oldLines.filter(l => !newSet.has(l)).slice(0, 15);
  const added = newLines.filter(l => !oldSet.has(l)).slice(0, 15);

  if (removed.length === 0 && added.length === 0) {
    return <p className="text-xs text-[var(--text-tertiary)]">Структурні зміни без явних додавань/видалень</p>;
  }

  return (
    <div className="space-y-1 font-mono text-xs rounded-xl overflow-hidden" style={{ background: "var(--bg)" }}>
      {removed.map((line, i) => (
        <div key={`del-${i}`} className="flex items-start gap-2 px-3 py-0.5"
          style={{ background: "rgba(245,103,90,0.08)", borderLeft: "2px solid #F5675A" }}>
          <span style={{ color: "#F5675A", flexShrink: 0 }}>−</span>
          <span className="text-[var(--text-secondary)] break-all">{line.slice(0, 140)}</span>
        </div>
      ))}
      {added.map((line, i) => (
        <div key={`add-${i}`} className="flex items-start gap-2 px-3 py-0.5"
          style={{ background: "rgba(214,255,63,0.06)", borderLeft: "2px solid var(--lime)" }}>
          <span style={{ color: "var(--lime)", flexShrink: 0 }}>+</span>
          <span className="text-[var(--text-secondary)] break-all">{line.slice(0, 140)}</span>
        </div>
      ))}
    </div>
  );
}

function CompetitorChanges({ competitorId }: { competitorId: string }) {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    if (changes !== null) { setChanges(null); return; }
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch(`${API_URL}/api/competitors/${competitorId}/changes`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (r.ok) setChanges(await r.json());
    } finally { setLoading(false); }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="mt-2">
      <button onClick={load}
        className="flex items-center gap-1 text-xs transition-opacity hover:opacity-70"
        style={{ color: "var(--cyan)" }}>
        {loading ? <RefreshCw size={10} className="animate-spin" /> : changes !== null ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
        {changes !== null ? "Сховати зміни" : "Переглянути зміни"}
      </button>

      {changes !== null && (
        <div className="mt-3 space-y-3">
          {changes.length === 0 && (
            <p className="text-xs text-[var(--text-tertiary)]">Змін ще не зафіксовано</p>
          )}
          {changes.map(ch => (
            <div key={ch.id} className="rounded-xl border hairline overflow-hidden"
              style={{ background: "var(--bg)" }}>
              <div className="flex items-center justify-between px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <Clock size={11} className="text-[var(--text-tertiary)]" />
                  <span className="text-xs text-[var(--text-tertiary)]">{fmtDate(ch.detected_at)}</span>
                </div>
                {ch.old_snapshot && ch.new_snapshot && (
                  <button onClick={() => setExpanded(expanded === ch.id ? null : ch.id)}
                    className="text-xs flex items-center gap-1 transition-opacity hover:opacity-70"
                    style={{ color: "var(--text-tertiary)" }}>
                    {expanded === ch.id ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                    Деталі
                  </button>
                )}
              </div>
              {ch.change_summary && (
                <p className="px-3 pb-2.5 text-xs text-[var(--text-secondary)]">{ch.change_summary}</p>
              )}
              {expanded === ch.id && ch.old_snapshot && ch.new_snapshot && (
                <div className="px-3 pb-3">
                  <SnapshotDiff oldText={ch.old_snapshot} newText={ch.new_snapshot} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CompetitorManager({ siteId, competitors: initial, isGrowthPlus, planCode }: Props) {
  const [competitors, setCompetitors] = useState<Competitor[]>(initial);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  const maxCompetitors = planCode === "growth" ? 1 : planCode === "agency" || planCode === "admin" ? 999 : 0;
  const canAdd = isGrowthPlus && competitors.length < maxCompetitors;

  async function handleAdd() {
    if (!url.trim()) return;
    setAdding(true);
    setError(null);
    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) normalizedUrl = "https://" + normalizedUrl;
    try { new URL(normalizedUrl); } catch { setError("Невалідний URL"); setAdding(false); return; }
    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("competitor_sites")
      .insert({ site_id: siteId, url: normalizedUrl, display_name: name.trim() || new URL(normalizedUrl).hostname })
      .select("id, url, display_name, last_checked_at")
      .single();
    if (insertError) { setError("Помилка: " + insertError.message); }
    else if (data) { setCompetitors(prev => [data, ...prev]); setUrl(""); setName(""); }
    setAdding(false);
  }

  async function handleDelete(competitorId: string) {
    const supabase = createClient();
    await supabase.from("competitor_sites").delete().eq("id", competitorId);
    setCompetitors(prev => prev.filter(c => c.id !== competitorId));
  }

  async function handleCheck(competitorId: string, competitorUrl: string) {
    setChecking(competitorId);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await fetch(`${API_URL}/api/competitor/check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ competitor_id: competitorId, url: competitorUrl }),
      });
      setCompetitors(prev =>
        prev.map(c => c.id === competitorId ? { ...c, last_checked_at: new Date().toISOString() } : c)
      );
    } catch { /* ignore */ }
    setChecking(null);
  }

  if (!isGrowthPlus) {
    return (
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-10 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl mb-4"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid var(--border-hairline)" }}>
          <Lock size={20} className="text-[var(--text-tertiary)]" />
        </div>
        <h2 className="font-display text-lg font-semibold mb-2">Growth або вище</h2>
        <p className="text-sm text-[var(--text-secondary)] max-w-xs mx-auto mb-6">
          Моніторинг конкурентів доступний з тарифу Growth ($99/міс).
        </p>
        <a href="/dashboard/billing" className="inline-flex text-sm font-medium px-5 py-2.5 rounded-xl"
          style={{ background: "var(--lime)", color: "#0C111D" }}>
          Переглянути тарифи
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canAdd ? (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Plus size={14} className="text-[var(--text-tertiary)]" /> Додати конкурента
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">URL сайту конкурента</label>
              <input type="text" value={url} onChange={e => setUrl(e.target.value)}
                placeholder="https://competitor.com"
                className="w-full text-sm font-mono px-3 py-2.5 rounded-xl outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
                onKeyDown={e => e.key === "Enter" && handleAdd()} />
            </div>
            <div>
              <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Назва (необов'язково)</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Конкурент 1"
                className="w-full text-sm px-3 py-2.5 rounded-xl outline-none"
                style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
              />
            </div>
            {error && <p className="text-sm" style={{ color: "#F5675A" }}>{error}</p>}
            <button onClick={handleAdd} disabled={adding || !url.trim()}
              className="text-sm font-medium px-5 py-2.5 rounded-xl disabled:opacity-50"
              style={{ background: "var(--lime)", color: "#0C111D" }}>
              {adding ? "Додавання..." : "Додати"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] px-5 py-3 flex items-center gap-2">
          <Lock size={13} className="text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            {planCode === "growth" ? "Growth: 1 конкурент. Оновіть до Agency для більшої кількості." : "Досягнуто ліміт."}
          </p>
        </div>
      )}

      {competitors.length > 0 ? (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Globe size={14} className="text-[var(--text-tertiary)]" />
            Відстежувані конкуренти ({competitors.length})
          </h2>
          <div className="space-y-4">
            {competitors.map(c => (
              <div key={c.id} className="pb-4 border-b hairline last:border-0 last:pb-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{c.display_name ?? new URL(c.url).hostname}</p>
                    <p className="text-xs font-mono text-[var(--text-tertiary)] mt-0.5 truncate">{c.url}</p>
                    {c.last_checked_at && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        Перевірено: {new Date(c.last_checked_at).toLocaleDateString("uk-UA", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    )}
                    {/* Diff history */}
                    <CompetitorChanges competitorId={c.id} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => handleCheck(c.id, c.url)} disabled={checking === c.id}
                      title="Перевірити зараз"
                      className="p-2 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
                      style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                      <RefreshCw size={13} className={checking === c.id ? "animate-spin" : ""} style={{ color: "var(--cyan)" }} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} title="Видалити"
                      className="p-2 rounded-lg transition-opacity hover:opacity-70"
                      style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
                      <Trash2 size={13} style={{ color: "#F5675A" }} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">Конкурентів ще не додано.</p>
        </div>
      )}

      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <h3 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">Як це працює</h3>
        <div className="space-y-2">
          {[
            "Qorax знімає знімок контенту сайту конкурента щодня",
            "При зміні вмісту сторінки — відправляємо сповіщення",
            "Ви бачите що саме змінилось: нові слова, видалені блоки",
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
              <span className="font-mono text-xs mt-0.5" style={{ color: "var(--lime)" }}>{i + 1}.</span>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
