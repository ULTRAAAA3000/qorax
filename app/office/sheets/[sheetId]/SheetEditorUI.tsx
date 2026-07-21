"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Sparkles, Plus, Download, Upload, X, Bold, Palette, BarChart3 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { type Cells, type Formats, type CellFormat, type NumberFormat, type ChartSpec, cellKey, indexToCol, evaluateCell, formatDisplayValue, cellsToCsv, parseCsv, csvToCells } from "../sheetFormulas";
import { SheetChart } from "../SheetChart";
import { usePresence } from "../../usePresence";
import { PresenceAvatars } from "../../PresenceAvatars";
import { useLiveSync } from "../../useLiveSync";
import { VersionHistoryButton } from "../../VersionHistoryButton";

interface SheetData {
  columns: number;
  rows: number;
  cells: Cells;
  formats?: Formats;
  charts?: ChartSpec[];
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
  const [formats, setFormats] = useState<Formats>(initialData?.formats ?? {});
  const [charts, setCharts] = useState<ChartSpec[]>(initialData?.charts ?? []);
  const [showChartForm, setShowChartForm] = useState(false);
  const [chartDraft, setChartDraft] = useState<{ type: ChartSpec["type"]; title: string; valueRange: string; labelRange: string }>({ type: "bar", title: "", valueRange: "", labelRange: "" });
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  // toolbarKey — окремо від focusedKey: focusedKey скидається на
  // null при blur інпута (потрібно для isFocused у рендері клітинки —
  // показувати raw vs обчислене значення), а toolbarKey лишається
  // "останньою обраною клітинкою" навіть після blur, щоб клік по
  // тулбару форматування (який сам провокує blur інпута) не встиг
  // розмонтувати тулбар до того, як onClick встигне спрацювати.
  const [toolbarKey, setToolbarKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [importingXlsx, setImportingXlsx] = useState(false);
  const [showAi, setShowAi] = useState(false);
  const [aiInstruction, setAiInstruction] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);
  const xlsxFileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  // formatsRef/chartsRef — щоб scheduleSave() у вже наявних місцях
  // виклику (зміна клітинок/сітки) не загубила поточні formats/
  // charts, не переписуючи кожен виклик додатковими аргументами.
  const formatsRef = useRef(formats);
  useEffect(() => { formatsRef.current = formats; }, [formats]);
  const chartsRef = useRef(charts);
  useEffect(() => { chartsRef.current = charts; }, [charts]);
  // notifySavedRef/containerRef — той самий патерн живої синхронізації,
  // що вже реалізований і задокументований у DocEditorUI.tsx.
  const notifySavedRef = useRef<() => void>(() => {});
  const containerRef = useRef<HTMLDivElement>(null);

