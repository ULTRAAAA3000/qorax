"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Sparkles, X, CheckCircle2, FileEdit, Globe } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface ProjectLanguage {
  id: string;
  locale: string;
  is_default: boolean;
  url_prefix: string | null;
}

interface ProjectPage {
  id: string;
  slug: string;
  seo_title: string | null;
  seo_description: string | null;
}

interface Translation {
  id: string;
  project_page_id: string;
  locale: string;
  title: string | null;
  description: string | null;
  status: string;
  translated_by: string;
}

interface Props {
  projectId: string;
  projectName: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof FileEdit }> = {
  draft: { label: "Чернетка (AI)", color: "var(--text-tertiary)", icon: FileEdit },
  reviewed: { label: "Перевірено", color: "var(--lime)", icon: CheckCircle2 },
  published: { label: "Опубліковано", color: "var(--lime)", icon: Globe },
};

const COMMON_LOCALES = ["en", "de", "fr", "es", "pl", "it", "pt", "nl", "ru", "tr"];

// getFreshToken()/getAuthHeaders() — той самий патерн, що вже
// застосовано в AgentsTab.tsx/AutomationsTab.tsx (Qorax AI хаб) і
// доданий заднім числом до Sites-конструктора (коміт
// "fix(sites-builder): виправлено протухлий JWT-токен"): дістає
// токен із живої Supabase-сесії ПЕРЕД кожним запитом, з авто-
// рефрешем, замість одного статичного пропа з серверного рендеру,
// який протухає через ~1 годину життя JWT. Написано одразу так у
// Translator, щоб не повторити той самий баг-клас.
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

