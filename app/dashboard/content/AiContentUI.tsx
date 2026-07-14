"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, Copy, Check, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

type Kind = "title" | "meta_description" | "faq" | "article_intro";

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: "title", label: "SEO Title" },
  { value: "meta_description", label: "Meta Description" },
  { value: "faq", label: "FAQ" },
  { value: "article_intro", label: "Вступ статті" },
];

interface Site { id: string; url: string; display_name: string | null }

interface Props {
  accessToken: string;
  sites: Site[];
}

export function AiContentUI({ accessToken, sites }: Props) {
  const [kind, setKind] = useState<Kind>("title");
  const [siteId, setSiteId] = useState<string>("");
  const [topic, setTopic] = useState("");
  const [keywords, setKeywords] = useState("");
  const [tone, setTone] = useState("");
  const [output, setOutput] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [credits, setCredits] = useState<number | null>(null);
  const [unlimited, setUnlimited] = useState(false);

  const loadCredits = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/credits`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const data = await res.json();
      setCredits(data.credits_remaining ?? 0);
      setUnlimited(Boolean(data.unlimited));
    } catch {
      setCredits(0);
    }
  }, [accessToken]);

  useEffect(() => {
    (async () => {
      await loadCredits();
    })();
  }, [loadCredits]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim()) return;
    setLoading(true);
    setError(null);
    setOutput(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/ai/generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ kind, site_id: siteId || undefined, topic: topic.trim(), keywords: keywords.trim() || undefined, tone: tone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка генерації"); return; }
      setOutput(data.output);
      setCredits(data.credits_remaining);
      setUnlimited(Boolean(data.unlimited));
    } catch {
      setError("Не вдалося з'єднатися з сервером");
    } finally {
      setLoading(false);
    }
  }

  function copyOutput() {
    if (!output) return;
    navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      {credits !== null && (
        <div
          className="flex items-center justify-between px-4 py-2.5 rounded-xl text-sm"
          style={{ background: "rgba(214,255,63,0.05)", border: "1px solid rgba(214,255,63,0.15)" }}
        >
          <span className="text-[var(--text-secondary)]">Кредити, що залишились</span>
          <span className="font-mono font-medium" style={{ color: "var(--lime)" }}>{unlimited ? "∞" : credits}</span>
        </div>
      )}

      <form onSubmit={generate} className="glow-card p-5 space-y-4">
        <div>
          <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Тип контенту</label>
          <div className="flex flex-wrap gap-2">
            {KIND_OPTIONS.map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setKind(opt.value)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                style={{
                  background: kind === opt.value ? "rgba(214,255,63,0.1)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${kind === opt.value ? "rgba(214,255,63,0.3)" : "rgba(255,255,255,0.08)"}`,
                  color: kind === opt.value ? "var(--lime)" : "var(--text-secondary)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {sites.length > 0 && (
          <div>
            <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Сайт (опційно)</label>
            <select
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <option value="">Без прив&apos;язки до сайту</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.display_name || s.url}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Тема / опис бізнесу</label>
          <textarea
            value={topic}
            onChange={e => setTopic(e.target.value)}
            placeholder="напр. Стоматологічна клініка у Львові, спеціалізація — імплантація"
            maxLength={500}
            rows={2}
            className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Ключові слова (опційно)</label>
            <input
              type="text"
              value={keywords}
              onChange={e => setKeywords(e.target.value)}
              placeholder="імплантація зубів, Львів"
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">Тон (опційно)</label>
            <input
              type="text"
              value={tone}
              onChange={e => setTone(e.target.value)}
              placeholder="дружній, професійний..."
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading || !topic.trim() || (credits !== null && credits <= 0)}
          className="w-full glow-button text-sm !py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
          {loading ? "Генерую..." : "Згенерувати"}
        </button>
      </form>

      {error && (
        <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
          {error}
        </div>
      )}

      {output && (
        <div className="glow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Результат</span>
            <button
              onClick={copyOutput}
              className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg hover:bg-white/5 transition-colors"
              style={{ color: copied ? "var(--lime)" : "var(--text-secondary)" }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? "Скопійовано" : "Копіювати"}
            </button>
          </div>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{output}</p>
        </div>
      )}
    </div>
  );
}
