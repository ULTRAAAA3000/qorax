// xlsxIO.ts — клієнтський (браузерний) імпорт/експорт .xlsx для
// Qorax Office Sheets. MODULE_ROADMAP.md, "Qorax Office" —
// доповнення до вже наявного CSV (0074/0076_office_sheets.sql).
//
// Бібліотека: exceljs, НЕ пакет `xlsx` (SheetJS) з npm registry.
// Критична причина: `xlsx@0.18.5` (остання версія, опублікована в
// npm — SheetJS з певного моменту публікує патчені версії лише на
// власному CDN, не в npm) має ДВІ HIGH-severity вразливості —
// Prototype Pollution (GHSA-4r6h-8v6p-xvw6) і ReDoS
// (GHSA-5pgg-2g8v-p4x9) — САМЕ в коді ПАРСИНГУ файлів, тобто рівно
// в тій дії, яку виконує імпорт .xlsx від користувача (прямий шлях
// атаки через завантажений файл). `npm audit fix` це не виправляє
// (fixAvailable: false). Мережевий доступ до cdn.sheetjs.com
// (офіційний спосіб отримати патчену версію) недоступний з цього
// середовища розробки.
//
// exceljs теж має одну moderate-вразливість (транзитивно через
// uuid: GHSA-w5hq-g745-h8pq, "відсутня перевірка меж буфера при
// переданому buf") — але ця вразливість зачіпає лише виклики
// uuid.v3/v5/v6 З явно переданим buf-параметром; exceljs
// використовує uuid лише для генерації випадкових id (v4-подібне
// використання, поза уразливим шляхом). Ризик для коду, що ПАРСИТЬ
// довільний файл користувача, суттєво нижчий за прямі high-severity
// вразlivості в самому парсингу xlsx.

import type { Cells } from "./sheetFormulas";
import { cellKey, evaluateCell } from "./sheetFormulas";

export async function exportXlsx(title: string, cells: Cells, columns: number, rows: number): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  // Excel обмежує назву аркуша 31 символом і забороняє деякі символи.
  const sheetName = (title || "Таблиця").replace(/[[\]*/\\?:]/g, "").slice(0, 31) || "Sheet1";
  const sheet = workbook.addWorksheet(sheetName);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const key = cellKey(c, r);
      const raw = cells[key];
      if (raw === undefined || raw === "") continue;
      const evaluated = evaluateCell(cells, key);
      const num = parseFloat(evaluated);
      // Число зберігаємо як число (Excel зможе рахувати з ним далі),
      // текст/нерозпізнане — як текст. Формули НЕ експортуємо як
      // Excel-формули (наш SUM/AVERAGE/COUNT — інший синтаксис, ніж
      // Excel) — переносимо вже ОБЧИСЛЕНЕ значення.
      sheet.getCell(r + 1, c + 1).value = !isNaN(num) && String(num) === evaluated ? num : evaluated;
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${title || "таблиця"}.xlsx`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function cellValueToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toLocaleDateString("uk-UA");
  if (typeof value === "object") {
    // ExcelJS формула: {formula, result}. richText: {richText: [{text}, ...]}. Помилка: {error}.
    const v = value as { result?: unknown; richText?: Array<{ text: string }>; error?: string; text?: string };
    if (v.result !== undefined) return cellValueToString(v.result);
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text).join("");
    if (v.error) return "";
    if (v.text) return v.text;
    return String(value);
  }
  return String(value);
}

export async function importXlsx(file: File): Promise<{ cells: Cells; columns: number; rows: number }> {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const buffer = await file.arrayBuffer();
  await workbook.xlsx.load(buffer);

  const sheet = workbook.worksheets[0];
  const cells: Cells = {};
  let maxCol = 0, maxRow = 0;

  sheet?.eachRow((row, rowNumber) => {
    row.eachCell((cell, colNumber) => {
      const text = cellValueToString(cell.value);
      if (text === "") return;
      cells[cellKey(colNumber - 1, rowNumber - 1)] = text;
      maxCol = Math.max(maxCol, colNumber);
      maxRow = Math.max(maxRow, rowNumber);
    });
  });

  return { cells, columns: Math.max(12, maxCol), rows: Math.max(30, maxRow) };
}
