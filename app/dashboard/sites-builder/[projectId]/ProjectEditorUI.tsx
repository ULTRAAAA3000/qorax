"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, Globe, GlobeLock, Save, X, ExternalLink, ChevronUp, ChevronDown } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Block {
  type: string;
  heading?: string;
  subheading?: string;
  body?: string;
  cta_text?: string;
  cta_href?: string;
  image_url?: string;
  alt?: string;
  items?: Array<{ question: string; answer: string }>;
}

interface ProjectPage {
  id: string;
  project_id: string;
  slug: string;
  content: { blocks?: Block[] };
  seo_title: string | null;
  seo_description: string | null;
  updated_at: string;
}

interface ProjectData {
  id: string;
  name: string;
  status: string;
}

interface Props {
  projectId: string;
}

const BLOCK_TYPES: Array<{ type: string; label: string }> = [
  { type: "hero", label: "Заголовок (Hero)" },
  { type: "text", label: "Текстовий блок" },
  { type: "image", label: "Зображення" },
  { type: "cta", label: "Заклик до дії" },
  { type: "faq", label: "Питання-відповіді" },
];

function emptyBlock(type: string): Block {
  if (type === "faq") return { type, heading: "Часті питання", items: [{ question: "", answer: "" }] };
  if (type === "image") return { type, image_url: "", alt: "" };
  if (type === "cta" || type === "hero") return { type, heading: "", subheading: "", cta_text: "", cta_href: "" };
  return { type, heading: "", body: "" };
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

export function ProjectEditorUI({ projectId }: Props) {
  const [project, setProject] = useState<ProjectData | null>(null);
  const [pages, setPages] = useState<ProjectPage[] | null>(null);
  const [activePageId, setActivePageId] = useState<string | null>(null);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [showNewPage, setShowNewPage] = useState(false);
  const [newPageSlug, setNewPageSlug] = useState("");

  // ВАЖЛИВО: не кешувати authHeaders одним об'єктом на весь час життя
  // компонента — Supabase JWT живе ~1 годину, а сторінка редактора може
  // лишатись відкритою довше. Раніше тут був статичний accessToken-проп
  // з серверного рендеру (page.tsx), що протухав і давав 401
  // "Unauthorized" на дії типу "додати сторінку" без зрозумілої причини
  // для користувача. getAuthHeaders() дістає свіжий токен (з
  // авто-рефрешем через Supabase client) перед КОЖНИМ запитом — той
  // самий патерн, що вже використаний в AgentsTab.tsx/AutomationsTab.tsx
  // (Qorax AI хаб) і RankDetailUI.tsx.
  async function getAuthHeaders(): Promise<Record<string, string>> {
    const token = await getFreshToken();
    return { Authorization: `Bearer ${token}` };
  }

  const loadProject = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}`, { headers });
      if (!res.ok) { setNotFound(true); return; }
      const data = await res.json();
      setProject(data.project);
      setPages(data.pages ?? []);
      if (data.pages?.length && !activePageId) {
        selectPage(data.pages[0]);
      }
    } catch {
      setNotFound(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => { loadProject(); }, [loadProject]);

  function selectPage(page: ProjectPage) {
    setActivePageId(page.id);
    setBlocks(page.content?.blocks ?? []);
    setSeoTitle(page.seo_title ?? "");
    setSeoDescription(page.seo_description ?? "");
    setDirty(false);
  }

  function switchPage(page: ProjectPage) {
    if (dirty && !confirm("Незбережені зміни буде втрачено. Продовжити?")) return;
    selectPage(page);
  }

  function updateBlock(index: number, patch: Partial<Block>) {
    setBlocks(prev => prev.map((b, i) => (i === index ? { ...b, ...patch } : b)));
    setDirty(true);
  }

  function addBlock(type: string) {
    setBlocks(prev => [...prev, emptyBlock(type)]);
    setDirty(true);
  }

  function removeBlock(index: number) {
    setBlocks(prev => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function moveBlock(index: number, direction: -1 | 1) {
    setBlocks(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setDirty(true);
  }

  async function savePage() {
    if (!activePageId) return;
    setSaving(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/pages/${activePageId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ content: { blocks }, seo_title: seoTitle, seo_description: seoDescription }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка збереження"); return; }
      setDirty(false);
      await loadProject();
    } finally {
      setSaving(false);
    }
  }

  async function createPage(e: React.FormEvent) {
    e.preventDefault();
    if (!newPageSlug.trim()) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/pages`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ slug: newPageSlug.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewPageSlug("");
      setShowNewPage(false);
      await loadProject();
    } catch {
      setError("Мережева помилка");
    }
  }

  async function deletePage(pageId: string) {
    if (!confirm("Видалити цю сторінку?")) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/pages/${pageId}`, {
        method: "DELETE",
        headers,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setActivePageId(null);
      await loadProject();
    } catch {
      setError("Мережева помилка");
    }
  }

  async function togglePublish() {
    if (dirty && !confirm("Спочатку збережіть зміни. Опублікувати без збереження?")) return;
    setPublishing(true);
    setError(null);
    try {
      const action = project?.status === "published" ? "unpublish" : "publish";
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/projects/${projectId}/${action}`, {
        method: "POST",
        headers,
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      await loadProject();
    } finally {
      setPublishing(false);
    }
  }

  const inputStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" };

  if (notFound) {
    return <div className="glow-card p-10 text-center"><p className="text-sm text-[var(--text-secondary)]">Проект не знайдено.</p></div>;
  }

  if (!project || pages === null) {
    return <div className="glow-card p-10 text-center"><Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl font-semibold mb-1">{project.name}</h1>
          <span className="text-xs" style={{ color: project.status === "published" ? "var(--lime)" : "var(--text-tertiary)" }}>
            {project.status === "published" ? "Опубліковано" : "Чернетка"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {project.status === "published" && (
            <a href={`/sites-builder/preview/${projectId}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg" style={{ border: "1px solid rgba(255,255,255,0.1)", color: "var(--text-secondary)" }}>
              <ExternalLink size={13} /> Переглянути
            </a>
          )}
          <button onClick={togglePublish} disabled={publishing} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
            {publishing ? <Loader2 size={14} className="animate-spin" /> : project.status === "published" ? <><GlobeLock size={14} /> Зняти з публікації</> : <><Globe size={14} /> Опублікувати</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        {/* ── Список сторінок ── */}
        <div className="space-y-1">
          {pages.map(page => (
            <div key={page.id} className="flex items-center gap-1">
              <button
                onClick={() => switchPage(page)}
                className="flex-1 text-left px-3 py-2 rounded-lg text-sm truncate transition-colors"
                style={{
                  background: activePageId === page.id ? "rgba(140,246,255,0.08)" : "transparent",
                  color: activePageId === page.id ? "var(--cyan)" : "var(--text-secondary)",
                }}
              >
                /{page.slug}
              </button>
              {pages.length > 1 && (
                <button onClick={() => deletePage(page.id)} className="shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}

          {!showNewPage ? (
            <button onClick={() => setShowNewPage(true)} className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
              <Plus size={13} /> Сторінка
            </button>
          ) : (
            <form onSubmit={createPage} className="space-y-1.5 px-1">
              <input
                value={newPageSlug}
                onChange={e => setNewPageSlug(e.target.value)}
                placeholder="slug"
                className="w-full rounded-lg px-2 py-1.5 text-xs"
                style={inputStyle}
                autoFocus
              />
              <div className="flex items-center gap-1">
                <button type="submit" className="text-xs px-2 py-1 rounded" style={{ color: "var(--cyan)" }}>Додати</button>
                <button type="button" onClick={() => setShowNewPage(false)} className="text-xs px-2 py-1" style={{ color: "var(--text-tertiary)" }}>Скасувати</button>
              </div>
            </form>
          )}
        </div>

        {/* ── Редактор блоків ── */}
        {activePageId && (
          <div className="space-y-4">
            <div className="glow-card p-3 space-y-2">
              <input
                value={seoTitle}
                onChange={e => { setSeoTitle(e.target.value); setDirty(true); }}
                placeholder="SEO заголовок сторінки"
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={inputStyle}
              />
              <textarea
                value={seoDescription}
                onChange={e => { setSeoDescription(e.target.value); setDirty(true); }}
                placeholder="SEO опис (для пошукових систем)"
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                style={inputStyle}
              />
            </div>

            <div className="space-y-3">
              {blocks.map((block, i) => (
                <BlockEditor
                  key={i}
                  block={block}
                  onChange={patch => updateBlock(i, patch)}
                  onRemove={() => removeBlock(i)}
                  onMoveUp={i > 0 ? () => moveBlock(i, -1) : undefined}
                  onMoveDown={i < blocks.length - 1 ? () => moveBlock(i, 1) : undefined}
                  inputStyle={inputStyle}
                />
              ))}

              {blocks.length === 0 && (
                <div className="glow-card p-6 text-center">
                  <p className="text-sm text-[var(--text-secondary)]">Сторінка порожня — додайте перший блок.</p>
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {BLOCK_TYPES.map(bt => (
                <button key={bt.type} onClick={() => addBlock(bt.type)} className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1" style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}>
                  <Plus size={11} /> {bt.label}
                </button>
              ))}
            </div>

            <div className="sticky bottom-4 flex justify-end">
              <button onClick={savePage} disabled={!dirty || saving} className="glow-button text-sm !py-2 !px-5 flex items-center gap-1.5 disabled:opacity-40">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <><Save size={14} /> {dirty ? "Зберегти зміни" : "Збережено"}</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockEditor({
  block,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  inputStyle,
}: {
  block: Block;
  onChange: (patch: Partial<Block>) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  inputStyle: React.CSSProperties;
}) {
  const typeLabel = BLOCK_TYPES.find(bt => bt.type === block.type)?.label ?? block.type;

  return (
    <div className="glow-card p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium" style={{ color: "var(--cyan)" }}>{typeLabel}</span>
        <div className="flex items-center gap-1">
          {onMoveUp && <button onClick={onMoveUp} style={{ color: "var(--text-tertiary)" }}><ChevronUp size={13} /></button>}
          {onMoveDown && <button onClick={onMoveDown} style={{ color: "var(--text-tertiary)" }}><ChevronDown size={13} /></button>}
          <button onClick={onRemove} style={{ color: "var(--text-tertiary)" }}><Trash2 size={13} /></button>
        </div>
      </div>

      {(block.type === "hero" || block.type === "cta") && (
        <>
          <input value={block.heading ?? ""} onChange={e => onChange({ heading: e.target.value })} placeholder="Заголовок" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          {block.type === "hero" && (
            <input value={block.subheading ?? ""} onChange={e => onChange({ subheading: e.target.value })} placeholder="Підзаголовок" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input value={block.cta_text ?? ""} onChange={e => onChange({ cta_text: e.target.value })} placeholder="Текст кнопки" className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
            <input value={block.cta_href ?? ""} onChange={e => onChange({ cta_href: e.target.value })} placeholder="Посилання (#contact)" className="rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          </div>
        </>
      )}

      {block.type === "text" && (
        <>
          <input value={block.heading ?? ""} onChange={e => onChange({ heading: e.target.value })} placeholder="Заголовок" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <textarea value={block.body ?? ""} onChange={e => onChange({ body: e.target.value })} placeholder="Текст" rows={4} className="w-full rounded-lg px-3 py-2 text-sm resize-none" style={inputStyle} />
        </>
      )}

      {block.type === "image" && (
        <>
          <input value={block.image_url ?? ""} onChange={e => onChange({ image_url: e.target.value })} placeholder="URL зображення" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          <input value={block.alt ?? ""} onChange={e => onChange({ alt: e.target.value })} placeholder="Alt-текст" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
        </>
      )}

      {block.type === "faq" && (
        <>
          <input value={block.heading ?? ""} onChange={e => onChange({ heading: e.target.value })} placeholder="Заголовок секції" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
          {(block.items ?? []).map((item, i) => (
            <div key={i} className="space-y-1.5 p-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
              <input
                value={item.question}
                onChange={e => {
                  const items = [...(block.items ?? [])];
                  items[i] = { ...items[i], question: e.target.value };
                  onChange({ items });
                }}
                placeholder="Питання"
                className="w-full rounded-lg px-2 py-1.5 text-xs"
                style={inputStyle}
              />
              <textarea
                value={item.answer}
                onChange={e => {
                  const items = [...(block.items ?? [])];
                  items[i] = { ...items[i], answer: e.target.value };
                  onChange({ items });
                }}
                placeholder="Відповідь"
                rows={2}
                className="w-full rounded-lg px-2 py-1.5 text-xs resize-none"
                style={inputStyle}
              />
            </div>
          ))}
          <button
            onClick={() => onChange({ items: [...(block.items ?? []), { question: "", answer: "" }] })}
            className="text-xs px-2 py-1 rounded flex items-center gap-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            <Plus size={11} /> Питання
          </button>
        </>
      )}
    </div>
  );
}
