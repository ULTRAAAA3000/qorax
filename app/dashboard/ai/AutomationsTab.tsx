"use client";

import { useState, useEffect, useCallback } from "react";
import { Zap, Loader2, Plus, X, Clock } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface SiteOption {
  id: string;
  url: string;
  display_name: string;
}

interface Subscription {
  id: string;
  agent_id: string;
  site_id: string | null;
  schedule_cron: string | null;
  is_enabled: boolean;
  last_run_at: string | null;
}

const SCHEDULE_LABELS: Record<string, string> = {
  daily: "Щодня",
  weekly: "Щотижня",
};

async function getFreshToken(): Promise<string> {
  try {
    const { createClient } = await import("@/app/lib/supabase/client");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  } catch {
    return "";
  }
}

// Automations — шостий (останній) UI-крок Qorax AI хаба хвилі 3.
// agent_subscriptions = Automations за задумом roadmap (коментар у
// 0049_qorax_ai_hub.sql). Лише content-агент підтримується — єдиний
// реалізований агент (AgentsTab.tsx, той самий принцип: 1-2 агенти
// за сесію, не заглушки для решти з MODULE_ROADMAP.md). Розклад —
// прості пресети 'daily'/'weekly', не довільний cron-синтаксис
// (agentHandler.ts, SCHEDULE_INTERVALS_MS — MVP без cron-парсера).
export function AutomationsTab({ sites, organizationId }: { sites: SiteOption[]; organizationId: string }) {
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [formSiteId, setFormSiteId] = useState(sites[0]?.id ?? "");
  const [formSchedule, setFormSchedule] = useState<"daily" | "weekly">("daily");
  const [saving, setSaving] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const token = await getFreshToken();
      if (!token) return;
      const resp = await fetch(`${API_BASE_URL}/api/agents/subscriptions?organization_id=${encodeURIComponent(organizationId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { subscriptions: Subscription[] };
      setSubscriptions(data.subscriptions ?? []);
    } catch (err) {
      console.error("[AutomationsTab] failed to load:", err);
      setSubscriptions([]);
    }
  }, [organizationId]);

  useEffect(() => { load(); }, [load]);

  async function createAutomation(e: React.FormEvent) {
    e.preventDefault();
    if (!formSiteId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getFreshToken();
      if (!token) { setError("Сесія закінчилась — оновіть сторінку"); return; }

      const resp = await fetch(`${API_BASE_URL}/api/agents/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ site_id: formSiteId, schedule_cron: formSchedule }),
      });
      const data = await resp.json();
      if (!resp.ok) { setError(data.error ?? "Не вдалося створити автоматизацію"); return; }

      setShowForm(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function toggle(sub: Subscription) {
    setTogglingId(sub.id);
    setError(null);
    // Оптимістичне оновлення — не чекати мережу для миттєвого відгуку UI
    setSubscriptions(prev => prev?.map(s => (s.id === sub.id ? { ...s, is_enabled: !s.is_enabled } : s)) ?? prev);
    try {
      const token = await getFreshToken();
      if (!token) return;
      const resp = await fetch(`${API_BASE_URL}/api/agents/subscriptions/${sub.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ organization_id: organizationId, is_enabled: !sub.is_enabled }),
      });
      if (!resp.ok) await load(); // відкат при помилці
    } finally {
      setTogglingId(null);
    }
  }

  function siteLabel(siteId: string | null): string {
    const site = sites.find(s => s.id === siteId);
    return site ? (site.display_name || site.url) : "Невідомий сайт";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap size={16} style={{ color: "var(--lime)" }} />
            <h2 className="text-sm font-semibold">Автоматизації</h2>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Content-агент запускається сам за розкладом — перевіряється щоночі, без ручного натискання.
          </p>
        </div>
        {!showForm && sites.length > 0 && (
          <button onClick={() => setShowForm(true)} className="glow-button text-sm !py-2 !px-3 flex items-center gap-1.5 shrink-0">
            <Plus size={14} /> Нова автоматизація
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
          {error}
        </div>
      )}

      {sites.length === 0 ? (
        <div className="glow-card p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Немає підключених сайтів — спочатку додайте сайт в Audit.</p>
        </div>
      ) : showForm ? (
        <form onSubmit={createAutomation} className="glow-card p-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={formSiteId}
              onChange={e => setFormSiteId(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            >
              {sites.map(s => (
                <option key={s.id} value={s.id}>{s.display_name || s.url}</option>
              ))}
            </select>
            <select
              value={formSchedule}
              onChange={e => setFormSchedule(e.target.value as "daily" | "weekly")}
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            >
              <option value="daily">Щодня</option>
              <option value="weekly">Щотижня</option>
            </select>
            <button type="submit" disabled={saving} className="glow-button text-sm !py-2 !px-4">
              {saving ? <Loader2 size={14} className="animate-spin" /> : "Зберегти"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="text-[var(--text-tertiary)]">
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">
            Content-агент шукатиме сторінки з проблемами SEO (title/meta description) і генеруватиме готові пропозиції — так само, як ручний запуск у вкладці Agents.
          </p>
        </form>
      ) : null}

      {subscriptions === null ? (
        <div className="glow-card p-10 text-center">
          <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : subscriptions.length === 0 ? (
        <div className="glow-card p-8 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Ще немає автоматизацій — додайте першу вище.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {subscriptions.map(sub => (
            <div key={sub.id} className="glow-card p-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{siteLabel(sub.site_id)}</p>
                <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5 mt-0.5">
                  <Clock size={11} />
                  {SCHEDULE_LABELS[sub.schedule_cron ?? ""] ?? sub.schedule_cron}
                  {sub.last_run_at && ` · востаннє: ${new Date(sub.last_run_at).toLocaleDateString("uk-UA")}`}
                </p>
              </div>
              <button
                onClick={() => toggle(sub)}
                disabled={togglingId === sub.id}
                className="text-xs px-3 py-1.5 rounded-lg shrink-0 transition-colors"
                style={sub.is_enabled
                  ? { background: "rgba(214,255,63,0.1)", color: "var(--lime)" }
                  : { background: "rgba(255,255,255,0.03)", color: "var(--text-tertiary)" }}
              >
                {togglingId === sub.id ? <Loader2 size={12} className="animate-spin" /> : sub.is_enabled ? "Увімкнено" : "Вимкнено"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
