// exportPdf.ts — клієнтський (браузерний) експорт у PDF для Docs і
// Slides (MODULE_ROADMAP.md, "Qorax Office", пункт MVP-списку
// "робота з PDF"). Свідомо НЕ повний "PDF Studio" з плану (об'єднання/
// розділення/підпис/стиснення/конвертація довільних PDF-файлів
// користувача) — це вимагало б інфраструктури завантаження файлів і
// PDF-парсингу серверної сторони, значно більший обсяг. Найдешевший
// і найцінніший перший крок: дати експортувати ВЖЕ створений у
// Qorax документ/презентацію як PDF-файл.
//
// Технічне рішення: генерація ПОВНІСТЮ на клієнті через jsPDF +
// html2canvas, не на worker — Cloudflare Workers runtime не Node.js
// (немає файлової системи/нативних PDF-бібліотек), а браузер уже
// вміє рендерити текст (включно з кирилицею) без зайвої
// інфраструктури. Вбудовані шрифти jsPDF (Helvetica) НЕ підтримують
// кирилицю — рендеринг через реальний DOM/Canvas браузера
// (html2canvas) обходить це обмеження без вбудовування шрифтів
// вручну. html2canvas() викликається ВРУЧНУ, а не через вбудований
// міст `jsPDF.html()` — той давав валідний за розміром, але порожній
// PDF в частині вʼюверів (детальний розбір — коментар над
// renderElementToPdfPages нижче).
//
// ВАЖЛИВО: ця логіка виконується виключно в браузері (document/
// window) — не можна юніт-тестувати в Node-пісочниці так само, як
// sheetFormulas.ts. Перевірено читанням офіційного API jsPDF 4.x
// (.html() повертає Promise), не автоматизованим тестом — чесно
// позначаю цю відмінність від AI Inbox/Sheets, де smoke-test був
// можливий.

import type { Block } from "./BlockEditor";

export function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

export function blockToHtml(block: Block): string {
  if (block.type === "paragraph") {
    return `<p style="font-size:13px;line-height:1.6;margin:0 0 10px;white-space:pre-wrap;">${escapeHtml(block.text)}</p>`;
  }
  if (block.type === "heading") {
    const sizes: Record<1 | 2 | 3, string> = { 1: "26px", 2: "20px", 3: "16px" };
    return `<h${block.level} style="font-size:${sizes[block.level]};font-weight:600;margin:0 0 12px;">${escapeHtml(block.text)}</h${block.level}>`;
  }
  if (block.type === "bullet_list") {
    return `<ul style="margin:0 0 10px;padding-left:20px;">${block.items.map(i => `<li style="font-size:13px;line-height:1.6;">${escapeHtml(i)}</li>`).join("")}</ul>`;
  }
  if (block.type === "image") {
    if (!block.url) return "";
    // crossorigin="anonymous" — щоб html2canvas міг прочитати піксели
    // зображення для растеризації. Якщо сервер картинки не віддає
    // CORS-заголовки, html2canvas тихо пропустить зображення (відомий
    // компроміс цієї бібліотеки, не можна обійти без проксі) — той
    // самий рівень чесності про межі перевірки, що вже позначений
    // вище для всього PDF-експорту.
    return `<img src="${escapeHtml(block.url)}" crossorigin="anonymous" style="max-width:100%;border-radius:6px;margin:0 0 10px;display:block;" />`;
  }
  if (block.type === "smart_crm_contact") {
    // Live-блок — при статичному PDF-експорті немає сенсу тягнути
    // дані наживо (документ уже "заморожений" на момент експорту).
    // Позначаємо місце блока текстом, не намагаємось відтворити картку.
    return `<p style="font-size:12px;color:#888;margin:0 0 10px;font-style:italic;">[CRM-контакт]</p>`;
  }
  // checklist
  return `<ul style="margin:0 0 10px;padding-left:0;list-style:none;">${block.items
    .map(i => `<li style="font-size:13px;line-height:1.6;${i.checked ? "opacity:0.5;text-decoration:line-through;" : ""}">${i.checked ? "☑" : "☐"} ${escapeHtml(i.text)}</li>`)
    .join("")}</ul>`;
}

function buildContainer(innerHtml: string, widthPx: number): HTMLDivElement {
  const el = document.createElement("div");
  // Позиціонування через z-index:-9999 замість left:-9999px — правка
  // з паралельної сесії (коміт 2800bae) за гіпотезою, що html2canvas
  // не знімає елементи поза видимим вʼюпортом. Реальний репродюсер у
  // браузері цю гіпотезу спростував: html2canvas ОКРЕМО, з тим самим
  // -9999px-контейнером, дає коректний canvas із видимим текстом —
  // справжня причина білого PDF була не тут (див. коментар над
  // renderElementToPdfPages нижче). Позиціонування через z-index
  // лишено як є — воно нешкідливе і теж ховає контейнер від
  // користувача, просто не було тим, що насправді ламало експорт.
  el.style.cssText = `position:fixed;left:0;top:0;z-index:-9999;width:${widthPx}px;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;box-sizing:border-box;`;
  el.innerHTML = innerHtml;
  document.body.appendChild(el);
  return el;
}

