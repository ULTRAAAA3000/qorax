"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, X, Loader2, FileText, Trash2, LayoutTemplate } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Doc {
  id: string;
  title: string;
  updated_at: string;
}

interface Template {
  id: string;
  category: string;
  title: string;
  description: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  contract: "Договір",
  invoice: "Рахунок",
  proposal: "Комерційна пропозиція",
  project_plan: "Планування",
  sop: "Інструкція",
};

interface Props {
  organizationId: string;
}

// Той самий фікс, що CreatorBoardsListUI.tsx і TeamWorkspaceUI.tsx —
// не кешувати JWT на весь час життя компонента.
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

export function OfficeDocsListUI({ organizationId }: Props) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [creating, setCreating] = useState<string | null>(null); // template_id що зараз створюється, або "blank"
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setDocs(data.documents ?? []);
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function openCreateModal() {
    setShowCreate(true);
    if (!templates) {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-templates`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setTemplates(data.templates ?? []);
    }
  }

  async function createDoc(templateId?: string) {
    setCreating(templateId ?? "blank");
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-documents`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(templateId ? { template_id: templateId } : {}),
      });
      const data = await res.json();
      if (data.document?.id) {
        window.location.href = `/office/${data.document.id}`;
        return;
      }
      setShowCreate(false);
      await load();
    } finally {
      setCreating(null);
    }
  }

  async function deleteDoc(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("Видалити документ без можливості відновлення?")) return;
    setDeletingId(id);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-documents/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      setDocs(prev => prev?.filter(d => d.id !== id) ?? null);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <button onClick={openCreateModal} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
        <Plus size={14} /> Новий документ
      </button>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setShowCreate(false)}>
          <div
            className="glow-card p-5 max-w-2xl w-full max-h-[80vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Новий документ</h3>
              <button onClick={() => setShowCreate(false)} className="p-1 rounded-lg hover:bg-white/5">
                <X size={14} className="text-[var(--text-tertiary)]" />
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <button
                onClick={() => createDoc()}
                disabled={creating !== null}
                className="glow-card p-3.5 text-left hover:border-white/20 transition-colors flex items-start gap-2.5 disabled:opacity-50"
              >
                {creating === "blank" ? <Loader2 size={16} className="animate-spin shrink-0 mt-0.5" /> : <FileText size={16} className="shrink-0 mt-0.5 opacity-60" />}
                <div>
                  <div className="text-sm font-medium">Порожній документ</div>
                  <div className="text-xs text-[var(--text-tertiary)] mt-0.5">Почати з чистого аркуша</div>
                </div>
              </button>

              {!templates && (
                <div className="flex items-center justify-center py-6 col-span-full text-sm text-[var(--text-tertiary)] gap-2">
                  <Loader2 size={14} className="animate-spin" /> Завантаження шаблонів...
                </div>
              )}

              {templates?.map(t => (
                <button
                  key={t.id}
                  onClick={() => createDoc(t.id)}
                  disabled={creating !== null}
                  className="glow-card p-3.5 text-left hover:border-white/20 transition-colors flex items-start gap-2.5 disabled:opacity-50"
                >
                  {creating === t.id ? <Loader2 size={16} className="animate-spin shrink-0 mt-0.5" /> : <LayoutTemplate size={16} className="shrink-0 mt-0.5" style={{ color: "var(--lime)" }} />}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.title}</div>
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-2">{t.description ?? CATEGORY_LABELS[t.category] ?? t.category}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {!docs && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {docs?.length === 0 && (
        <div className="glow-card p-8 text-center">
          <FileText size={20} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm text-[var(--text-secondary)]">Ще немає жодного документа. Створіть перший.</p>
        </div>
      )}

      {docs && docs.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map(doc => (
            <Link
              key={doc.id}
              href={`/office/${doc.id}`}
              className="glow-card p-4 flex flex-col gap-1 hover:border-white/20 transition-colors relative group"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{doc.title}</span>
                <button
                  onClick={e => deleteDoc(doc.id, e)}
                  disabled={deletingId === doc.id}
                  aria-label="Видалити"
                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg hover:bg-white/5 shrink-0"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  {deletingId === doc.id ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                </button>
              </div>
              <span className="text-xs text-[var(--text-tertiary)]">
                Оновлено {new Date(doc.updated_at).toLocaleDateString("uk-UA", { day: "2-digit", month: "short" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
