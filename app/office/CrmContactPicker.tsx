"use client";

import { useState, useEffect } from "react";
import { X, Loader2, User, Search } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Contact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
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

// CrmContactPicker — вибір контакту для Smart Block (MODULE_ROADMAP.md
// "Qorax Office" — Smart Blocks). Переюзує вже наявний GET
// /api/crm/contacts?organization_id=... (список), не новий ендпоінт.
export function CrmContactPicker({ organizationId, onSelect, onClose }: { organizationId: string; onSelect: (contactId: string) => void; onClose: () => void }) {
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/crm/contacts?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setContacts(data.contacts ?? []);
    })();
  }, [organizationId]);

  const filtered = contacts?.filter(c => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (c.name ?? "").toLowerCase().includes(q) || (c.email ?? "").toLowerCase().includes(q);
  }) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="glow-card p-4 max-w-sm w-full max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Вставити контакт CRM</h3>
          <button onClick={onClose}><X size={14} className="text-[var(--text-tertiary)]" /></button>
        </div>

        <div className="relative mb-2">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Пошук за іменем чи email..."
            className="w-full rounded-lg pl-7 pr-2 py-1.5 text-xs outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
        </div>

        <div className="overflow-y-auto flex-1 -mx-1">
          {!contacts && (
            <div className="flex items-center justify-center py-6 text-xs text-[var(--text-tertiary)] gap-2">
              <Loader2 size={12} className="animate-spin" /> Завантаження...
            </div>
          )}
          {contacts && filtered.length === 0 && (
            <p className="px-1 py-4 text-xs text-[var(--text-tertiary)] text-center">Контактів не знайдено</p>
          )}
          {filtered.map(c => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="w-full text-left px-2 py-2 rounded-lg flex items-center gap-2 hover:bg-white/5"
            >
              <User size={12} className="text-[var(--text-tertiary)] shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium truncate">{c.name || "Без імені"}</p>
                {c.email && <p className="text-[10px] text-[var(--text-tertiary)] truncate">{c.email}</p>}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
