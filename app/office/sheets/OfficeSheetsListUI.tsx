"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Loader2, Table2, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Sheet {
  id: string;
  title: string;
  updated_at: string;
}

interface Props {
  organizationId: string;
}

// Той самий фікс, що OfficeDocsListUI.tsx.
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

export function OfficeSheetsListUI({ organizationId }: Props) {
  const [sheets, setSheets] = useState<Sheet[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-sheets`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setSheets(data.sheets ?? []);
  }, [organizationId]);

  useEffect(() => {
    (async () => { await load(); })();
  }, [load]);

  async function createSheet() {
    setCreating(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-sheets`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (data.sheet?.id) window.location.href = `/office/sheets/${data.sheet.id}`;
    } finally {
      setCreating(false);
    }
  }

  async function deleteSheet(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Видалити таблицю без можливості відновлення?")) return;
    setDeletingId(id);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-sheets/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
      setSheets(prev => prev?.filter(s => s.id !== id) ?? null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={createSheet} disabled={creating} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5 disabled:opacity-50">
        {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Нова таблиця
      </button>

      {!sheets && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {sheets?.length === 0 && (
        <div className="glow-card p-8 text-center">
          <Table2 size={20} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-secondary)]">Ще немає жодної таблиці. Створіть першу.</p>
        </div>
      )}

      {sheets && sheets.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sheets.map(sheet => (
            <Link
              key={sheet.id}
              href={`/office/sheets/${sheet.id}`}
              className="glow-card p-4 flex flex-col gap-1 hover:border-white/20 transition-colors relative group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{sheet.title}</span>
                <button
                  onClick={e => deleteSheet(sheet.id, e)}
                  disabled={deletingId === sheet.id}
                  aria-label="Видалити"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/5 shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {deletingId === sheet.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
              <span className="text-xs text-[var(--text-tertiary)]">
                Оновлено {new Date(sheet.updated_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