  const persist = useCallback(async (patch: { title?: string; data?: SheetData }) => {
    setSaving(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/office-sheets/${sheetId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      notifySavedRef.current();
    } finally {
      setSaving(false);
    }
  }, [sheetId]);

  const scheduleSave = useCallback((nextCells: Cells, nextColumns: number, nextRows: number, nextFormats?: Formats) => {
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    saveTimeout.current = setTimeout(() => {
      persist({ data: { cells: nextCells, columns: nextColumns, rows: nextRows, formats: nextFormats ?? formatsRef.current, charts: chartsRef.current } });
    }, 600);
  }, [persist]);

  useEffect(() => () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); }, []);

  const reloadFromServer = useCallback(async () => {
    if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/office-sheets/${sheetId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    if (data.sheet) {
      setTitle(data.sheet.title);
      setCells(data.sheet.data?.cells ?? {});
      setColumns(data.sheet.data?.columns ?? 12);
      setRows(data.sheet.data?.rows ?? 30);
      setFormats(data.sheet.data?.formats ?? {});
      setCharts(data.sheet.data?.charts ?? []);
    }
  }, [sheetId]);

  const { pendingUpdate, applyPendingUpdate: applyPendingUpdateRaw, notifySaved } = useLiveSync("office_sheets", sheetId, {
    isEditing: () => !!containerRef.current && containerRef.current.contains(document.activeElement),
    onRemoteUpdate: reloadFromServer,
  });
  useEffect(() => { notifySavedRef.current = notifySaved; }, [notifySaved]);

  const applyPendingUpdate = useCallback(() => {
    if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
    applyPendingUpdateRaw();
  }, [applyPendingUpdateRaw]);


  function setCellValue(key: string, value: string) {
    setCells(prev => {
      const next = { ...prev };
      if (value === "") delete next[key];
      else next[key] = value;
      scheduleSave(next, columns, rows);
      return next;
    });
  }

  function updateCellFormat(key: string, patch: Partial<CellFormat>) {
    setFormats(prev => {
      const merged: CellFormat = { ...prev[key], ...patch };
      // порожній формат — прибираємо ключ, а не тримаємо {} даремно
      const isEmpty = !merged.bold && !merged.color && (!merged.numberFormat || merged.numberFormat === "plain");
      const next = { ...prev };
      if (isEmpty) delete next[key];
      else next[key] = merged;
      scheduleSave(cells, columns, rows, next);
      return next;
    });
  }

  function addChart() {
    if (!chartDraft.valueRange.trim()) return;
    const newChart: ChartSpec = {
      id: `chart-${Date.now()}`,
      type: chartDraft.type,
      title: chartDraft.title.trim(),
      valueRange: chartDraft.valueRange.trim().toUpperCase(),
      labelRange: chartDraft.labelRange.trim() ? chartDraft.labelRange.trim().toUpperCase() : undefined,
    };
    const next = [...charts, newChart];
    setCharts(next);
    persist({ data: { cells, columns, rows, formats, charts: next } });
    setShowChartForm(false);
    setChartDraft({ type: "bar", title: "", valueRange: "", labelRange: "" });
  }

  function deleteChart(id: string) {
    const next = charts.filter(c => c.id !== id);
    setCharts(next);
    persist({ data: { cells, columns, rows, formats, charts: next } });
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

  async function exportXlsxHandler() {
    setExportingXlsx(true);
    try {
      const { exportXlsx } = await import("../xlsxIO");
      await exportXlsx(title, cells, columns, rows);
    } finally {
      setExportingXlsx(false);
    }
  }

  async function importXlsxHandler(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (Object.keys(cells).length > 0 && !confirm("Імпорт XLSX замінить усі дані в таблиці. Продовжити?")) {
      e.target.value = "";
      return;
    }
    setImportingXlsx(true);
    try {
      const { importXlsx } = await import("../xlsxIO");
      const { cells: newCells, columns: neededCols, rows: neededRows } = await importXlsx(file);
      setCells(newCells);
      setColumns(neededCols);
      setRows(neededRows);
      scheduleSave(newCells, neededCols, neededRows);
    } catch {
      alert("Не вдалося прочитати файл — переконайтесь, що це коректний .xlsx");
    } finally {
      setImportingXlsx(false);
      e.target.value = "";
    }
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
    <div ref={containerRef} className="h-full flex flex-col">
      {pendingUpdate && (
        <div className="px-4 sm:px-6 py-2 flex items-center justify-between gap-3 text-xs" style={{ background: "rgba(140,246,255,0.08)", borderBottom: "1px solid rgba(140,246,255,0.25)" }}>
          <span style={{ color: "var(--cyan)" }}>Хтось інший оновив цю таблицю, поки ви редагували.</span>
          <button onClick={applyPendingUpdate} className="font-medium underline shrink-0" style={{ color: "var(--cyan)" }}>
            Оновити зараз
          </button>
        </div>
      )}
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
          <button onClick={() => xlsxFileInputRef.current?.click()} disabled={importingXlsx} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)] disabled:opacity-50">
            {importingXlsx ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Імпорт XLSX
          </button>
          <input ref={xlsxFileInputRef} type="file" accept=".xlsx" onChange={importXlsxHandler} className="hidden" />
          <button onClick={exportXlsxHandler} disabled={exportingXlsx} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)] disabled:opacity-50">
            {exportingXlsx ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />} Експорт XLSX
          </button>
          <VersionHistoryButton docType="office_sheets" docId={sheetId} onRestored={reloadFromServer} />
          <button onClick={() => setShowChartForm(v => !v)} className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 text-[var(--text-tertiary)]">
            <BarChart3 size={12} /> Діаграма
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

      {showChartForm && (
        <div className="px-4 sm:px-6 py-3 flex items-end gap-2 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-tertiary)]">
            Тип
            <select
              value={chartDraft.type}
              onChange={e => setChartDraft(d => ({ ...d, type: e.target.value as ChartSpec["type"] }))}
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
            >
              <option value="bar">Стовпчики</option>
              <option value="line">Лінія</option>
              <option value="pie">Кругова</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-tertiary)]">
            Значення (напр. B2:B8)
            <input
              value={chartDraft.valueRange}
              onChange={e => setChartDraft(d => ({ ...d, valueRange: e.target.value }))}
              placeholder="B2:B8"
              className="text-xs rounded-lg px-2 py-1.5 outline-none w-28"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-tertiary)]">
            Підписи (напр. A2:A8)
            <input
              value={chartDraft.labelRange}
              onChange={e => setChartDraft(d => ({ ...d, labelRange: e.target.value }))}
              placeholder="A2:A8 (необов'язково)"
              className="text-xs rounded-lg px-2 py-1.5 outline-none w-32"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </label>
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-tertiary)]">
            Назва
            <input
              value={chartDraft.title}
              onChange={e => setChartDraft(d => ({ ...d, title: e.target.value }))}
              placeholder="Назва діаграми"
              className="text-xs rounded-lg px-2 py-1.5 outline-none w-36"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </label>
          <button onClick={addChart} disabled={!chartDraft.valueRange.trim()} className="glow-button text-xs !py-1.5 !px-3 disabled:opacity-50">
            Додати
          </button>
        </div>
      )}

      {charts.length > 0 && (
        <div className="px-4 sm:px-6 py-4 flex items-start gap-3 flex-wrap" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          {charts.map(chart => (
            <SheetChart key={chart.id} chart={chart} cells={cells} onDelete={() => deleteChart(chart.id)} />
          ))}
        </div>
      )}

      {toolbarKey && (
        <div className="px-4 sm:px-6 py-2 flex items-center gap-1" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <span className="text-[10px] text-[var(--text-tertiary)] mr-1 font-mono">{toolbarKey}</span>
          <button
            onMouseDown={e => e.preventDefault()}
            onClick={() => updateCellFormat(toolbarKey, { bold: !formats[toolbarKey]?.bold })}
            className="p-1.5 rounded-lg hover:bg-white/5"
            style={{ color: formats[toolbarKey]?.bold ? "var(--lime)" : "var(--text-tertiary)" }}
            title="Жирний"
          >
            <Bold size={12} />
          </button>
          <div className="flex items-center gap-1 px-1">
            <Palette size={12} className="text-[var(--text-tertiary)]" />
            {["", "#C6FF54", "#8CF6FF", "#FF9F6B", "#B98CF7", "#ffffff"].map(color => (
              <button
                key={color || "none"}
                onMouseDown={e => e.preventDefault()}
                onClick={() => updateCellFormat(toolbarKey, { color: color || undefined })}
                className="h-4 w-4 rounded-full shrink-0"
                style={{
                  background: color || "transparent",
                  border: color ? "1px solid rgba(255,255,255,0.2)" : "1px dashed rgba(255,255,255,0.3)",
                  outline: (formats[toolbarKey]?.color ?? "") === color ? "2px solid var(--lime)" : "none",
                  outlineOffset: 1,
                }}
                title={color || "Без кольору"}
              />
            ))}
          </div>
          <select
            value={formats[toolbarKey]?.numberFormat ?? "plain"}
            onChange={e => updateCellFormat(toolbarKey, { numberFormat: e.target.value as NumberFormat })}
            className="text-xs rounded-lg px-2 py-1 outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
          >
            <option value="plain">Звичайний</option>
            <option value="integer">Ціле число</option>
            <option value="percent">Відсоток</option>
            <option value="currency">₴ Гривня</option>
          </select>
        </div>
      )}

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
                  const format = formats[key];
                  const displayValue = isFocused ? (cells[key] ?? "") : formatDisplayValue(evaluateCell(cells, key), format?.numberFormat);
                  return (
                    <td key={c} style={{ width: CELL_W, height: CELL_H, border: "1px solid rgba(255,255,255,0.05)", padding: 0 }}>
                      <input
                        ref={el => { if (el) inputRefs.current.set(key, el); else inputRefs.current.delete(key); }}
                        value={displayValue}
                        onChange={e => setCellValue(key, e.target.value)}
                        onFocus={() => { setFocusedKey(key); setToolbarKey(key); }}
                        onBlur={() => setFocusedKey(null)}
                        onKeyDown={e => onCellKeyDown(e, c, r)}
                        onPaste={e => onCellPaste(e, c, r)}
                        className="w-full h-full bg-transparent outline-none text-xs px-2"
                        style={{ outlineOffset: -1, fontWeight: format?.bold ? 700 : 400, color: format?.color || undefined }}
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
