"use client";
import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, CheckCircle2, XCircle } from "lucide-react";

interface LastCheck { form_found: boolean; fields_count: number | null; has_submit: boolean | null; checked_at: string; }
interface MonitoredForm { id: string; page_url: string; label: string | null; created_at: string; lastCheck: LastCheck | null; }

export function FormMonitorPanel({ siteId, workerUrl, accessToken, siteUrl }: {
  siteId: string; workerUrl: string; accessToken: string; siteUrl: string;
}) {
  const [forms, setForms] = useState<MonitoredForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${workerUrl}/api/sites/${siteId}/monitored-forms`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (r.ok) setForms(await r.json());
    } finally { setLoading(false); }
  }, [siteId, workerUrl, accessToken]);

  useEffect(() => { load(); }, [load]);

  // Автоматично підставляємо базовий URL сайту
  useEffect(() => {
    if (adding && !newUrl) {
      try { setNewUrl(new URL(siteUrl).origin + "/"); } catch { /* ok */ }
    }
  }, [adding, siteUrl, newUrl]);

  async function addForm() {
    if (!newUrl.trim()) return;
    setSaving(true);
    try {
      const r = await fetch(`${workerUrl}/api/sites/${siteId}/monitored-forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ page_url: newUrl.trim(), label: newLabel.trim() || undefined }),
      });
      if (r.ok) { setNewUrl(""); setNewLabel(""); setAdding(false); load(); }
    } finally { setSaving(false); }
  }

  async function deleteForm(id: string) {
    await fetch(`${workerUrl}/api/monitored-forms/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${accessToken}` },
    });
    load();
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short" });
  }

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)]">
      <div className="flex items-center justify-between px-5 py-4 border-b hairline">
        <div>
          <h3 className="text-sm font-medium">Моніторинг форм</h3>
          <p className="text-xs text-[var(--text-tertiary)] mt-0.5">Чи працюють форми на сайті</p>
        </div>
        <button onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium"
          style={{ background: "var(--lime)", color: "#0C111D" }}>
          <Plus size={12} /> Додати форму
        </button>
      </div>

      {adding && (
        <div className="px-5 py-4 border-b hairline flex items-center gap-2 flex-wrap">
          <input value={newUrl} onChange={e => setNewUrl(e.target.value)}
            placeholder="https://example.com/contact"
            onKeyDown={e => e.key === "Enter" && addForm()}
            className="flex-1 min-w-48 text-sm px-3 py-2 rounded-lg outline-none font-mono"
            style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)}
            placeholder="Контактна форма"
            onKeyDown={e => e.key === "Enter" && addForm()}
            className="text-sm px-3 py-2 rounded-lg outline-none w-40"
            style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }} />
          <button onClick={addForm} disabled={saving || !newUrl.trim()}
            className="text-xs px-3 py-2 rounded-lg font-medium flex items-center gap-1.5 disabled:opacity-40"
            style={{ background: "var(--lime)", color: "#0C111D" }}>
            {saving ? <Loader2 size={11} className="animate-spin" /> : null} Зберегти
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 size={16} className="animate-spin text-[var(--text-tertiary)]" /></div>
      ) : forms.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-sm text-[var(--text-tertiary)]">Додай URL сторінки з формою — Qorax буде щодня перевіряти що форма існує і має кнопку відправки</p>
        </div>
      ) : (
        <div className="divide-y hairline">
          {forms.map(mf => {
            const lc = mf.lastCheck;
            return (
              <div key={mf.id} className="px-5 py-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    {lc ? (
                      lc.form_found
                        ? <CheckCircle2 size={13} style={{ color: "var(--lime)" }} />
                        : <XCircle size={13} style={{ color: "#F5675A" }} />
                    ) : null}
                    <span className="text-sm font-medium truncate">{mf.label ?? new URL(mf.page_url).pathname}</span>
                  </div>
                  <p className="text-xs font-mono text-[var(--text-tertiary)] truncate">{mf.page_url}</p>
                  {lc && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                      {lc.form_found
                        ? `Форма знайдена · ${lc.fields_count ?? "?"} полів · ${lc.has_submit ? "є Submit" : "нема Submit"}`
                        : "⚠ Форма не знайдена на сторінці"
                      }
                      {" · "}
                      <span>{fmtDate(lc.checked_at)}</span>
                    </p>
                  )}
                  {!lc && <p className="text-xs text-[var(--text-tertiary)] mt-1">Перевірка ще не проводилась</p>}
                </div>
                <button onClick={() => deleteForm(mf.id)}
                  className="p-1.5 rounded-lg transition-opacity hover:opacity-60 shrink-0"
                  style={{ color: "var(--text-tertiary)" }}>
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
