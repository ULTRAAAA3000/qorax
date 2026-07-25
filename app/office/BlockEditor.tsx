"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Heading1, Heading2, Heading3, Check, X, User, Mail, Phone, ExternalLink } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

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
  | { id: string; type: "checklist"; items: Array<{ text: string; checked: boolean }> }
  | { id: string; type: "image"; url: string; alt?: string }
  | { id: string; type: "smart_crm_contact"; contactId: string };

export function newBlockId(): string {
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Той самий фікс, що в усіх інших *UI.tsx компонентах Office.
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

interface CrmContact {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
}

// Smart Block: CRM-картка контакту з "живою" прив'язкою (MODULE_
// ROADMAP.md "Qorax Office" — Smart Blocks, той самий концепт, що
// Smart Components у Creator, застосований до блочної моделі
// Office). НЕ кешує ім'я/email/телефон у самому блоці — лише
// contactId, дані підвантажуються при кожному показі через
// GET /api/crm/contacts/:id (worker перевіряє, що контакт належить
// організації користувача, незалежно від того, звідки прийшов
// запит — той самий безпечний патерн, що скрізь у проєкті). Якщо
// клієнт змінить email у CRM — картка покаже новий email при
// наступному відкритті документа, без дії користувача над блоком.
function SmartCrmContactCard({ contactId, editable }: { contactId: string; editable?: boolean }) {
  const [contact, setContact] = useState<CrmContact | null | undefined>(undefined); // undefined = завантаження, null = помилка/не знайдено

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const token = await getFreshToken();
      try {
        const res = await fetch(`${API_BASE_URL}/api/crm/contacts/${contactId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (cancelled) return;
        if (!res.ok) { setContact(null); return; }
        const data = await res.json();
        setContact(data.contact ?? null);
      } catch {
        if (!cancelled) setContact(null);
      }
    })();
    return () => { cancelled = true; };
  }, [contactId]);

  if (contact === undefined) {
    return <div className="rounded-xl p-3 text-xs text-[var(--text-tertiary)]" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>Завантаження контакту...</div>;
  }
  if (contact === null) {
    return <div className="rounded-xl p-3 text-xs" style={{ border: "1px solid rgba(255,100,100,0.2)", color: "#ff6b6b" }}>Контакт недоступний або видалений</div>;
  }

  return (
    <div className="rounded-xl p-3 flex items-start gap-3" style={{ border: "1px solid rgba(198,255,84,0.2)", background: "rgba(198,255,84,0.03)" }}>
      <div className="h-8 w-8 rounded-full flex items-center justify-center shrink-0" style={{ background: "rgba(198,255,84,0.15)" }}>
        <User size={14} style={{ color: "var(--lime)" }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{contact.name || "Без імені"}</p>
        <div className="flex flex-col gap-0.5 mt-1">
          {contact.email && <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><Mail size={10} />{contact.email}</span>}
          {contact.phone && <span className="text-xs text-[var(--text-tertiary)] flex items-center gap-1"><Phone size={10} />{contact.phone}</span>}
        </div>
      </div>
      {!editable && (
        <a href="/dashboard/crm" target="_blank" rel="noopener noreferrer" className="shrink-0" style={{ color: "var(--text-tertiary)" }} title="Відкрити в CRM">
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
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

  if (block.type === "image") {
    return (
      <div className="space-y-1.5">
        <input
          value={block.url}
          onChange={e => onChange(b => (b.type === "image" ? { ...b, url: e.target.value } : b))}
          placeholder="URL зображення (https://...)"
          className="w-full bg-transparent outline-none text-sm rounded-lg px-2 py-1.5"
          style={{ border: "1px solid rgba(255,255,255,0.08)" }}
        />
        {block.url && (
          // eslint-disable-next-line @next/next/no-img-element -- довільний зовнішній URL, не з /public, next/image тут не підходить
          <img src={block.url} alt={block.alt ?? ""} className="max-w-full rounded-lg" style={{ maxHeight: 240 }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
        )}
        <input
          value={block.alt ?? ""}
          onChange={e => onChange(b => (b.type === "image" ? { ...b, alt: e.target.value } : b))}
          placeholder="Опис зображення (для доступності, необов'язково)"
          className="w-full bg-transparent outline-none text-xs text-[var(--text-tertiary)]"
        />
      </div>
    );
  }

  if (block.type === "smart_crm_contact") {
    return <SmartCrmContactCard contactId={block.contactId} editable />;
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
  if (block.type === "image") {
    if (!block.url) return null;
    // eslint-disable-next-line @next/next/no-img-element -- довільний зовнішній URL, Present-режим і PDF-експорт потребують звичайний <img>
    return <img src={block.url} alt={block.alt ?? ""} className="max-w-full rounded-lg" style={{ maxHeight: "60vh" }} />;
  }
  if (block.type === "smart_crm_contact") {
    return <SmartCrmContactCard contactId={block.contactId} />;
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
