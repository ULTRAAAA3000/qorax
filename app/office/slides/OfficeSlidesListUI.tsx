"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Loader2, Presentation, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Deck {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  organizationId: string;
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

export function OfficeSlidesListUI({ organizationId }: Props) {
  const [decks, setDecks] = useState<Deck[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-slides`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setDecks(data.decks ?? []);
  }, [organizationId]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  async function createDeck() {
    setCreating(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-slides`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.deck?.id) window.location.href = `/office/slides/${data.deck.id}`;
    } finally {
      setCreating(false);
    }
  }

  async function deleteDeck(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Видалити презентацію без можливості відновлення?")) return;
    setDeletingId(id);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-slides/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setDecks(prev => prev?.filter(d => d.id !== id) ?? null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={createDeck} disabled={creating} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5 disabled:opacity-50">
        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Нова презентація
      </button>

      {!decks && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {decks?.length === 0 && (
        <div className="glow-card p-8 text-center">
          <Presentation size={20} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-secondary)]">Ще немає жодної презентації. Створіть першу.</p>
        </div>
      )}

      {decks && decks.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {decks.map(deck => (
            <Link
              key={deck.id}
              href={`/office/slides/${deck.id}`}
              className="glow-card p-4 flex flex-col gap-1 hover:border-white/20 transition-colors relative group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{deck.title}</span>
                <button
                  onClick={e => deleteDeck(deck.id, e)}
                  disabled={deletingId === deck.id}
                  aria-label="Видалити"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/5 shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {deletingId === deck.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
              <span className="text-xs text-[var(--text-tertiary)]">
                Оновлено {new Date(deck.updated_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
