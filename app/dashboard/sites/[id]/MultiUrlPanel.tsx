"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw } from "lucide-react";

interface UrlCheck { load_time_ms: number; status_code: number; checked_at: string; }
interface MonitoredUrl { id: string; url: string; label: string | null; created_at: string; checks: UrlCheck[]; }

function statusColor(ms: number | undefined) {
  if (!ms) return "var(--text-tertiary)";
  if (ms < 800) return "var(--lime)";
  if (ms < 2000) return "#F5A623";
  return "#F5675A";
}

export function MultiUrlPanel({ siteId, workerUrl, accessToken }: { siteId: string; workerUrl: string; accessToken: string }) {
  const [urls, setUrls] = useState<MonitoredUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${workerUrl}/api/sites/${siteId}/monitored-urls`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) setUrls(await r.json());
    } finally { setLoading(false); }
  }, [siteId, workerUrl, accessToken]);

  useEffect(() => { load(); }, [load]);

  async function addUrl() {
    if (!newUrl.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${workerUrl}/api/sites/${siteId}/monitored-urls`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ url: newUrl.trim(), label: newLabel.trim() || undefined }),
      });
      if (r.ok) { setNewUrl(""); setNewLabel(""); setAdding(false); load(); }
    } finally { setSaving(false); }
  }

  async function deleteUrl(id: string) {
    await fetch(`${workerUrl}/api/monitored-urls/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
    });
    load();
  }

  async function runChecks() {
    setRunning(true);
    await fetch(`${workerUrl}/api/admin/run-url-speeds`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}` },
    }).catch(() => {});
    setTimeout(() => { setRunning(false); load(); }, 3000);
  }

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)]">
      <div className="flex items-center justify-between px-5 py-4 border-b hairline">
        <div>
          <h3 className="text-sm font-medium">Швидкість URL</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Моніторинг конкретних сторінок</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={runChecks} disabled={running}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
            style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-hairline)" }}>
            <RefreshCw size={11} className={running ? "animate-spin" : ""} /> Перевірити
          </button>
          <button onClick={() => setAdding(v => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: "var(--lime)", color: "#0C111D" }}>
            <Plus size={12} /> Додати URL
          </button>
        </div>
      </div>

      {adding && (
        <div className="px-5 py-4 border-b hairline flex items-center gap-2 flex-wrap">
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
            placeholder="https://example.com/checkout" onKeyDown={e => e.key === "Enter" && addUrl()}
            className="flex-1 min-w-48 text-sm px-3 py-2 rounded-lg outline-none font-mono"
            style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Назва (напр. Кошик)" onKeyDown={e => e.key === "Enter" && addUrl()}
            className="text-sm px-3 py-2 rounded-lg outline-none w-40"
            style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }} />
          <button onClick={addUrl} disabled={saving || !newUrl.trim()}
            className="text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: "var(--lime)", color: "#0C111D" }}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : null} Зберегти
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" /></div>
      ) : urls.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">Додай URL для моніторингу — наприклад, /checkout або /contact</p>
        </div>
      ) : (
        <div className="divide-y hairline">
          {urls.map(mu => {
            const lastCheck = mu.checks[0];
            const avg = mu.checks.length ? Math.round(mu.checks.reduce((s, c) => s + c.load_time_ms, 0) / mu.checks.length) : null;
            const isOk = lastCheck?.status_code && lastCheck.status_code < 400;
            return (
              <div key={mu.id} className="px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {mu.label && <span className="text-xs font-medium">{mu.label}</span>}
                    <a href={mu.url} target="_blank" rel="noopener noreferrer"
                      className="text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1 truncate">
                      {mu.url.replace(/^https?:\/\/[^/]+/, "")} <ExternalLink size={9} />
                    </a>
                  </div>
                  {/* Мінічарт */}
                  <div className="flex items-end gap-0.5 h-8">
                    {(mu.checks.slice(0, 20).reverse()).map((c, i) => {
                      const h = Math.max(4, Math.min(32, Math.round(32 * c.load_time_ms / 5000)));
                      return (
                        <div key={i} title={`${c.load_time_ms}ms`}
                          style={{ height: h, width: 4, borderRadius: 2, background: statusColor(c.load_time_ms), flexShrink: 0 }} />
                      );
                    })}
                    {mu.checks.length === 0 && <span className="text-xs text-[var(--text-tertiary)]">Немає даних</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {lastCheck && (
                    <>
                      <div className="text-right">
                        <p className="text-sm font-mono font-semibold tabular-nums"
                          style={{ color: statusColor(lastCheck.load_time_ms) }}>
                          {lastCheck.load_time_ms}ms
                        </p>
                        {avg !== null && avg !== lastCheck.load_time_ms && (
                          <p className="text-xs text-[var(--text-tertiary)]">avg {avg}ms</p>
                        )}
                      </div>
                      {isOk
                        ? <CheckCircle2 size={14} style={{ color: "var(--lime)" }} />
                        : <AlertCircle size={14} style={{ color: "#F5675A" }} />
                      }
                    </>
                  )}
                  <button onClick={() => deleteUrl(mu.id)}
                    className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
                    style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
