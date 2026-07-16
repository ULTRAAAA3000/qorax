"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Sparkles, Plus, Download, Upload, X } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { type Cells, cellKey, indexToCol, evaluateCell, cellsToCsv, parseCsv, csvToCells } from "../sheetFormulas";
import { usePresence } from "../../usePresence";
import { PresenceAvatars } from "../../PresenceAvatars";

interface SheetData {
  columns: number;
  rows: number;
  cells: Cells;
}

interface Props {
  sheetId: string;
  initialTitle: string;
  initialData: SheetData | null;
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

const CELL_W = 110;
const CELL_H = 30;

// MVP grid-редактор Qorax Office Sheets (MODULE_ROADMAP.md, "Qorax
// Office"). Формули — лише SUM/AVERAGE/COUNT (sheetFormulas.ts).
// Без форматування клітинок/діаграм/кількох вкладок — майбутні
// ітерації. CSV, не .xlsx — той самий рівень MVP-звуження, що вже
// прийнятий для Docs (4 типи блоків, не повний Notion).
export function SheetEditorUI({ sheetId, initialTitle, initialData }: Props) {
  const presentUsers = usePresence("office_sheets", sheetId);
  const [title, setTitle] = useState(initialTitle);
  const [columns, setColumns] = useState(initialData?.columns ?? 12);
  const [rows, setRows] = useState(initialData?.rows ?? 30);
  const [cells, setCells] = useState<Cells>(initialData?.cells ?? {});
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(async (patch: { title?: string; data?: SheetData }) => {
    setSaving(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-sheets/${sheetId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
    } finally {
      setSaving(false);
    }
  }, [sheetId]);

  const scheduleSave = useCallback((nextCells: Cells, nextColumns: number, nextRows: number) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      persist({ data: { cells: nextCells, columns: nextColumns, rows: nextRows } });
    }, 600);
  }, [persist]);

  useEffect(() => () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); }, []);

  function setCellValue(key: string, value: string) {
    setCells(prev => {
      const next = { ...prev };
      if (value === "") delete next[key];
      else next[key] = value;
      scheduleSave(next, columns, rows);
      return next;
    });
  }

  function moveFocus(col: number, row: number) {
    const key = cellKey(Math.max(0, Math.min(columns - 1, col)), Math.max(0, Math.min(rows - 1, row)));
    inputRefs.current.get(key)?.focus();
  }

  function onCellKeyDown(e: React.KeyboardEvent<HTMLInputElement>, col: number, row: number) {
    if (e.key === "Enter") { e.preventDefault(); moveFocus(col, row + 1); }
    else if (e.key === "Tab") { e.preventDefault(); moveFocus(col + (e.shiftKey ? -1 : 1), row); }
    else if (e.key === "ArrowDown") { e.preventDefault(); moveFocus(col, row + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); moveFocus(col, row - 1); }
    else if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) { moveFocus(col + 1, row); }
    else if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) { moveFocus(col - 1, row); }
  }

  // Вставка кількох клітинок разом (з Excel/Google Sheets/іншого
  // місця в цій же таблиці) — clipboard-текст у таких випадках
  // рядки розділені \n, колонки — \t (той самий формат, що TSV).
  // Одноклітинкова вставка (без \t/\n) не перехоплюється — браузер
  // сам вставляє звичайним чином в input.
  function onCellPaste(e: React.ClipboardEvent<HTMLInputElement>, col: number, row: number) {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return; // одна клітинка — стандартна поведінка

    e.preventDefault();
    const grid = text.replace(/\r/g, "").split("\n").filter((_, i, arr) => !(i === arr.length - 1 && arr[i] === "")).map(line => line.split("\t"));

    setCells(prev => {
      const next = { ...prev };
      grid.forEach((line, r) => {
        line.forEach((val, c) => {
          const key = cellKey(col + c, row + r);
          if (val === "") delete next[key];
          else next[key] = val;
        });
      });
      const neededCols = Math.max(columns, col + Math.max(...grid.map(l => l.length)));
      const neededRows = Math.max(rows, row + grid.length);
      if (neededCols !== columns) setColumns(neededCols);
      if (neededRows !== rows) setRows(neededRows);
      scheduleSave(next, neededCols, neededRows);
      return next;
    });
  }

  function addColumn() {
    const next = columns + 1;
    setColumns(next);
    scheduleSave(cells, next, rows);
  }
  function addRows(n: number) {
    const next = rows + n;
    setRows(next);
    scheduleSave(cells, columns, next);
  }

  function exportCsv() {
    const csv = cellsToCsv(cells, columns, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${title || "таблиця"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (Object.keys(cells).length > 0 && !confirm("Імпорт CSV замінить усі дані в таблиці. Продовжити?")) {
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const parsed = parseCsv(String(reader.result));
      const newCells = csvToCells(parsed);
      const neededCols = Math.max(columns, ...parsed.map(r => r.length));
      const neededRows = Math.max(rows, parsed.length);
      setCells(newCells);
      setColumns(neededCols);
      setRows(neededRows);
      scheduleSave(newCells, neededCols, neededRows);
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  async function runAiGenerate() {
    if (!aiInstruction.trim()) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/office-sheets/${sheetId}/ai-generate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: aiInstruction.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { setAiError(data.error ?? "Не вдалося згенерувати таблицю"); return; }
      const merged = { ...cells, ...data.cells };
      setCells(merged);
      setColumns(data.columns ?? columns);
      setRows(data.rows ?? rows);
      scheduleSave(merged, data.columns ?? columns, data.rows ?? rows);
      setAiInstruction("");
      setShowAi(false);
    } catch {
      setAiError("AI тимчасово недоступний");
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          onBlur={() => persist({ title })}
          placeholder="Без назви"
          className="font-display text-lg font-semibold bg-transparent outline-none min-w-0"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <PresenceAvatars users={presentUsers} />
          {saving && <Loader2 size={14} className="animate-spin text-[var(--text-tertiary)]" />}
          <button onClick={() => fileInputRef.current?.click()} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)]">
            <Upload size={12} /> Імпорт CSV
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={importCsv} className="hidden" />
          <button onClick={exportCsv} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)]">
            <Download size={12} /> Експорт CSV
          </button>
          <button
            onClick={() => setShowAi(v => !v)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: "rgba(198,255,84,0.08)", border: "1px solid rgba(198,255,84,0.25)", color: "var(--lime)" }}
          >
            <Sparkles size={12} /> AI
          </button>
        </div>
      </div>

      {showAi && (
        <div className="px-4 sm:px-6 py-3 flex items-start gap-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <input
            autoFocus
            value={aiInstruction}
            onChange={e => setAiInstruction(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") runAiGenerate(); }}
            placeholder="Наприклад: таблиця витрат по категоріях на місяць"
            className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <button onClick={runAiGenerate} disabled={aiLoading || !aiInstruction.trim()} className="glow-button text-xs !py-2 !px-3 disabled:opacity-50 flex items-center gap-1.5 shrink-0">
            {aiLoading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Згенерувати
          </button>
          <button onClick={() => setShowAi(false)} className="p-2 text-[var(--text-tertiary)] shrink-0"><X size={14} /></button>
        </div>
      )}
      {aiError && <p className="px-6 py-1 text-xs" style={{ color: "#ff6b6b" }}>{aiError}</p>}

      <div className="flex-1 overflow-auto">
        <table className="border-collapse" style={{ tableLayout: "fixed" }}>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20" style={{ width: 36, height: CELL_H, background: "var(--bg)", borderBottom: "1px solid rgba(255,255,255,0.1)", borderRight: "1px solid rgba(255,255,255,0.1)" }} />
              {Array.from({ length: columns }).map((_, c) => (
                <th
                  key={c}
                  className="sticky top-0 z-10 text-xs font-medium text-[var(--text-tertiary)]"
                  style={{ width: CELL_W, height: CELL_H, background: "var(--bg)", borderBottom: "1px solid rgba(255,255,255,0.1)", borderRight: "1px solid rgba(255,255,255,0.05)" }}
                >
                  {indexToCol(c)}
                </th>
              ))}
              <th style={{ width: 40 }}>
                <button onClick={addColumn} aria-label="Додати колонку" className="p-1 rounded hover:bg-white/5 text-[var(--text-tertiary)]"><Plus size={12} /></button>
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, r) => (
              <tr key={r}>
                <td
                  className="sticky left-0 z-10 text-xs text-center text-[var(--text-tertiary)]"
                  style={{ width: 36, height: CELL_H, background: "var(--bg)", borderBottom: "1px solid rgba(255,255,255,0.05)", borderRight: "1px solid rgba(255,255,255,0.1)" }}
                >
                  {r + 1}
                </td>
                {Array.from({ length: columns }).map((_, c) => {
                  const key = cellKey(c, r);
                  const isFocused = focusedKey === key;
                  const displayValue = isFocused ? (cells[key] ?? "") : evaluateCell(cells, key);
                  return (
                    <td key={c} style={{ width: CELL_W, height: CELL_H, border: "1px solid rgba(255,255,255,0.05)", padding: 0 }}>
                      <input
                        ref={el => { if (el) inputRefs.current.set(key, el); else inputRefs.current.delete(key); }}
                        value={displayValue}
                        onChange={e => setCellValue(key, e.target.value)}
                        onFocus={() => setFocusedKey(key)}
                        onBlur={() => setFocusedKey(null)}
                        onKeyDown={e => onCellKeyDown(e, c, r)}
                        onPaste={e => onCellPaste(e, c, r)}
                        className="w-full h-full bg-transparent outline-none text-xs px-2"
                        style={{ outlineOffset: -1 }}
                      />
                    </td>
                  );
                })}
                <td />
              </tr>
            ))}
          </tbody>
        </table>
        <div className="p-2">
          <button onClick={() => addRows(10)} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)]">
            <Plus size={12} /> Додати 10 рядків
          </button>
        </div>
      </div>
    </div>
  );
}
