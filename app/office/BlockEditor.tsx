"use client";

import { Plus, Trash2, Heading1, Heading2, Heading3, Check, X } from "lucide-react";

// Спільний блочний тип і рендер-компоненти для Docs і Slides —
// той самий формат office_documents.content.blocks/office_slides.
// slides[].blocks (0072/0075). Один рушій редагування, два способи
// його показати (суцільний скрол у Docs, пагінація по слайдах у
// Slides) — той самий принцип "формат один, режим показу різний",
// що вже описаний для Creator у MODULE_ROADMAP.md, тут застосований
// найпростішим можливим способом (спільні React-компоненти, не
// єдиний canvas-рушій).
export type Block =
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "heading"; level: 1 | 2 | 3; text: string }
  | { id: string; type: "bullet_list"; items: string[] }
  | { id: string; type: "checklist"; items: Array<{ text: string; checked: boolean }> };

export function newBlockId(): string {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BlockAddButton({ icon: Icon, label, onClick }: { icon: typeof Heading1; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-xs px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-white/5 transition-colors text-[var(--text-tertiary)]"
    >
      <Plus size={11} /><Icon size={12} /> {label}
    </button>
  );
}

export function BlockRow({ block, onChange, onDelete }: { block: Block; onChange: (updater: (b: Block) => Block) => void; onDelete: () => void }) {
  return (
    <div className="group relative flex items-start gap-2">
      <div className="flex-1 min-w-0">
        <BlockContent block={block} onChange={onChange} />
      </div>
      <button
        onClick={onDelete}
        aria-label="Видалити блок"
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-white/5 shrink-0 mt-1"
        style={{ color: "var(--text-tertiary)" }}
      >
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function autoResize(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

export function BlockContent({ block, onChange }: { block: Block; onChange: (updater: (b: Block) => Block) => void }) {
  if (block.type === "paragraph") {
    return (
      <textarea
        value={block.text}
        onChange={e => { autoResize(e.target); onChange(b => (b.type === "paragraph" ? { ...b, text: e.target.value } : b)); }}
        ref={autoResize}
        placeholder="Текст..."
        rows={1}
        className="w-full bg-transparent outline-none resize-none text-sm leading-relaxed py-1"
      />
    );
  }

  if (block.type === "heading") {
    const sizes: Record<1 | 2 | 3, string> = { 1: "text-2xl", 2: "text-xl", 3: "text-lg" };
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5 shrink-0">
          {([1, 2, 3] as const).map(level => {
            const Icon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
            return (
              <button
                key={level}
                onClick={() => onChange(b => (b.type === "heading" ? { ...b, level } : b))}
                className="p-1 rounded"
                style={{ color: block.level === level ? "var(--lime)" : "var(--text-tertiary)" }}
              >
                <Icon size={13} />
              </button>
            );
          })}
        </div>
        <input
          value={block.text}
          onChange={e => onChange(b => (b.type === "heading" ? { ...b, text: e.target.value } : b))}
          placeholder="Заголовок"
          className={`flex-1 bg-transparent outline-none font-display font-semibold ${sizes[block.level]}`}
        />
      </div>
    );
  }

  if (block.type === "bullet_list") {
    return (
      <div className="space-y-1.5">
        {block.items.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[var(--text-tertiary)] shrink-0">•</span>
            <input
              value={item}
              onChange={e => onChange(b => {
                if (b.type !== "bullet_list") return b;
                const items = [...b.items];
                items[i] = e.target.value;
                return { ...b, items };
              })}
              placeholder="Пункт списку"
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <button
              onClick={() => onChange(b => (b.type === "bullet_list" ? { ...b, items: b.items.filter((_, j) => j !== i) } : b))}
              className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              style={{ color: "var(--text-tertiary)" }}
            >
              <X size={12} />
            </button>
          </div>
        ))}
        <button
          onClick={() => onChange(b => (b.type === "bullet_list" ? { ...b, items: [...b.items, ""] } : b))}
          className="text-xs flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors ml-4"
        >
          <Plus size={11} /> Пункт
        </button>
      </div>
    );
  }

  // checklist
  return (
    <div className="space-y-1.5">
      {block.items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <button
            onClick={() => onChange(b => {
              if (b.type !== "checklist") return b;
              const items = [...b.items];
              items[i] = { ...items[i], checked: !items[i].checked };
              return { ...b, items };
            })}
            className="shrink-0 h-4 w-4 rounded flex items-center justify-center"
            style={{ border: `1px solid ${item.checked ? "var(--lime)" : "rgba(255,255,255,0.2)"}`, background: item.checked ? "rgba(198,255,84,0.15)" : "transparent" }}
          >
            {item.checked && <Check size={11} style={{ color: "var(--lime)" }} />}
          </button>
          <input
            value={item.text}
            onChange={e => onChange(b => {
              if (b.type !== "checklist") return b;
              const items = [...b.items];
              items[i] = { ...items[i], text: e.target.value };
              return { ...b, items };
            })}
            placeholder="Завдання"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ textDecoration: item.checked ? "line-through" : "none", opacity: item.checked ? 0.5 : 1 }}
          />
          <button
            onClick={() => onChange(b => (b.type === "checklist" ? { ...b, items: b.items.filter((_, j) => j !== i) } : b))}
            className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            style={{ color: "var(--text-tertiary)" }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
      <button
        onClick={() => onChange(b => (b.type === "checklist" ? { ...b, items: [...b.items, { text: "", checked: false }] } : b))}
        className="text-xs flex items-center gap-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors ml-6"
      >
        <Plus size={11} /> Завдання
      </button>
    </div>
  );
}

// Read-only рендер блоку — для fullscreen Present-режиму Slides
// (там не потрібні input/textarea з onChange, тільки показ).
export function BlockStatic({ block }: { block: Block }) {
  if (block.type === "paragraph") return <p className="text-lg leading-relaxed whitespace-pre-wrap">{block.text}</p>;
  if (block.type === "heading") {
    const sizes: Record<1 | 2 | 3, string> = { 1: "text-5xl", 2: "text-3xl", 3: "text-2xl" };
    return <h2 className={`font-display font-semibold ${sizes[block.level]}`}>{block.text}</h2>;
  }
  if (block.type === "bullet_list") {
    return (
      <ul className="space-y-2">
        {block.items.map((item, i) => (
          <li key={i} className="text-lg flex items-start gap-2"><span className="opacity-50 mt-1">•</span>{item}</li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-2">
      {block.items.map((item, i) => (
        <li key={i} className="text-lg flex items-start gap-2" style={{ opacity: item.checked ? 0.5 : 1, textDecoration: item.checked ? "line-through" : "none" }}>
          <span className="mt-1">{item.checked ? "☑" : "☐"}</span>{item.text}
        </li>
      ))}
    </ul>
  );
}
