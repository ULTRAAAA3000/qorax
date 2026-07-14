"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, X, Loader2, LayoutTemplate } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Board {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  organizationId: string;
}

// Той самий фікс, що TeamWorkspaceUI.tsx і ProjectEditorUI.tsx —
// не кешувати JWT на весь час життя компонента (Supabase-сесія живе
// ~1 годину).
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

export function CreatorBoardsListUI({ organizationId }: Props) {
  const [boards, setBoards] = useState<Board[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/canvas-boards`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setBoards(data.boards ?? []);
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function createBoard(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/canvas-boards`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || undefined }),
      });
      setTitle("");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-4">
      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
          <Plus size={14} /> Нова дошка
        </button>
      ) : (
        <form onSubmit={createBoard} className="glow-card p-4 flex items-center gap-2">
          <input
            autoFocus
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="Назва дошки (необов'язково)"
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button type="submit" disabled={creating} className="glow-button text-sm !py-2 !px-4 disabled:opacity-50">
            {creating ? <Loader2 size={14} className="animate-spin" /> : "Створити"}
          </button>
          <button type="button" onClick={() => setShowCreate(false)} className="p-2 rounded-lg hover:bg-white/5 transition-colors">
            <X size={14} className="text-[var(--text-tertiary)]" />
          </button>
        </form>
      )}

      {!boards && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {boards?.length === 0 && (
        <div className="glow-card p-8 text-center">
          <LayoutTemplate size={20} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-secondary)]">Ще немає жодної дошки. Створіть першу.</p>
        </div>
      )}

      {boards && boards.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boards.map(board => (
            <Link
              key={board.id}
              href={`/dashboard/creator/${board.id}`}
              className="glow-card p-4 flex flex-col gap-1 hover:border-white/20 transition-colors"
            >
              <span className="text-sm font-medium truncate">{board.title}</span>
              <span className="text-xs text-[var(--text-tertiary)]">
                Оновлено {new Date(board.updated_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
