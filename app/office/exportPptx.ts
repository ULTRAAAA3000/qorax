// exportPptx.ts — експорт презентації Slides у справжній .pptx
// (MODULE_ROADMAP.md, "Qorax Office" — "Export/Import DOCX/PPTX/
// Markdown/HTML" з переліку майбутніх ітерацій; PPTX свідомо
// відкладався в exportPdf.ts/exportText.ts як "справжній бінарний
// контейнер, значно більший обсяг роботи" — цей прохід закриває
// саме його, за прямим запитом Артема).
//
// На відміну від PDF (jsPDF + html2canvas, рендеринг через DOM/
// Canvas браузера) — pptxgenjs НЕ потребує HTML-проміжного шару:
// бібліотека сама будує XML-структуру .pptx через об'єктний API
// (addText/addImage/тощо), тому текстовий вміст (включно з
// кирилицею) рендериться нативно як текст усередині файлу — не
// растеризується в картинку, як у PDF-шляху. Це означає текст у
// експортованій презентації можна виділяти/копіювати/редагувати в
// PowerPoint/Google Slides/Keynote, на відміну від html2canvas-
// рендеру.
//
// Той самий принцип, що exportText.ts: чиста клієнтська (браузерна)
// генерація, без серверного компонента — Cloudflare Workers runtime
// не має файлової системи/нативних Office-бібліотек.

import type { Block } from "./BlockEditor";

import type PptxGenJS from "pptxgenjs";

const SLIDE_WIDTH_IN = 10;
const SLIDE_HEIGHT_IN = 5.63; // 16:9, той самий формат, що типовий PowerPoint default
const MARGIN_IN = 0.5;
const CONTENT_WIDTH_IN = SLIDE_WIDTH_IN - MARGIN_IN * 2;

const COLOR_TEXT = "1A1A1A";
const COLOR_MUTED = "888888";

/**
 * Додає один Block на вже створений pptxgenjs slide-об'єкт, зсуваючи
 * `y` під наступний елемент — та сама ідея, що "текстова стрічка
 * зверху вниз", яку blockToHtml()/exportPdf.ts вже застосовують для
 * PDF, тут без DOM-проміжного шару.
 *
 * Повертає новий `y` (в дюймах) — куди примістити наступний блок.
 */
function addBlockToSlide(slide: PptxGenJS.Slide, block: Block, y: number): number {
  const x = MARGIN_IN;
  const w = CONTENT_WIDTH_IN;

  if (block.type === "heading") {
    const sizes: Record<1 | 2 | 3, number> = { 1: 28, 2: 22, 3: 18 };
    const h = block.level === 1 ? 0.7 : 0.5;
    slide.addText(block.text || " ", { x, y, w, h, fontSize: sizes[block.level], bold: true, color: COLOR_TEXT, align: "left" });
    return y + h + 0.15;
  }

  if (block.type === "paragraph") {
    const h = estimateTextHeight(block.text, 13);
    slide.addText(block.text || " ", { x, y, w, h, fontSize: 13, color: COLOR_TEXT, align: "left", valign: "top" });
    return y + h + 0.1;
  }

  if (block.type === "bullet_list") {
    const h = Math.max(0.3, block.items.length * 0.3);
    slide.addText(
      block.items.map(item => ({ text: item, options: { bullet: true, fontSize: 13, color: COLOR_TEXT } })),
      { x, y, w, h, valign: "top" }
    );
    return y + h + 0.1;
  }

  if (block.type === "checklist") {
    const h = Math.max(0.3, block.items.length * 0.3);
    slide.addText(
      block.items.map(item => ({
        text: `${item.checked ? "☑" : "☐"} ${item.text}`,
        options: { fontSize: 13, color: item.checked ? COLOR_MUTED : COLOR_TEXT, strike: item.checked },
      })),
      { x, y, w, h, valign: "top", breakLine: true }
    );
    return y + h + 0.1;
  }

  if (block.type === "image" && block.url) {
    // pptxgenjs вимагає або локальний шлях, або data URI/base64 для
    // addImage — пряме зовнішнє посилання (http/https) підтримується
    // (бібліотека сама фетчить), той самий CORS-компроміс, що вже
    // задокументований для PDF-шляху (html2canvas) — якщо сервер
    // картинки не віддає доступ, зображення не потрапить у файл.
    const h = 2.2;
    slide.addImage({ path: block.url, x, y, w: Math.min(w, 4), h });
    return y + h + 0.15;
  }

  if (block.type === "smart_crm_contact") {
    // Live-блок — той самий підхід, що exportPdf.ts: позначаємо
    // місце блока текстом, не намагаємось відтворити картку в
    // статичному експорті.
    slide.addText("[CRM-контакт]", { x, y, w, h: 0.3, fontSize: 11, italic: true, color: COLOR_MUTED });
    return y + 0.4;
  }

  return y;
}

/** Дуже грубе оцінювання висоти тексту в дюймах — pptxgenjs сам не
 * переносить рядки автоматично для розрахунку компонування (лише
 * візуально всередині заданого h), тому оцінка потрібна тільки щоб
 * не накладати наступний блок зверху попереднього. Не точний
 * word-wrap розрахунок (той самий рівень компромісу, що вже прийнятий
 * у html2canvas-шляху для PDF — приблизна оцінка, не піксельна
 * точність). */
function estimateTextHeight(text: string, fontSize: number): number {
  const charsPerLine = Math.floor((CONTENT_WIDTH_IN * 96) / (fontSize * 0.55));
  const lines = Math.max(1, Math.ceil(text.length / Math.max(1, charsPerLine)));
  return Math.max(0.3, lines * (fontSize / 72) * 1.6);
}

export async function exportSlidesToPptx(title: string, slides: Array<{ blocks: Block[] }>): Promise<void> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "QORAX_16x9", width: SLIDE_WIDTH_IN, height: SLIDE_HEIGHT_IN });
  pptx.layout = "QORAX_16x9";

  for (const slideData of slides) {
    const slide = pptx.addSlide();
    let y = MARGIN_IN;
    if (slideData.blocks.length === 0) {
      slide.addText("Порожній слайд", { x: MARGIN_IN, y: SLIDE_HEIGHT_IN / 2 - 0.2, w: CONTENT_WIDTH_IN, h: 0.4, fontSize: 14, italic: true, color: COLOR_MUTED, align: "center" });
      continue;
    }
    for (const block of slideData.blocks) {
      y = addBlockToSlide(slide, block, y);
    }
  }

  await pptx.writeFile({ fileName: `${title || "презентація"}.pptx` });
}
