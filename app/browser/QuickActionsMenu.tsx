"use client";

import { useState, useRef, useEffect } from "react";
import { Zap, ScanSearch, Bookmark, Languages, FileStack, ListChecks, Palette, Mail, Loader2, X, Scale } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { AiCompareModal } from "./AiCompareModal";

interface Props {
  organizationId: string;
  currentUrl: string;
  getFreshToken: () => Promise<string>;
  onAnalyze: () => void;
  onSaveToCollection: () => void;
}

type ResultKind = "translate" | "summarize" | null;

// QuickActionsMenu — One Click Actions (MODULE_ROADMAP.md, "Qorax
// Browser" — п'ята ітерація). Правий клік всередині iframe
// недоступний з батьківської сторінки (cross-origin, той самий
// блокер, що вже задокументовано для Smart Capture) — тому це не
// класичне ПКМ-меню, а випадне меню з toolbar. Analyze SEO/Save to
// Project не роблять нових запитів тут — лише перемикають існуючі
// AI Sidebar/Collections таби (onAnalyze/onSaveToCollection пропси).
// Create Design (Creator) і Generate Email (Mail) — неактивні
// "скоро", той самий підхід, що Smart Capture.
export function QuickActionsMenu({ organizationId, currentUrl, getFreshToken, onAnalyze, onSaveToCollection }: Props) {
  const [open, setOpen] = useState(false);
  const [resultKind, setResultKind] = useState<ResultKind>(null);
  const [resultText, setResultText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showCompare, setShowCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function runAiAction(kind: "translate" | "summarize") {
    setOpen(false);
    setResultKind(kind);
    setResultText(null);
    setError(null);
    setLoading(true);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/${kind}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, url: currentUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося виконати дію");
        return;
      }
      setResultText(kind === "translate" ? data.translation : data.summary);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  async function addTask() {
    setOpen(false);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/tasks`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ description: `Переглянути сайт: ${currentUrl}` }),
      });
    } catch {
      // тиха відмова — задача не критична, не варто перекривати
      // перегляд сайту через помилку створення задачі
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
        style={{ background: open ? "rgba(198,255,84,0.1)" : "rgba(255,255,255,0.04)", color: open ? "var(--lime)" : "var(--text-tertiary)" }}
      >
        <Zap size={12} /> Дії
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1.5 w-56 rounded-xl p-1.5 z-10 shadow-2xl"
          style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
        >
          <ActionItem icon={ScanSearch} label="Analyze SEO" onClick={() => { setOpen(false); onAnalyze(); }} />
          <ActionItem icon={Bookmark} label="Save to Project" onClick={() => { setOpen(false); onSaveToCollection(); }} />
          <ActionItem icon={Scale} label="AI Compare" onClick={() => { setOpen(false); setShowCompare(true); }} />
          <ActionItem icon={Languages} label="Translate" onClick={() => runAiAction("translate")} />
          <ActionItem icon={FileStack} label="Summarize" onClick={() => runAiAction("summarize")} />
          <ActionItem icon={ListChecks} label="Add Task" onClick={addTask} />
          <div className="my-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }} />
          <ActionItem icon={Palette} label="Create Design" disabled note="Creator — скоро" />
          <ActionItem icon={Mail} label="Generate Email" disabled note="Mail — скоро" />
        </div>
      )}

      {showCompare && (
        <AiCompareModal
          organizationId={organizationId}
          competitorUrl={currentUrl}
          getFreshToken={getFreshToken}
          onClose={() => setShowCompare(false)}
        />
      )}

      {resultKind && (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center p-6"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={() => setResultKind(null)}
        >
          <div
            className="w-full max-w-lg max-h-[70vh] overflow-y-auto rounded-2xl p-5"
            style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium flex items-center gap-2">
                {resultKind === "translate" ? <Languages size={14} style={{ color: "var(--cyan)" }} /> : <FileStack size={14} style={{ color: "var(--lime)" }} />}
                {resultKind === "translate" ? "Переклад сторінки" : "Короткий зміст"}
              </h3>
              <button onClick={() => setResultKind(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                <X size={15} />
              </button>
            </div>
            {loading && (
              <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)] py-4">
                <Loader2 size={13} className="animate-spin" /> Виконую...
              </div>
            )}
            {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}
            {resultText && <p className="text-sm leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{resultText}</p>}
          </div>
        </div>
      )}
    </div>
  );
}

function ActionItem({ icon: Icon, label, onClick, disabled, note }: { icon: typeof Zap; label: string; onClick?: () => void; disabled?: boolean; note?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors disabled:opacity-40"
      style={{ color: "var(--text-secondary)" }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
    >
      <span className="flex items-center gap-2">
        <Icon size={13} /> {label}
      </span>
      {note && <span className="text-[10px] text-[var(--text-tertiary)]">{note}</span>}
    </button>
  );
}
