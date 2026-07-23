"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { Loader2, Sparkles, Heading2, List, CheckSquare, Type, Download, LayoutTemplate, Check, Image as ImageIcon, User } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { type Block, newBlockId, BlockAddButton, BlockRow } from "../BlockEditor";
import { exportDocToPdf } from "../exportPdf";
import { exportDocToMarkdown, exportDocToHtml } from "../exportText";
import { usePresence } from "../usePresence";
import { PresenceAvatars } from "../PresenceAvatars";
import { useLiveSync } from "../useLiveSync";
import { VersionHistoryButton } from "../VersionHistoryButton";
import { CrmContactPicker } from "../CrmContactPicker";

interface Props {
  docId: string;
  initialTitle: string;
  initialContent: { blocks: Block[] } | null;
  organizationId: string;
}

// Той самий фікс, що OfficeDocsListUI.tsx/CreatorBoardsListUI.tsx.
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

// MVP-редактор Qorax Office Docs (MODULE_ROADMAP.md, "Qorax Office").
// Свідомо вузький: 4 типи блоків (paragraph/heading/bullet_list/
// checklist), без таблиць/зображень/код-блоків/Smart Blocks з плану
// — ті лишаються майбутніми ітераціями. Автозбереження з дебаунсом,
// не окрема кнопка "Зберегти" — той самий принцип UX, що project_pages
// редактор Sites-конструктора.
export function DocEditorUI({ docId, initialTitle, initialContent, organizationId }: Props) {
  const presentUsers = usePresence("office_documents", docId);
  const [title, setTitle] = useState(initialTitle);
  const [blocks, setBlocks] = useState<Block[]>(initialContent?.blocks ?? []);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);
  const [showAiWriter, setShowAiWriter] = useState(false);
  const [showCrmPicker, setShowCrmPicker] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // notifySavedRef — useLiveSync() (нижче) повертає notifySaved, але
  // persist() визначено вище виклику useLiveSync і посилається на неї
  // до того, як хук встиг повернути реальну функцію — той самий
  // патерн "ref для уникнення stale/undefined closure", що вже
  // застосований у SheetEditorUI.tsx (formatsRef/chartsRef).
  const notifySavedRef = useRef<() => void>(() => {});
  const containerRef = useRef<HTMLDivElement>(null);

  const persist = useCallback(async (patch: { title?: string; content?: { blocks: Block[] } }) => {
    setSaving(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-documents/${docId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      notifySavedRef.current();
    } finally {
      setSaving(false);
    }
  }, [docId]);

  // Дебаунс — не слати запит на кожне натискання клавіші.
  const scheduleSave = useCallback((nextBlocks: Block[], nextTitle?: string) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      persist({ title: nextTitle, content: { blocks: nextBlocks } });
    }, 600);
  }, [persist]);

  useEffect(() => () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); }, []);

  const reloadFromServer = useCallback(async () => {
    if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/office-documents/${docId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.document) {
      setTitle(data.document.title);
      setBlocks(data.document.content?.blocks ?? []);
    }
  }, [docId]);

  const { pendingUpdate, applyPendingUpdate: applyPendingUpdateRaw, notifySaved } = useLiveSync("office_documents", docId, {
    isEditing: () => !!containerRef.current && containerRef.current.contains(document.activeElement),
    onRemoteUpdate: reloadFromServer,
  });
  useEffect(() => { notifySavedRef.current = notifySaved; }, [notifySaved]);

  // Захист від гонки: якщо на момент кліку "Оновити зараз" ще
  // "тікає" відкладений scheduleSave() від попереднього натискання
  // клавіші (600мс дебаунс), він міг би спрацювати ПІСЛЯ
  // reloadFromServer() і перезаписати щойно підтягнуті свіжі дані
  // застарілими локальними — скасовуємо таймер перед перезавантаженням.
  const applyPendingUpdate = useCallback(() => {
    if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
    applyPendingUpdateRaw();
  }, [applyPendingUpdateRaw]);

  function updateBlock(id: string, updater: (b: Block) => Block) {
    setBlocks(prev => {
      const next = prev.map(b => (b.id === id ? updater(b) : b));
      scheduleSave(next);
      return next;
    });
  }

  // smart_crm_contact виключено — потребує contactId, якого немає до
  // вибору в CrmContactPicker (addSmartCrmBlock нижче обробляє це окремо).
  function addBlock(type: Exclude<Block["type"], "smart_crm_contact">) {
    const id = newBlockId();
    const block: Block =
      type === "paragraph" ? { id, type, text: "" } :
      type === "heading" ? { id, type, level: 2, text: "" } :
      type === "bullet_list" ? { id, type, items: [""] } :
      type === "image" ? { id, type, url: "" } :
      { id, type, items: [{ text: "", checked: false }] };
    setBlocks(prev => {
      const next = [...prev, block];
      scheduleSave(next);
      return next;
    });
  }

  function addSmartCrmBlock(contactId: string) {
    const block: Block = { id: newBlockId(), type: "smart_crm_contact", contactId };
    setBlocks(prev => {
      const next = [...prev, block];
      scheduleSave(next);
      return next;
    });
    setShowCrmPicker(false);
  }

  function deleteBlock(id: string) {
    setBlocks(prev => {
      const next = prev.filter(b => b.id !== id);
      scheduleSave(next);
      return next;
    });
  }

  function onTitleBlur() {
    persist({ title });
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await exportDocToPdf(title || "Без назви", blocks);
    } finally {
      setExportingPdf(false);
    }
  }

  async function handleSaveAsTemplate() {
    setSavingTemplate(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/office-documents/${docId}/save-as-template`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (res.ok) {
        setTemplateSaved(true);
        setTimeout(() => setTemplateSaved(false), 2500);
      }
    } finally {
      setSavingTemplate(false);
    }
  }

  async function runAiWriter() {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/office-documents/${docId}/ai-writer`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInstruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiError(data.error ?? "Не вдалося згенерувати текст");
        return;
      }
      setBlocks(prev => {
        const next = [...prev, ...(data.blocks ?? [])];
        scheduleSave(next);
        return next;
      });
      setAiInstruction("");
      setShowAiWriter(false);
    } catch {
      setAiError("AI тимчасово недоступний");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div ref={containerRef} className="mx-auto max-w-3xl px-6 sm:px-8 py-10">
      {pendingUpdate && (
        <div className="rounded-xl px-4 py-2.5 mb-4 flex items-center justify-between gap-3 text-xs" style={{ background: "rgba(140,246,255,0.08)", border: "1px solid rgba(140,246,255,0.25)" }}>
          <span style={{ color: "var(--cyan)" }}>Хтось інший оновив цей документ, поки ви редагували.</span>
          <button onClick={applyPendingUpdate} className="font-medium underline shrink-0" style={{ color: "var(--cyan)" }}>
            Оновити зараз
          </button>
        </div>
      )}
      <div className="flex items-center justify-between mb-6">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={onTitleBlur}
          placeholder="Без назви"
          className="font-display text-2xl font-semibold bg-transparent outline-none flex-1 min-w-0"
        />
        <div className="flex items-center gap-3 shrink-0 ml-3">
          <PresenceAvatars users={presentUsers} />
          {saving && <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(v => !v)}
              disabled={exportingPdf}
              className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)] disabled:opacity-50"
            >
              {exportingPdf ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Експорт
            </button>
            {showExportMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowExportMenu(false)} />
                <div className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden z-20" style={{ background: "var(--bg)", border: "1px solid rgba(255,255,255,0.1)", minWidth: 140 }}>
                  <button onClick={() => { setShowExportMenu(false); handleExportPdf(); }} className="w-full text-left text-xs px-3 py-2 hover:bg-white/5">PDF</button>
                  <button onClick={() => { setShowExportMenu(false); exportDocToMarkdown(title || "Без назви", blocks); }} className="w-full text-left text-xs px-3 py-2 hover:bg-white/5">Markdown (.md)</button>
                  <button onClick={() => { setShowExportMenu(false); exportDocToHtml(title || "Без назви", blocks); }} className="w-full text-left text-xs px-3 py-2 hover:bg-white/5">HTML</button>
                </div>
              </>
            )}
          </div>
          <button
            onClick={handleSaveAsTemplate}
            disabled={savingTemplate}
            className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)] disabled:opacity-50"
          >
            {savingTemplate ? <Loader2 size={12} className="animate-spin" /> : templateSaved ? <Check size={12} style={{ color: "var(--lime)" }} /> : <LayoutTemplate size={12} />}
            {templateSaved ? "Збережено" : "Як шаблон"}
          </button>
          <VersionHistoryButton docType="office_documents" docId={docId} onRestored={reloadFromServer} />
          <button
            onClick={() => setShowAiWriter(v => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: "rgba(198,255,84,0.08)", border: "1px solid rgba(198,255,84,0.25)", color: "var(--lime)" }}
          >
            <Sparkles size={12} /> AI Writer
          </button>
        </div>
      </div>

      {showAiWriter && (
        <div className="glow-card p-4 mb-6 space-y-2">
          <textarea
            autoFocus
            value={aiInstruction}
            onChange={e => setAiInstruction(e.target.value)}
            placeholder="Наприклад: напиши вступ про переваги нашої послуги, або: зроби короткий висновок"
            rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          {aiError && <p className="text-xs" style={{ color: "#ff6b6b" }}>{aiError}</p>}
          <div className="flex items-center gap-2">
            <button
              onClick={runAiWriter}
              disabled={aiLoading || !aiInstruction.trim()}
              className="glow-button text-xs !py-1.5 !px-3 disabled:opacity-50 flex items-center gap-1.5"
            >
              {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              Згенерувати й додати в кінець
            </button>
            <button onClick={() => setShowAiWriter(false)} className="text-xs text-[var(--text-tertiary)] px-2">
              Скасувати
            </button>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {blocks.map(block => (
          <BlockRow key={block.id} block={block} onChange={updater => updateBlock(block.id, updater)} onDelete={() => deleteBlock(block.id)} />
        ))}
      </div>

      {blocks.length === 0 && (
        <div className="text-center py-12 text-sm text-[var(--text-tertiary)]">
          Порожній документ. Додайте блок нижче або скористайтесь AI Writer.
        </div>
      )}

      <div className="flex items-center gap-1.5 mt-6 pt-4" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <BlockAddButton icon={Type} label="Текст" onClick={() => addBlock("paragraph")} />
        <BlockAddButton icon={Heading2} label="Заголовок" onClick={() => addBlock("heading")} />
        <BlockAddButton icon={List} label="Список" onClick={() => addBlock("bullet_list")} />
        <BlockAddButton icon={CheckSquare} label="Чек-лист" onClick={() => addBlock("checklist")} />
        <BlockAddButton icon={ImageIcon} label="Зображення" onClick={() => addBlock("image")} />
        <BlockAddButton icon={User} label="CRM-контакт" onClick={() => setShowCrmPicker(true)} />
      </div>

      {showCrmPicker && (
        <CrmContactPicker organizationId={organizationId} onSelect={addSmartCrmBlock} onClose={() => setShowCrmPicker(false)} />
      )}
    </div>
  );
}
