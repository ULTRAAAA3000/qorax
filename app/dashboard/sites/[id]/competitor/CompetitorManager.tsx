"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Globe, Trash2, Lock, Plus, RefreshCw } from "lucide-react";

interface Competitor {
  id: string;
  url: string;
  display_name: string | null;
  last_checked_at: string | null;
}

interface Props {
  siteId: string;
  competitors: Competitor[];
  isGrowthPlus: boolean;
  planCode: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

export function CompetitorManager({ siteId, competitors: initial, isGrowthPlus, planCode }: Props) {
  const [competitors, setCompetitors] = useState<Competitor[]>(initial);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState<string | null>(null);

  // Growth: максимум 1 конкурент. Agency/Admin: безлімітно
  const maxCompetitors = planCode === "growth" ? 1 : planCode === "agency" || planCode === "admin" ? 999 : 0;
  const canAdd = isGrowthPlus && competitors.length < maxCompetitors;

  async function handleAdd() {
    if (!url.trim()) return;
    setAdding(true);
    setError(null);

    let normalizedUrl = url.trim();
    if (!normalizedUrl.startsWith("http")) normalizedUrl = "https://" + normalizedUrl;

    try {
      new URL(normalizedUrl);
    } catch {
      setError("Невалідний URL");
      setAdding(false);
      return;
    }

    const supabase = createClient();
    const { data, error: insertError } = await supabase
      .from("competitor_sites")
      .insert({
        site_id: siteId,
        url: normalizedUrl,
        display_name: name.trim() || new URL(normalizedUrl).hostname,
      })
      .select("id, url, display_name, last_checked_at")
      .single();

    if (insertError) {
      setError("Помилка: " + insertError.message);
    } else if (data) {
      setCompetitors(prev => [data, ...prev]);
      setUrl("");
      setName("");
    }
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ competitor_id: competitorId, url: competitorUrl }),
      });

      // Оновлюємо last_checked_at локально
      setCompetitors(prev =>
        prev.map(c =>
          c.id === competitorId ? { ...c, last_checked_at: new Date().toISOString() } : c
        )
      );
    } catch {
      // ignore
    }
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
          Моніторинг конкурентів доступний з тарифу Growth ($99/міс). Qorax відстежує зміни на сайті конкурента і сповіщає вас.
        </p>
        <a
          href="/dashboard/billing"
          className="inline-flex text-sm font-medium px-5 py-2.5 rounded-xl"
          style={{ background: "var(--lime)", color: "#0C111D" }}
        >
          Переглянути тарифи
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Add form */}
      {canAdd ? (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Plus size={14} className="text-[var(--text-tertiary)]" />
            Додати конкурента
          </h2>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">URL сайту конкурента</label>
              <input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://competitor.com"
                className="w-full text-sm font-mono px-3 py-2.5 rounded-xl outline-none transition-colors"
                style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
                onFocus={e => e.target.style.borderColor = "var(--lime)"}
                onBlur={e => e.target.style.borderColor = "var(--border-hairline)"}
                onKeyDown={e => e.key === "Enter" && handleAdd()}
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Назва (необов'язково)</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Конкурент 1"
                className="w-full text-sm px-3 py-2.5 rounded-xl outline-none transition-colors"
                style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
                onFocus={e => e.target.style.borderColor = "var(--lime)"}
                onBlur={e => e.target.style.borderColor = "var(--border-hairline)"}
              />
            </div>
            {error && <p className="text-sm" style={{ color: "#F5675A" }}>{error}</p>}
            <button
              onClick={handleAdd}
              disabled={adding || !url.trim()}
              className="text-sm font-medium px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
              style={{ background: "var(--lime)", color: "#0C111D" }}
            >
              {adding ? "Додавання..." : "Додати"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] px-5 py-3 flex items-center gap-2">
          <Lock size={13} className="text-[var(--text-tertiary)]" />
          <p className="text-sm text-[var(--text-secondary)]">
            {planCode === "growth"
              ? "Growth план: 1 конкурент на організацію. Оновіть до Agency для більшої кількості."
              : "Досягнуто ліміт конкурентів."}
          </p>
        </div>
      )}

      {/* Competitors list */}
      {competitors.length > 0 ? (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
          <h2 className="text-sm font-medium mb-4 flex items-center gap-2">
            <Globe size={14} className="text-[var(--text-tertiary)]" />
            Відстежувані конкуренти ({competitors.length})
          </h2>
          <div className="space-y-2">
            {competitors.map(c => (
              <div key={c.id}
                className="flex items-center justify-between py-3 border-b hairline last:border-0 gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{c.display_name ?? new URL(c.url).hostname}</p>
                  <p className="text-xs font-mono text-[var(--text-tertiary)] mt-0.5 truncate">{c.url}</p>
                  {c.last_checked_at && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                      Перевірено: {new Date(c.last_checked_at).toLocaleDateString("uk-UA", {
                        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                      })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleCheck(c.id, c.url)}
                    disabled={checking === c.id}
                    title="Перевірити зараз"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
                    style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
                  >
                    <RefreshCw size={13} className={checking === c.id ? "animate-spin" : ""} style={{ color: "var(--cyan)" }} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id)}
                    title="Видалити"
                    className="p-2 rounded-lg transition-opacity hover:opacity-70"
                    style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
                  >
                    <Trash2 size={13} style={{ color: "#F5675A" }} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">
            Конкурентів ще не додано. Qorax відстежуватиме зміни на їхньому сайті і сповістить вас.
          </p>
        </div>
      )}

      {/* How it works */}
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <h3 className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">Як це працює</h3>
        <div className="space-y-2">
          {[
            "Qorax знімає знімок контенту сайту конкурента щодня",
            "При зміні вмісту сторінки — відправляємо сповіщення",
            "Ви бачите що змінилось: нові сторінки, акції, ціни",
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
