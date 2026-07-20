"use client";

import { useState, useEffect, useCallback } from "react";
import { History, Loader2, X, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Props {
  organizationId: string;
  url: string;
  getFreshToken: () => Promise<string>;
  onClose: () => void;
}

interface Snapshot {
  timestamp: string;
  date: string;
  archiveUrl: string;
  statusCode: string;
}

// WebsiteTimelineModal — MODULE_ROADMAP.md, "Qorax Browser" Website
// Timeline. Використовує публічний Wayback Machine CDX API
// (archive.org) — Qorax Browser не зберігає власних копій чужого
// контенту, лише посилається на вже існуючі публічні архівні
// записи Internet Archive. Знімок відкривається в новій вкладці
// (web.archive.org сам показує архівну версію сторінки) — не через
// наш proxy, той не призначений для архівного перегляду.
export function WebsiteTimelineModal({ organizationId, url, getFreshToken, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/timeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося отримати історію сайту");
        return;
      }
      setSnapshots(data.snapshots ?? []);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }, [organizationId, url, getFreshToken]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-md max-h-[70vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <History size={14} style={{ color: "var(--cyan)" }} /> Website Timeline
          </h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={15} />
          </button>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4">
            <Loader2 size={13} className="animate-spin" /> Завантаження історії...
          </div>
        )}

        {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

        {snapshots && snapshots.length === 0 && (
          <p className="text-xs text-[var(--text-tertiary)]">Немає архівних знімків цього сайту у Wayback Machine.</p>
        )}

        {snapshots && snapshots.length > 0 && (
          <div className="space-y-1.5">
            {snapshots.map(snap => (
              <a
                key={snap.timestamp}
                href={snap.archiveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-white/5 transition-colors text-xs"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <span className="text-[var(--text-secondary)]">{snap.date}</span>
                <span className="flex items-center gap-1.5 text-[var(--text-tertiary)]">
                  HTTP {snap.statusCode} <ExternalLink size={11} />
                </span>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
