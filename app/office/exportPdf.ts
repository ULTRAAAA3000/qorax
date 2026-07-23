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
// html2canvas (`doc.html()`), не на worker — Cloudflare Workers
// runtime не Node.js (немає файлової системи/нативних PDF-бібліотек),
// а браузер уже вміє рендерити текст (включно з кирилицею) без
// зайвої інфраструктури. Вбудовані шрифти jsPDF (Helvetica) НЕ
// підтримують кирилицю — рендеринг через реальний DOM/Canvas
// браузера (html2canvas) обходить це обмеження без вбудовування
// шрифтів вручну.
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
  el.style.cssText = `position:fixed;left:-9999px;top:0;width:${widthPx}px;padding:32px;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;box-sizing:border-box;`;
  el.innerHTML = innerHtml;
  document.body.appendChild(el);
  return el;
}

/** Експорт документа Docs — одна безперервна "стрічка", jsPDF сам розбиває на сторінки при переповненні. */
export async function exportDocToPdf(title: string, blocks: Block[]): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const html = `<h1 style="font-size:24px;font-weight:700;margin:0 0 20px;">${escapeHtml(title)}</h1>${blocks.map(blockToHtml).join("")}`;
  const container = buildContainer(html, 760);
  try {
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    await doc.html(container, { x: 24, y: 24, width: 547, windowWidth: 760, html2canvas: { useCORS: true } });
    doc.save(`${title || "документ"}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

/** Експорт презентації Slides — один слайд = одна сторінка PDF (landscape). */
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
      // fromPage/pagesplit=false — не даємо jsPDF самому додавати
      // сторінки за висотою вмісту, кожен слайд свідомо один pt-блок
      // на одній вже доданій сторінці (addPage() вище керує пагінацією).
      await doc.html(container, { x: 40, y: 40, width: 782, windowWidth: 900, autoPaging: false, html2canvas: { useCORS: true } });
    } finally {
      document.body.removeChild(container);
    }
  }

  doc.save(`${title || "презентація"}.pdf`);
}
