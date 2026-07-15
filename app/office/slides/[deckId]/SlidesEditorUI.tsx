"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, Loader2, Sparkles, Trash2, Type, Heading2, List, CheckSquare, Play, X, ChevronLeft, ChevronRight } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { type Block, newBlockId, BlockAddButton, BlockRow, BlockStatic } from "../../BlockEditor";

interface Slide {
  id: string;
  blocks: Block[];
}

interface Props {
  deckId: string;
  initialTitle: string;
  initialSlides: Slide[] | null;
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

function slideLabel(slide: Slide, index: number): string {
  const heading = slide.blocks.find(b => b.type === "heading");
  return heading && "text" in heading && heading.text ? heading.text : `Слайд ${index + 1}`;
}

// MVP-редактор Qorax Office Slides (MODULE_ROADMAP.md, "Qorax
// Office"). Кожен слайд — той самий блочний редактор, що Docs
// (BlockEditor.tsx, спільний), обгорнутий у пагінацію: лівий
// сайдбар з мініатюрами замість суцільного скролу. Present-режим —
// fullscreen, read-only (BlockStatic), навігація стрілками.
export function SlidesEditorUI({ deckId, initialTitle, initialSlides }: Props) {
  const [title, setTitle] = useState(initialTitle);
  const [slides, setSlides] = useState<Slide[]>(initialSlides?.length ? initialSlides : [{ id: newBlockId(), blocks: [] }]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [showAi, setShowAi] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (patch: { title?: string; slides?: Slide[] }) => {
    setSaving(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-slides/${deckId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } finally {
      setSaving(false);
    }
  }, [deckId]);

  const scheduleSave = useCallback((nextSlides: Slide[]) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => persist({ slides: nextSlides }), 600);
  }, [persist]);

