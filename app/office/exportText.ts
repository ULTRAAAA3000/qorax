// exportText.ts — експорт у Markdown і HTML для Docs і Slides
// (MODULE_ROADMAP.md, "Qorax Office" — "Export/Import DOCX/PPTX/
// Markdown/HTML" з переліку майбутніх ітерацій, звужено до двох
// найдешевших форматів з чотирьох). Markdown і HTML — на відміну
// від DOCX/PPTX, не потребують бінарного формату/спеціальної
// бібліотеки: обидва — просто текст, який можна побудувати з уже
// наявного блочного дерева напряму, без залежностей. DOCX/PPTX —
// справжні бінарні контейнери (zip з XML усередині), значно більший
// обсяг роботи — свідомо НЕ цей прохід.
//
// HTML переюзує blockToHtml()/escapeHtml() з exportPdf.ts (той самий
// рендеринг блоків, що вже йде в PDF, тут — обгорнутий у
// самодостатній HTML-документ для завантаження, не для html2canvas).

import type { Block } from "./BlockEditor";
import { blockToHtml, escapeHtml } from "./exportPdf";

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Мінімальне екранування markdown-спецсимволів у звичайному тексті —
// не намагається бути ідеальним CommonMark-екрануванням (це окрема
// глибока тема), лише прибирає найпомітніші випадки випадкового
// форматування (зірочки/підкреслення/решітка на початку рядка).
function escapeMd(text: string): string {
  return text.replace(/([*_`#])/g, "\\$1");
}

function blockToMarkdown(block: Block): string {
  if (block.type === "paragraph") return block.text ? `${escapeMd(block.text)}\n` : "";
  if (block.type === "heading") return `${"#".repeat(block.level)} ${escapeMd(block.text)}\n`;
  if (block.type === "bullet_list") return block.items.map(i => `- ${escapeMd(i)}`).join("\n") + "\n";
  if (block.type === "image") return block.url ? `![${escapeMd(block.alt ?? "")}](${block.url})\n` : "";
  // checklist
  return block.items.map(i => `- [${i.checked ? "x" : " "}] ${escapeMd(i.text)}`).join("\n") + "\n";
}

export function exportDocToMarkdown(title: string, blocks: Block[]): void {
  const md = `# ${title || "Без назви"}\n\n${blocks.map(blockToMarkdown).join("\n")}`;
  downloadText(md, `${title || "документ"}.md`, "text/markdown");
}

export function exportSlidesToMarkdown(title: string, slides: Array<{ blocks: Block[] }>): void {
  const sections = slides.map((s, i) => `<!-- Слайд ${i + 1} -->\n\n${s.blocks.map(blockToMarkdown).join("\n")}`);
  const md = `# ${title || "Без назви"}\n\n${sections.join("\n---\n\n")}`;
  downloadText(md, `${title || "презентація"}.md`, "text/markdown");
}

function wrapHtmlDocument(title: string, bodyHtml: string): string {
  return `<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title || "Без назви")}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #111; max-width: 760px; margin: 40px auto; padding: 0 20px; line-height: 1.6; }
  h1 { font-size: 28px; }
  hr { margin: 40px 0; border: none; border-top: 1px solid #ddd; }
</style>
</head>
<body>
<h1>${escapeHtml(title || "Без назви")}</h1>
${bodyHtml}
</body>
</html>`;
}

export function exportDocToHtml(title: string, blocks: Block[]): void {
  const html = wrapHtmlDocument(title, blocks.map(blockToHtml).join(""));
  downloadText(html, `${title || "документ"}.html`, "text/html");
}

export function exportSlidesToHtml(title: string, slides: Array<{ blocks: Block[] }>): void {
  const sections = slides.map(s => `<section>${s.blocks.map(blockToHtml).join("")}</section>`).join("<hr/>");
  const html = wrapHtmlDocument(title, sections);
  downloadText(html, `${title || "презентація"}.html`, "text/html");
}