export function TranslatorDetailUI({ projectId, projectName }: Props) {
  const [languages, setLanguages] = useState<ProjectLanguage[] | null>(null);
  const [pages, setPages] = useState<ProjectPage[] | null>(null);
  const [translations, setTranslations] = useState<Translation[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showAddLang, setShowAddLang] = useState(false);
  const [newLocale, setNewLocale] = useState("");
  const [addingLang, setAddingLang] = useState(false);

  const [translatingKey, setTranslatingKey] = useState<string | null>(null);
  const [editingTranslation, setEditingTranslation] = useState<Translation | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const token = await getFreshToken();
    return { Authorization: `Bearer ${token}` };
  }

  const loadLanguages = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/languages`, { headers });
      const data = await res.json();
      setLanguages(data.languages ?? []);
    } catch {
      setLanguages([]);
    }
  }, [projectId]);

  const loadPages = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, { headers });
      const data = await res.json();
      setPages((data.pages ?? []).map((p: { id: string; slug: string; seo_title: string | null; seo_description: string | null }) => ({
        id: p.id, slug: p.slug, seo_title: p.seo_title, seo_description: p.seo_description,
      })));
    } catch {
      setPages([]);
    }
  }, [projectId]);

  const loadTranslations = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/translations`, { headers });
      const data = await res.json();
      setTranslations(data.translations ?? []);
    } catch {
      setTranslations([]);
    }
  }, [projectId]);

  useEffect(() => {
    loadLanguages();
    loadPages();
    loadTranslations();
  }, [loadLanguages, loadPages, loadTranslations]);

  async function addLanguage(e: React.FormEvent) {
    e.preventDefault();
    if (!newLocale.trim()) return;
    setAddingLang(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/languages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewLocale("");
      setShowAddLang(false);
      await loadLanguages();
    } finally {
      setAddingLang(false);
    }
  }

  async function removeLanguage(languageId: string) {
    if (!confirm("Видалити цю мову? Усі переклади на неї залишаться в базі, але сайт перестане показувати перемикач мови.")) return;
    try {
      const headers = await getAuthHeaders();
      await fetch(`${API_BASE_URL}/api/projects/${projectId}/languages/${languageId}`, {
        method: "DELETE",
        headers,
      });
      await loadLanguages();
    } catch { /* ignore */ }
  }

  async function translatePage(pageId: string, locale: string) {
    const key = `${pageId}:${locale}`;
    setTranslatingKey(key);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/translate`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ project_page_id: pageId, locale }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка перекладу"); return; }
      await loadTranslations();
    } finally {
      setTranslatingKey(null);
    }
  }

  function openEdit(translation: Translation) {
    setEditingTranslation(translation);
    setEditTitle(translation.title ?? "");
    setEditDescription(translation.description ?? "");
  }

  async function saveEdit() {
    if (!editingTranslation) return;
    setSavingEdit(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/translations/${editingTranslation.id}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ title: editTitle, description: editDescription }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка збереження"); return; }
      setEditingTranslation(null);
      await loadTranslations();
    } finally {
      setSavingEdit(false);
    }
  }

  const inputStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" };

  if (languages === null || pages === null || translations === null) {
    return <div className="glow-card p-10 text-center"><Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} /></div>;
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold">{projectName}</h1>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* ── Підключені мови ── */}
      <div className="glow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Мови</h2>
          {!showAddLang && (
            <button onClick={() => setShowAddLang(true)} className="glow-button text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <Plus size={12} /> Додати мову
            </button>
          )}
        </div>

        {showAddLang && (
          <form onSubmit={addLanguage} className="space-y-2 p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
            <div className="flex flex-wrap gap-1.5">
              {COMMON_LOCALES.filter(l => !languages.some(pl => pl.locale === l)).map(l => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setNewLocale(l)}
                  className="text-xs px-2.5 py-1 rounded-lg"
                  style={{
                    background: newLocale === l ? "rgba(140,246,255,0.1)" : "rgba(255,255,255,0.03)",
                    border: newLocale === l ? "1px solid var(--cyan)" : "1px solid rgba(255,255,255,0.06)",
                    color: newLocale === l ? "var(--cyan)" : "var(--text-secondary)",
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <input
              value={newLocale}
              onChange={e => setNewLocale(e.target.value)}
              placeholder="або введіть код мови вручну (напр. 'en')"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={addingLang || !newLocale.trim()} className="glow-button text-sm !py-2 !px-4">
                {addingLang ? <Loader2 size={14} className="animate-spin" /> : "Додати"}
              </button>
              <button type="button" onClick={() => setShowAddLang(false)} className="text-sm text-[var(--text-tertiary)]">Скасувати</button>
            </div>
          </form>
        )}

        {languages.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Ще немає підключених мов.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {languages.map(lang => (
              <div key={lang.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs" style={{ background: "rgba(255,255,255,0.02)" }}>
                <span>{lang.locale}{lang.is_default && " (за замовч.)"}</span>
                {!lang.is_default && (
                  <button onClick={() => removeLanguage(lang.id)} style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Сторінки й переклади ── */}
      {languages.length === 0 ? (
        <div className="glow-card p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">Додайте хоча б одну мову, щоб почати перекладати сторінки.</p>
        </div>
      ) : pages.length === 0 ? (
        <div className="glow-card p-10 text-center">
          <p className="text-sm text-[var(--text-secondary)]">У цьому проекті ще немає сторінок.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pages.map(page => (
            <div key={page.id} className="glow-card p-4 space-y-2">
              <p className="text-sm font-semibold">/{page.slug}</p>
              <div className="space-y-1.5">
                {languages.filter(l => !l.is_default).map(lang => {
                  const translation = translations.find(t => t.project_page_id === page.id && t.locale === lang.locale);
                  const key = `${page.id}:${lang.locale}`;
                  const isTranslating = translatingKey === key;
                  const meta = translation ? (STATUS_META[translation.status] ?? STATUS_META.draft) : null;
                  const StatusIcon = meta?.icon;

                  return (
                    <div key={lang.locale} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>{lang.locale}</span>
                        {translation ? (
                          <button onClick={() => openEdit(translation)} className="text-xs truncate text-left hover:underline">
                            {translation.title || "(без заголовка)"}
                          </button>
                        ) : (
                          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Ще не перекладено</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {meta && StatusIcon && (
                          <span className="flex items-center gap-1 text-xs" style={{ color: meta.color }}>
                            <StatusIcon size={11} /> {meta.label}
                          </span>
                        )}
                        <button
                          onClick={() => translatePage(page.id, lang.locale)}
                          disabled={isTranslating}
                          className="text-xs px-2.5 py-1 rounded-lg flex items-center gap-1"
                          style={{ border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }}
                        >
                          {isTranslating ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                          {translation ? "Перекласти знову" : "Перекласти AI"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Редагування перекладу ── */}
      {editingTranslation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="glow-card p-4 space-y-3 w-full max-w-md">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Редагувати переклад ({editingTranslation.locale})</h3>
              <button onClick={() => setEditingTranslation(null)}><X size={14} style={{ color: "var(--text-tertiary)" }} /></button>
            </div>
            <input value={editTitle} onChange={e => setEditTitle(e.target.value)} placeholder="Title" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
            <textarea value={editDescription} onChange={e => setEditDescription(e.target.value)} placeholder="Description" rows={3} className="w-full rounded-lg px-3 py-2 text-sm resize-none" style={inputStyle} />
            <div className="flex items-center gap-2">
              <button onClick={saveEdit} disabled={savingEdit} className="glow-button text-sm !py-2 !px-4">
                {savingEdit ? <Loader2 size={14} className="animate-spin" /> : "Зберегти й позначити перевіреним"}
              </button>
              <button onClick={() => setEditingTranslation(null)} className="text-sm text-[var(--text-tertiary)]">Скасувати</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