  useEffect(() => () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); }, []);

  function updateActiveSlideBlocks(updater: (blocks: Block[]) => Block[]) {
    setSlides(prev => {
      const next = prev.map((s, i) => (i === activeIndex ? { ...s, blocks: updater(s.blocks) } : s));
      scheduleSave(next);
      return next;
    });
  }

  function addBlock(type: Block["type"]) {
    const id = newBlockId();
    const block: Block =
      type === "paragraph" ? { id, type, text: "" } :
      type === "heading" ? { id, type, level: 2, text: "" } :
      type === "bullet_list" ? { id, type, items: [""] } :
      { id, type, items: [{ text: "", checked: false }] };
    updateActiveSlideBlocks(blocks => [...blocks, block]);
  }

  function addSlide() {
    setSlides(prev => {
      const next = [...prev, { id: newBlockId(), blocks: [] }];
      scheduleSave(next);
      return next;
    });
    setActiveIndex(slides.length);
  }

  function deleteSlide(index: number, e: React.MouseEvent) {
    e.stopPropagation();
    if (slides.length <= 1) return;
    setSlides(prev => {
      const next = prev.filter((_, i) => i !== index);
      scheduleSave(next);
      return next;
    });
    setActiveIndex(i => Math.max(0, Math.min(i, slides.length - 2)));
  }

  async function runAiGenerate() {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/office-slides/${deckId}/ai-generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInstruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error ?? "Не вдалося згенерувати презентацію"); return; }
      // AI Slide Generator замінює ВСІ слайди (не додає в кінець, як AI
      // Writer у Docs) — презентація цілісна структура, докладніше в
      // officeSlidesHandler.ts.
      setSlides(data.slides);
      setActiveIndex(0);
      scheduleSave(data.slides);
      setAiInstruction("");
      setShowAi(false);
    } catch {
      setAiError("AI тимчасово недоступний");
    } finally {
      setAiLoading(false);
    }
  }

  function startPresenting() {
    setPresentIndex(activeIndex);
    setPresenting(true);
  }

  useEffect(() => {
    if (!presenting) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setPresenting(false);
      else if (e.key === "ArrowRight" || e.key === " ") setPresentIndex(i => Math.min(slides.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setPresentIndex(i => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [presenting, slides.length]);

  const activeSlide = slides[activeIndex];

  if (presenting) {
    const slide = slides[presentIndex];
    return (
      <div className="fixed inset-0 z-50 flex flex-col" style={{ background: "#0a0a0a" }}>
        <button onClick={() => setPresenting(false)} className="absolute top-4 right-4 p-2 rounded-lg hover:bg-white/10 text-white/60 z-10">
          <X size={18} />
        </button>
        <div className="flex-1 flex flex-col items-start justify-center px-24 gap-6 max-w-5xl mx-auto w-full">
          {slide.blocks.map(b => <BlockStatic key={b.id} block={b} />)}
          {slide.blocks.length === 0 && <p className="text-white/30">Порожній слайд</p>}
        </div>
        <div className="pb-6 flex items-center justify-center gap-4 text-white/50 text-sm">
          <button onClick={() => setPresentIndex(i => Math.max(0, i - 1))} disabled={presentIndex === 0} className="disabled:opacity-30"><ChevronLeft size={18} /></button>
          {presentIndex + 1} / {slides.length}
          <button onClick={() => setPresentIndex(i => Math.min(slides.length - 1, i + 1))} disabled={presentIndex === slides.length - 1} className="disabled:opacity-30"><ChevronRight size={18} /></button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex">
      <aside className="w-48 shrink-0 overflow-y-auto p-3 space-y-2" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        {slides.map((slide, i) => (
          <button
            key={slide.id}
            onClick={() => setActiveIndex(i)}
            className="w-full text-left rounded-lg p-2.5 group relative transition-colors"
            style={i === activeIndex ? { background: "rgba(198,255,84,0.08)", border: "1px solid rgba(198,255,84,0.3)" } : { border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="text-[10px] text-[var(--text-tertiary)] mb-0.5">{i + 1}</div>
            <div className="text-xs truncate pr-4">{slideLabel(slide, i)}</div>
            {slides.length > 1 && (
              <span
                onClick={e => deleteSlide(i, e)}
                role="button"
                aria-label="Видалити слайд"
                className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-white/10"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Trash2 size={10} />
              </span>
            )}
          </button>
        ))}
        <button onClick={addSlide} className="w-full text-xs px-2.5 py-2 rounded-lg flex items-center justify-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)]">
          <Plus size={12} /> Слайд
        </button>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => persist({ title })}
            placeholder="Без назви"
            className="font-display text-lg font-semibold bg-transparent outline-none min-w-0"
          />
          <div className="flex items-center gap-2">
            {saving && <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />}
            <button onClick={() => setShowAi(v => !v)} className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5" style={{ background: "rgba(198,255,84,0.08)", border: "1px solid rgba(198,255,84,0.25)", color: "var(--lime)" }}>
              <Sparkles size={12} /> AI
            </button>
            <button onClick={startPresenting} className="glow-button text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <Play size={12} /> Показати
            </button>
          </div>
        </div>

        {showAi && (
          <div className="px-4 sm:px-6 py-3 space-y-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs text-[var(--text-tertiary)]">Замінить усі слайди новою структурою</p>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={aiInstruction}
                onChange={e => setAiInstruction(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") runAiGenerate(); }}
                placeholder="Наприклад: презентація для інвестора про наш SaaS-продукт"
                className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              />
              <button onClick={runAiGenerate} disabled={aiLoading || !aiInstruction.trim()} className="glow-button text-xs !py-2 !px-3 disabled:opacity-50 flex items-center gap-1.5 shrink-0">
                {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Згенерувати
              </button>
            </div>
            {aiError && <p className="text-xs" style={{ color: "#ff6b6b" }}>{aiError}</p>}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-8 sm:px-16 py-10">
          <div className="max-w-2xl mx-auto space-y-3">
            {activeSlide.blocks.map(block => (
              <BlockRow
                key={block.id}
                block={block}
                onChange={updater => updateActiveSlideBlocks(blocks => blocks.map(b => (b.id === block.id ? updater(b) : b)))}
                onDelete={() => updateActiveSlideBlocks(blocks => blocks.filter(b => b.id !== block.id))}
              />
            ))}
            {activeSlide.blocks.length === 0 && (
              <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
                Порожній слайд. Додайте блок нижче або скористайтесь AI.
              </div>
            )}

            <div className="flex items-center gap-1.5 mt-6 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <BlockAddButton icon={Type} label="Текст" onClick={() => addBlock("paragraph")} />
              <BlockAddButton icon={Heading2} label="Заголовок" onClick={() => addBlock("heading")} />
              <BlockAddButton icon={List} label="Список" onClick={() => addBlock("bullet_list")} />
              <BlockAddButton icon={CheckSquare} label="Чек-лист" onClick={() => addBlock("checklist")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
