// sheetFormulas.ts — мінімальний движок формул для Qorax Office
// Sheets (MVP). Підтримує лише SUM/AVERAGE/COUNT над діапазоном
// ("=SUM(A1:A5)") — свідомо вузько, повноцінний формульний рушій
// (як у Google Sheets/Excel: вкладені функції, відносні посилання
// при копіюванні, IF/VLOOKUP тощо) — майбутня ітерація, не MVP.
// Циклічні посилання НЕ детектуються (немає захисту від
// нескінченної рекурсії за межами глибини рекурсії JS) — відоме
// обмеження MVP, не критичне для простих таблиць без ланцюжків
// формул, що посилаються одна на одну.

export type Cells = Record<string, string>;

const COL_RE = /^[A-Z]+/;
const ROW_RE = /\d+$/;

export function colToIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function indexToCol(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellKey(col: number, row: number): string {
  return `${indexToCol(col)}${row + 1}`;
}

function parseCellKey(key: string): { col: number; row: number } | null {
  const colMatch = key.match(COL_RE);
  const rowMatch = key.match(ROW_RE);
  if (!colMatch || !rowMatch) return null;
  return { col: colToIndex(colMatch[0]), row: parseInt(rowMatch[0], 10) - 1 };
}

function parseRange(range: string): string[] {
  const [start, end] = range.split(":");
  if (!end) return [start];
  const s = parseCellKey(start.trim());
  const e = parseCellKey(end.trim());
  if (!s || !e) return [];
  const keys: string[] = [];
  for (let r = Math.min(s.row, e.row); r <= Math.max(s.row, e.row); r++) {
    for (let c = Math.min(s.col, e.col); c <= Math.max(s.col, e.col); c++) {
      keys.push(cellKey(c, r));
    }
  }
  return keys;
}

/**
 * Обчислює відображуване значення клітинки. Якщо raw починається з
 * "=", парсить SUM/AVERAGE/COUNT(діапазон); інакше повертає raw як є
 * (число форматується компактно, текст — без змін). `visiting` —
 * захист від нескінченної рекурсії в межах ОДНОГО виклику ланцюжка
 * (проста, не повна детекція циклів — див. коментар угорі файлу).
 */
export function evaluateCell(cells: Cells, key: string, visiting: Set<string> = new Set()): string {
  const raw = cells[key];
  if (raw === undefined || raw === "") return "";
  if (!raw.startsWith("=")) return raw;
  if (visiting.has(key)) return "#REF!";

  const formula = raw.slice(1).trim();
  const match = formula.match(/^(SUM|AVERAGE|COUNT)\(([^)]+)\)$/i);
  if (!match) return "#ERR";

  const [, fn, rangeStr] = match;
  const keys = parseRange(rangeStr);
  const nextVisiting = new Set(visiting).add(key);
  const values = keys
    .map(k => evaluateCell(cells, k, nextVisiting))
    .filter(v => v !== "")
    .map(v => parseFloat(v))
    .filter(v => !isNaN(v));

  if (fn.toUpperCase() === "COUNT") return String(values.length);
  if (values.length === 0) return fn.toUpperCase() === "SUM" ? "0" : "";

  const sum = values.reduce((a, b) => a + b, 0);
  const result = fn.toUpperCase() === "SUM" ? sum : sum / values.length;
  return Number.isInteger(result) ? String(result) : result.toFixed(2);
}

// ── CSV ─────────────────────────────────────────────────────────

export function cellsToCsv(cells: Cells, columns: number, rows: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    const rowVals: string[] = [];
    let hasValue = false;
    for (let c = 0; c < columns; c++) {
      const key = cellKey(c, r);
      const val = evaluateCell(cells, key);
      if (val !== "") hasValue = true;
      const needsQuotes = val.includes(",") || val.includes('"') || val.includes("\n");
      rowVals.push(needsQuotes ? `"${val.replace(/"/g, '""')}"` : val);
    }
    if (hasValue || r < rows) lines.push(rowVals.join(","));
  }
  // прибираємо порожні рядки-хвости
  while (lines.length > 0 && lines[lines.length - 1].split(",").every(v => v === "")) lines.pop();
  return lines.join("\n");
}

/** Простий CSV-парсер з підтримкою лапок/ком/переносів усередині поля. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { field += ch; }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { row.push(field); field = ""; }
      else if (ch === "\n" || ch === "\r") {
        if (ch === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = ""; rows.push(row); row = [];
      } else field += ch;
    }
  }
  if (field !== "" || row.length > 0) { row.push(field); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ""));
}

export function csvToCells(rows: string[][]): Cells {
  const cells: Cells = {};
  rows.forEach((row, r) => {
    row.forEach((val, c) => {
      if (val !== "") cells[cellKey(c, r)] = val;
    });
  });
  return cells;
}
