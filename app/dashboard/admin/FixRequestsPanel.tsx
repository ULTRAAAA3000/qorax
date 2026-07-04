"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, ExternalLink, Mail } from "lucide-react";

interface FixRequest {
  id: string;
  problem_description: string;
  site_platform: string | null;
  is_free: boolean;
  status: "new" | "in_progress" | "done" | "declined";
  admin_notes: string | null;
  created_at: string;
  sites: { display_name: string; url: string } | null;
  organizations: { name: string } | null;
}

interface Props { accessToken: string; workerUrl: string; }

const STATUS_LABELS: Record<FixRequest["status"], string> = {
  new: "Нова",
  in_progress: "В роботі",
  done: "Готово",
  declined: "Відхилено",
};

const STATUS_COLORS: Record<FixRequest["status"], string> = {
  new: "#8CF6FF",
  in_progress: "#FFC24B",
  done: "#D6FF3F",
  declined: "#6E6E73",
};

const PLATFORM_LABELS: Record<string, string> = {
  wordpress: "WordPress",
  tilda: "Tilda",
  wix: "Wix",
  custom: "Кастомна розробка",
  other: "Інше",
};

export function FixRequestsPanel({ accessToken, workerUrl }: Props) {
  const [requests, setRequests] = useState<FixRequest[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"active" | "all">("active");

  const load = useCallback(() => {
    fetch(`${workerUrl}/api/admin/fix-requests`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setRequests(d.requests as FixRequest[]); })
      .catch(() => {});
  }, [accessToken, workerUrl]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(id: string, status: FixRequest["status"]) {
    setUpdating(id);
    try {
      const resp = await fetch(`${workerUrl}/api/admin/fix-requests/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (resp.ok) {
        setRequests(prev => prev?.map(r => r.id === id ? { ...r, status } : r) ?? null);
      }
    } catch {
      // ignore, UI просто не оновиться — користувач побачить і спробує ще раз
    } finally {
      setUpdating(null);
    }
  }

  const visible = requests?.filter(r =>
    filter === "all" ? true : r.status === "new" || r.status === "in_progress"
  ) ?? null;

  const newCount = requests?.filter(r => r.status === "new").length ?? 0;

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
            Заявки на виправлення
          </h2>
          {newCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-md font-mono"
              style={{ background: "rgba(140,246,255,0.1)", border: "1px solid rgba(140,246,255,0.3)", color: "#8CF6FF" }}>
              {newCount} нових
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(["active", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{
                background: filter === f ? "rgba(255,255,255,0.08)" : "transparent",
                color: filter === f ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              {f === "active" ? "Активні" : "Всі"}
            </button>
          ))}
        </div>
      </div>

      {visible === null ? (
        <div className="flex items-center justify-center py-8 text-[var(--text-tertiary)]">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">
          {filter === "active" ? "Немає активних заявок" : "Заявок ще не було"}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(r => (
            <div key={r.id}
              className="rounded-xl p-4"
              style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="text-sm font-medium">{r.sites?.display_name ?? "—"}</span>
                    <span className="text-xs text-[var(--text-tertiary)] font-mono truncate max-w-[200px]">
                      {r.sites?.url}
                    </span>
                    {r.sites?.url && (
                      <a href={r.sites.url} target="_blank" rel="noopener noreferrer" className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                        <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-[var(--text-tertiary)]">
                    <span>{r.organizations?.name}</span>
                    <span>·</span>
                    <span>{r.site_platform ? (PLATFORM_LABELS[r.site_platform] ?? r.site_platform) : "Платформа невідома"}</span>
                    <span>·</span>
                    <span className={r.is_free ? "" : "font-medium"} style={{ color: r.is_free ? undefined : "var(--lime)" }}>
                      {r.is_free ? "Безкоштовна" : "Платна"}
                    </span>
                    <span>·</span>
                    <span>{new Date(r.created_at).toLocaleDateString("uk-UA")}</span>
                  </div>
                </div>
                <span className="shrink-0 text-xs px-2 py-1 rounded-md font-medium"
                  style={{ background: `${STATUS_COLORS[r.status]}1a`, color: STATUS_COLORS[r.status] }}>
                  {STATUS_LABELS[r.status]}
                </span>
              </div>

              <p className="text-sm text-[var(--text-secondary)] whitespace-pre-wrap mb-3 leading-relaxed">
                {r.problem_description}
              </p>

              <div className="flex items-center gap-2 flex-wrap">
                {(["new", "in_progress", "done", "declined"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => updateStatus(r.id, s)}
                    disabled={updating === r.id || r.status === s}
                    className="text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40"
                    style={{
                      background: r.status === s ? `${STATUS_COLORS[s]}1a` : "rgba(255,255,255,0.04)",
                      border: `1px solid ${r.status === s ? STATUS_COLORS[s] + "50" : "var(--border-hairline)"}`,
                      color: r.status === s ? STATUS_COLORS[s] : "var(--text-tertiary)",
                    }}
                  >
                    {STATUS_LABELS[s]}
                  </button>
                ))}
                <a
                  href={`mailto:?subject=${encodeURIComponent(`Щодо виправлення на ${r.sites?.display_name ?? ""}`)}`}
                  className="text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 flex items-center gap-1"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid var(--border-hairline)", color: "var(--text-tertiary)" }}
                >
                  <Mail size={11} /> Написати клієнту
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
