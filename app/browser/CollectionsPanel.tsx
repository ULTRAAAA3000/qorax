"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Trash2, Loader2, FolderOpen, Bookmark, ChevronLeft, FileText } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Collection {
  id: string;
  title: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

interface CollectionItem {
  id: string;
  url: string;
  title: string | null;
  note: string | null;
  visited_at: string;
}

interface OfficeDoc {
  id: string;
  title: string;
}

interface DocItem {
  id: string;
  office_document_id: string;
  title: string;
  added_at: string;
}

interface Props {
  organizationId: string;
  currentUrl: string | null;
  getFreshToken: () => Promise<string>;
  onNavigate: (url: string) => void;
}

// CollectionsPanel — MODULE_ROADMAP.md, "Qorax Browser" Collections
// ("вбивця закладок"). Винесено в окремий компонент, бо BrowserUI.tsx
// вже великий (URL bar + iframe + AI/Inspector таби) — той самий
// принцип, що InspectSection/TagPill helpers в BrowserUI.tsx, лише
// для цілого табу, не дрібних елементів.
export function CollectionsPanel({ organizationId, currentUrl, getFreshToken, onNavigate }: Props) {
  const [collections, setCollections] = useState<Collection[] | null>(null);
  const [openCollection, setOpenCollection] = useState<Collection | null>(null);
  const [items, setItems] = useState<CollectionItem[] | null>(null);
  const [docItems, setDocItems] = useState<DocItem[] | null>(null);
  const [availableDocs, setAvailableDocs] = useState<OfficeDoc[] | null>(null);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [addingDoc, setAddingDoc] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveNote, setSaveNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loadCollections = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/browser/collections?organization_id=${organizationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setCollections(data.collections ?? []);
  }, [organizationId, getFreshToken]);

  useEffect(() => {
    (async () => {
      await loadCollections();
    })();
  }, [loadCollections]);

  async function loadItems(collection: Collection) {
    setOpenCollection(collection);
    setItems(null);
    setDocItems(null);
    const token = await getFreshToken();
    const [historyRes, docsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/api/browser/history?organization_id=${organizationId}&collection_id=${collection.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
      fetch(`${API_BASE_URL}/api/browser/collections/${collection.id}/items`, {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ]);
    if (historyRes.ok) setItems((await historyRes.json()).history ?? []);
    if (docsRes.ok) setDocItems((await docsRes.json()).items ?? []);
  }

  async function loadAvailableDocs() {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/office-documents`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setAvailableDocs(data.documents ?? []);
  }

  async function addDocToCollection(docId: string) {
    if (!openCollection) return;
    setAddingDoc(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/browser/collections/${openCollection.id}/items`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ office_document_id: docId }),
      });
      setShowDocPicker(false);
      await loadItems(openCollection);
    } finally {
      setAddingDoc(false);
    }
  }

  async function removeDocItem(itemId: string) {
    if (!openCollection) return;
    const token = await getFreshToken();
    await fetch(`${API_BASE_URL}/api/browser/collection-items/${itemId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    await loadItems(openCollection);
  }

  async function createCollection(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/collections`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, title: newTitle.trim() }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Не вдалося створити колекцію");
        return;
      }
      setNewTitle("");
      setShowCreateForm(false);
      await loadCollections();
    } finally {
      setCreating(false);
    }
  }

  async function deleteCollection(id: string) {
    const token = await getFreshToken();
    await fetch(`${API_BASE_URL}/api/browser/collections/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (openCollection?.id === id) setOpenCollection(null);
    await loadCollections();
  }

  async function saveCurrentSite(collectionId: string) {
    if (!currentUrl) return;
    setSaving(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/collections/save`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, url: currentUrl, collection_id: collectionId, note: saveNote.trim() || undefined }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Не вдалося зберегти сайт у колекцію");
        return;
      }
      setSaveNote("");
      if (openCollection?.id === collectionId) await loadItems(openCollection);
    } finally {
      setSaving(false);
    }
  }

  // ── Деталі відкритої колекції ──
  if (openCollection) {
    return (
      <div className="space-y-3.5">
        <button onClick={() => setOpenCollection(null)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1">
          <ChevronLeft size={12} /> Усі колекції
        </button>

        <div>
          <h3 className="text-sm font-medium">{openCollection.title}</h3>
          {openCollection.description && <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{openCollection.description}</p>}
        </div>

        {currentUrl && (
          <div className="space-y-2 rounded-xl p-3" style={{ background: "rgba(198,255,84,0.05)", border: "1px solid rgba(198,255,84,0.15)" }}>
            <p className="text-xs text-[var(--text-secondary)] truncate">Додати поточний сайт: {currentUrl}</p>
            <input
              type="text"
              value={saveNote}
              onChange={e => setSaveNote(e.target.value)}
              placeholder="Нотатка (необов'язково)"
              className="w-full bg-transparent text-xs outline-none px-2 py-1.5 rounded-lg placeholder:text-[var(--text-tertiary)]"
              style={{ background: "rgba(255,255,255,0.04)" }}
            />
            <button
              onClick={() => saveCurrentSite(openCollection.id)}
              disabled={saving}
              className="w-full glow-button text-xs !py-1.5 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Bookmark size={12} />}
              {saving ? "Зберігаю..." : "Зберегти сюди"}
            </button>
          </div>
        )}

        {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

        {!items && (
          <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-3">
            <Loader2 size={12} className="animate-spin" /> Завантаження...
          </div>
        )}

        {items && items.length === 0 && (
          <p className="text-xs text-[var(--text-tertiary)]">Ще немає збережених сайтів у цій колекції.</p>
        )}

        {items && items.length > 0 && (
          <div className="space-y-1.5">
            {items.map(item => (
              <button
                key={item.id}
                onClick={() => onNavigate(item.url)}
                className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <p className="text-xs truncate text-[var(--text-secondary)]">{item.title || item.url}</p>
                {item.note && <p className="text-[11px] text-[var(--text-tertiary)] truncate mt-0.5">{item.note}</p>}
              </button>
            ))}
          </div>
        )}

        {/* Workspace Tabs (MODULE_ROADMAP.md, "Qorax Browser"):
            документи Qorax Office прикріплені до цієї колекції —
            той самий проєкт, що групує сайти вище, тепер і документи. */}
        <div className="pt-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5">
              <FileText size={11} /> Документи Office
            </p>
            <button
              onClick={() => { setShowDocPicker(v => !v); if (!availableDocs) loadAvailableDocs(); }}
              className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
            >
              + Додати
            </button>
          </div>

          {showDocPicker && (
            <div className="space-y-1 mb-2 max-h-40 overflow-y-auto rounded-lg p-1.5" style={{ background: "rgba(255,255,255,0.03)" }}>
              {!availableDocs && (
                <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)] py-1.5 px-1.5">
                  <Loader2 size={11} className="animate-spin" /> Завантаження...
                </div>
              )}
              {availableDocs && availableDocs.length === 0 && (
                <p className="text-[11px] text-[var(--text-tertiary)] px-1.5 py-1">Немає документів в Office.</p>
              )}
              {availableDocs?.map(doc => (
                <button
                  key={doc.id}
                  onClick={() => addDocToCollection(doc.id)}
                  disabled={addingDoc}
                  className="w-full text-left px-2 py-1.5 rounded-md text-xs truncate hover:bg-white/5 transition-colors disabled:opacity-50"
                >
                  {doc.title}
                </button>
              ))}
            </div>
          )}

          {docItems && docItems.length === 0 && !showDocPicker && (
            <p className="text-[11px] text-[var(--text-tertiary)]">Ще немає доданих документів.</p>
          )}

          {docItems && docItems.length > 0 && (
            <div className="space-y-1.5">
              {docItems.map(doc => (
                <div key={doc.id} className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.03)" }}>
                  <a href={`/office/${doc.office_document_id}`} target="_blank" rel="noopener noreferrer" className="text-xs truncate text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                    {doc.title}
                  </a>
                  <button onClick={() => removeDocItem(doc.id)} className="text-[var(--text-tertiary)] hover:text-[#F5675A] flex-shrink-0">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={() => deleteCollection(openCollection.id)}
          className="w-full text-xs flex items-center justify-center gap-1.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
          style={{ color: "#F5675A" }}
        >
          <Trash2 size={12} /> Видалити колекцію
        </button>
      </div>
    );
  }

  // ── Список колекцій ──
  return (
    <div className="space-y-3.5">
      {!showCreateForm ? (
        <button
          onClick={() => setShowCreateForm(true)}
          className="w-full glow-button text-xs !py-2 flex items-center justify-center gap-1.5"
        >
          <Plus size={13} /> Нова колекція
        </button>
      ) : (
        <form onSubmit={createCollection} className="space-y-2">
          <input
            type="text"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Напр. Інтернет-магазин одягу"
            autoFocus
            className="w-full text-xs outline-none px-2.5 py-2 rounded-lg placeholder:text-[var(--text-tertiary)]"
            style={{ background: "rgba(255,255,255,0.04)" }}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className="flex-1 glow-button text-xs !py-1.5 disabled:opacity-50">
              {creating ? "Створюю..." : "Створити"}
            </button>
            <button type="button" onClick={() => setShowCreateForm(false)} className="text-xs px-3 text-[var(--text-tertiary)]">
              Скасувати
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

      {!collections && (
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-3">
          <Loader2 size={12} className="animate-spin" /> Завантаження...
        </div>
      )}

      {collections && collections.length === 0 && (
        <p className="text-xs text-[var(--text-tertiary)]">Колекції групують сайти — конкурентів, референси, ідеї в одному місці замість закладок.</p>
      )}

      {collections && collections.length > 0 && (
        <div className="space-y-1.5">
          {collections.map(col => (
            <button
              key={col.id}
              onClick={() => loadItems(col)}
              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-white/5 transition-colors flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <FolderOpen size={13} style={{ color: "var(--lime)", flexShrink: 0 }} />
              <span className="text-xs truncate text-[var(--text-secondary)]">{col.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
