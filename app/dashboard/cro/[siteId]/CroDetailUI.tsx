"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Code2, CheckCircle2, Circle, Copy, Check, Eye, MousePointerClick, ClipboardEdit, Send } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface DailyStat {
  page_url: string;
  date: string;
  visitors: number;
  cta_clicks: number;
  form_starts: number;
  form_submits: number;
  conversion_rate: number | null;
}

interface Props {
  siteId: string;
  siteLabel: string;
  accessToken: string;
}

function aggregateByPage(stats: DailyStat[]): Array<{ page_url: string; visitors: number; cta_clicks: number; form_starts: number; form_submits: number }> {
  const byPage = new Map<string, { page_url: string; visitors: number; cta_clicks: number; form_starts: number; form_submits: number }>();
  for (const s of stats) {
    const existing = byPage.get(s.page_url) ?? { page_url: s.page_url, visitors: 0, cta_clicks: 0, form_starts: 0, form_submits: 0 };
    existing.visitors += s.visitors;
    existing.cta_clicks += s.cta_clicks;
    existing.form_starts += s.form_starts;
    existing.form_submits += s.form_submits;
    byPage.set(s.page_url, existing);
  }
  return Array.from(byPage.values()).sort((a, b) => b.visitors - a.visitors);
}

export function CroDetailUI({ siteId, siteLabel, accessToken }: Props) {
  const [stats, setStats] = useState<DailyStat[] | null>(null);
  const [snippetInstalled, setSnippetInstalled] = useState(false);
  const [snippetActive, setSnippetActive] = useState(false);
  const [installSnippet, setInstallSnippet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [loadingSnippet, setLoadingSnippet] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/cro/stats`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); setStats([]); return; }
      setStats(data.stats ?? []);
      setSnippetInstalled(data.snippet_installed ?? false);
      setSnippetActive(data.snippet_active ?? false);
    } catch {
      setStats([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, accessToken]);

  useEffect(() => { loadStats(); }, [loadStats]);

  async function generateSnippet() {
    setLoadingSnippet(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/cro/snippet`, { headers: authHeaders });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setInstallSnippet(data.install_snippet);
      setSnippetInstalled(true);
      setSnippetActive(data.is_active);
    } finally {
      setLoadingSnippet(false);
    }
  }

  async function toggleActive() {
    setToggling(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/cro/snippet`, {
        method: "PATCH",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !snippetActive }),
      });
      if (res.ok) setSnippetActive(!snippetActive);
    } finally {
      setToggling(false);
    }
  }

  function copySnippet() {
    if (!installSnippet) return;
    navigator.clipboard.writeText(installSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error && stats === null) {
    return <div className="glow-card p-10 text-center"><p className="text-sm" style={{ color: "#ff8080" }}>{error}</p></div>;
  }

  if (stats === null) {
    return <div className="glow-card p-10 text-center"><Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} /></div>;
  }

  const totals = stats.reduce(
    (acc, s) => ({
      visitors: acc.visitors + s.visitors,
      cta_clicks: acc.cta_clicks + s.cta_clicks,
      form_starts: acc.form_starts + s.form_starts,
      form_submits: acc.form_submits + s.form_submits,
    }),
    { visitors: 0, cta_clicks: 0, form_starts: 0, form_submits: 0 }
  );
  const overallConversion = totals.visitors > 0 ? Math.round((totals.form_submits / totals.visitors) * 10000) / 100 : 0;

  const byPage = aggregateByPage(stats);

  const funnelSteps = [
    { label: "Перегляди", value: totals.visitors, icon: Eye },
    { label: "Клік CTA", value: totals.cta_clicks, icon: MousePointerClick },
    { label: "Почали форму", value: totals.form_starts, icon: ClipboardEdit },
    { label: "Відправили форму", value: totals.form_submits, icon: Send },
  ];
  const maxValue = Math.max(...funnelSteps.map(s => s.value), 1);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">{siteLabel}</h1>
        <p className="text-sm text-[var(--text-secondary)]">Воронка конверсії за останні 30 днів</p>
      </div>

      {error && <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>{error}</div>}

      {/* ── Встановлення сніпета ── */}
      <div className="glow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Code2 size={15} /> Клієнтський сніпет</h2>
          {snippetInstalled && (
            <button onClick={toggleActive} disabled={toggling} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ border: "1px solid rgba(255,255,255,0.1)", color: snippetActive ? "var(--lime)" : "var(--text-tertiary)" }}>
              {snippetActive ? <CheckCircle2 size={12} /> : <Circle size={12} />} {snippetActive ? "Активний" : "Вимкнено"}
            </button>
          )}
        </div>

        {!installSnippet ? (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
              {snippetInstalled ? "Сніпет вже згенеровано для цього сайту." : "Згенеруйте код для вставки на сторінки сайту, щоб почати збирати дані."}
            </p>
            <button onClick={generateSnippet} disabled={loadingSnippet} className="glow-button text-sm !py-2 !px-4">
              {loadingSnippet ? <Loader2 size={14} className="animate-spin" /> : snippetInstalled ? "Показати код" : "Згенерувати код"}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
              Вставте цей код перед тегом <span className="font-mono">&lt;/body&gt;</span> на кожній сторінці, де хочете відстежувати конверсії. Додайте атрибут <span className="font-mono">data-cro-cta</span> на кнопки CTA і <span className="font-mono">data-cro-form</span> на форми для точнішого відстеження.
            </p>
            <div className="relative">
              <pre className="text-xs font-mono p-3 rounded-lg overflow-x-auto" style={{ background: "rgba(0,0,0,0.4)", border: "1px solid rgba(255,255,255,0.08)" }}>
                {installSnippet}
              </pre>
              <button onClick={copySnippet} className="absolute top-2 right-2 p-1.5 rounded-md" style={{ background: "rgba(255,255,255,0.06)" }}>
                {copied ? <Check size={13} style={{ color: "var(--lime)" }} /> : <Copy size={13} style={{ color: "var(--text-tertiary)" }} />}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Воронка ── */}
      {totals.visitors === 0 ? (
        <div className="glow-card p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Ще немає даних. Встановіть сніпет і зачекайте на перших відвідувачів.</p>
        </div>
      ) : (
        <>
          <div className="glow-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Воронка</h2>
              <span className="text-xs text-[var(--text-tertiary)]">Конверсія: <span style={{ color: "var(--cyan)" }}>{overallConversion}%</span></span>
            </div>
            <div className="space-y-2">
              {funnelSteps.map(step => {
                const Icon = step.icon;
                const widthPct = Math.max((step.value / maxValue) * 100, 4);
                return (
                  <div key={step.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-1.5 text-[var(--text-secondary)]"><Icon size={12} /> {step.label}</span>
                      <span className="font-mono">{step.value}</span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                      <div className="h-full rounded-full" style={{ width: `${widthPct}%`, background: "var(--cyan)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glow-card p-4 space-y-2">
            <h2 className="text-sm font-semibold mb-1">По сторінках</h2>
            <div className="space-y-1.5">
              {byPage.slice(0, 10).map(page => {
                const conv = page.visitors > 0 ? Math.round((page.form_submits / page.visitors) * 10000) / 100 : 0;
                return (
                  <div key={page.page_url} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.02)" }}>
                    <span className="truncate flex-1 font-mono text-[var(--text-tertiary)]">{page.page_url}</span>
                    <span className="shrink-0">{page.visitors} відв. · {conv}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