// ВИПРАВЛЕННЯ (Артем: "Далее PDF документов когда экспортируется белый" —
// експортований PDF відкривався повністю білою сторінкою у Firefox/pdf.js).
// Репродюсер (jsPDF 4.2.1 + html2canvas 1.4.1, точна копія цієї логіки,
// запущена в реальному браузері) показав: html2canvas() ОКРЕМО дає
// коректний canvas із видимим текстом, а вбудований міст `jsPDF.html()`
// поверх ТОГО Ж контейнера — валідний за розміром, але порожній PDF;
// pdf.js (той самий рушій, що в Firefox) читає з нього 0 символів
// тексту й рендерить порожній canvas. Це відомий і давній клас багів
// саме мосту jsPDF `.html()` (numerous issues у parallax/jsPDF: "Only
// Displaying Blank Pages", "doesn't render correctly" тощо). Рішення —
// прибрати `.html()` повністю: рендерити html2canvas() вручну (вже
// підтверджено робочий крок) і вставляти готовий canvas через
// doc.addImage() напряму, без участі внутрішнього мосту jsPDF.
async function renderElementToPdfPages(
  doc: import("jspdf").jsPDF,
  element: HTMLElement,
  opts: { x: number; y: number; contentWidthPt: number; pageHeightPt: number },
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, { useCORS: true, scale: 2, backgroundColor: "#ffffff" });
  const ptPerPx = opts.contentWidthPt / canvas.width;
  const pageContentHeightPx = Math.max(1, Math.floor(opts.pageHeightPt / ptPerPx));

  let renderedPx = 0;
  let first = true;
  while (renderedPx < canvas.height) {
    const sliceHeightPx = Math.min(pageContentHeightPx, canvas.height - renderedPx);
    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeightPx;
    const ctx = pageCanvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
    ctx.drawImage(canvas, 0, renderedPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

    if (!first) doc.addPage();
    first = false;
    doc.addImage(pageCanvas.toDataURL("image/png"), "PNG", opts.x, opts.y, opts.contentWidthPt, sliceHeightPx * ptPerPx);
    renderedPx += sliceHeightPx;
  }
}

/** Одна растеризація елемента, вписана в прямокутник (contain-fit, по центру) — для Slides, де 1 слайд = 1 сторінка без нарізки. */
async function renderElementFitToPdfPage(
  doc: import("jspdf").jsPDF,
  element: HTMLElement,
  opts: { boxX: number; boxY: number; boxWidthPt: number; boxHeightPt: number },
): Promise<void> {
  const { default: html2canvas } = await import("html2canvas");
  const canvas = await html2canvas(element, { useCORS: true, scale: 2, backgroundColor: "#ffffff" });
  const fitRatio = Math.min(opts.boxWidthPt / canvas.width, opts.boxHeightPt / canvas.height);
  const imgWidthPt = canvas.width * fitRatio;
  const imgHeightPt = canvas.height * fitRatio;
  const x = opts.boxX + (opts.boxWidthPt - imgWidthPt) / 2;
  const y = opts.boxY + (opts.boxHeightPt - imgHeightPt) / 2;
  doc.addImage(canvas.toDataURL("image/png"), "PNG", x, y, imgWidthPt, imgHeightPt);
}

/** Експорт документа Docs — одна безперервна "стрічка", вручну нарізана на сторінки A4. */
export async function exportDocToPdf(title: string, blocks: Block[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const html = `<h1 style="font-size:24px;font-weight:700;margin:0 0 20px;">${escapeHtml(title)}</h1>${blocks.map(blockToHtml).join("")}`;
  const container = buildContainer(html, 760);
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    // A4 = 595.28×841.89pt; поля 24pt з кожного боку (як у попередній версії).
    await renderElementToPdfPages(doc, container, { x: 24, y: 24, contentWidthPt: 547.28, pageHeightPt: 793.89 });
    doc.save(`${title || "документ"}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

/** Експорт презентації Slides — один слайд = одна сторінка PDF (landscape), вписаний у сторінку без обрізання. */
export async function exportSlidesToPdf(title: string, slides: Array<{ blocks: Block[] }>): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });

  for (let i = 0; i < slides.length; i++) {
    if (i > 0) doc.addPage();
    const html = slides[i].blocks.length > 0
      ? slides[i].blocks.map(blockToHtml).join("")
      : `<p style="color:#999;">Порожній слайд</p>`;
    const container = buildContainer(html, 900);
    try {
      // A4 landscape = 841.89×595.28pt; поля 40pt з кожного боку.
      await renderElementFitToPdfPage(doc, container, { boxX: 40, boxY: 40, boxWidthPt: 761.89, boxHeightPt: 515.28 });
    } finally {
      document.body.removeChild(container);
    }
  }

  doc.save(`${title || "презентація"}.pdf`);
}
