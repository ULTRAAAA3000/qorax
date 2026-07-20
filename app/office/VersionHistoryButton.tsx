"use client";

import { useState } from "react";
import { History, Loader2, X, RotateCcw } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Version {
  id: string;
  title: string;
  created_at: string;
}

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

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "щойно";
  if (mins < 60) return `${mins} хв тому`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} год тому`;
  const days = Math.round(hours / 24);
  return `${days} дн тому`;
}

// VersionHistoryButton — спільний для Docs/Sheets/Slides (MODULE_
// ROADMAP.md "Qorax Office", "Version History"). Знімки робить
// worker (officeVersions.ts, throttled ~10 хв, не кожне збереження)
// — цей компонент лише показує список і викликає /restore.
export function VersionHistoryButton({ docType, docId, onRestored }: { docType: string; docId: string; onRestored: () => void }) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  async function openMenu() {
    setOpen(true);
    if (!versions) {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/office-versions?doc_type=${docType}&doc_id=${docId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setVersions(data.versions ?? []);
    }
  }

  async function restore(versionId: string) {
    if (!confirm("Відновити цю версію? Поточний вміст буде замінено (сам поточний стан теж збережеться як версія).")) return;
    setRestoringId(versionId);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/office-versions/${versionId}/restore`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setOpen(false);
        setVersions(null); // наступне відкриття перезавантажить список
        onRestored();
      }
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="relative">
      <button onClick={openMenu} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)]">
        <History size={12} /> Історія
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20" style={{ background: "var(--bg)", border: "1px solid rgba(255,255,255,0.1)", minWidth: 220, maxHeight: 320, overflowY: "auto" }}>
            <div className="px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-xs font-medium">Історія версій</span>
              <button onClick={() => setOpen(false)}><X size={12} className="text-[var(--text-tertiary)]" /></button>
            </div>
            {!versions && (
              <div className="px-3 py-4 flex items-center justify-center text-xs text-[var(--text-tertiary)] gap-2">
                <Loader2 size={12} className="animate-spin" /> Завантаження...
              </div>
            )}
            {versions?.length === 0 && (
              <p className="px-3 py-4 text-xs text-[var(--text-tertiary)]">
                Ще немає збережених версій — знімок з&apos;явиться після ~10 хв редагування.
              </p>
            )}
            {versions?.map(v => (
              <button
                key={v.id}
                onClick={() => restore(v.id)}
                disabled={restoringId !== null}
                className="w-full text-left px-3 py-2 flex items-center justify-between gap-2 hover:bg-white/5 disabled:opacity-50"
              >
                <span className="text-xs">{relativeTime(v.created_at)}</span>
                {restoringId === v.id ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} className="text-[var(--text-tertiary)]" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
