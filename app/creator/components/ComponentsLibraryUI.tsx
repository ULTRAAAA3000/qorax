"use client";

// Components / Brand Kit UI (MODULE_ROADMAP.md "Qorax Creator").
// Дві незалежні секції на одній сторінці: Brand Kit (один запис на
// організацію, upsert) і бібліотека компонентів (список + форма
// створення + видалення). content компонента — той самий block-
// формат, що project_pages.content (одна структура, не масив
// {blocks:[]}) — узгоджено з 0075_creator_components_brand_kit.sql.

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, X, Trash2, Palette, Blocks, Layout, Type, Image as ImageIcon, MousePointerClick, HelpCircle, Package, Sparkles, Check } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface BrandKit {
  logo_url: string | null;
  colors: Record<string, string> | null;
  fonts: Record<string, string> | null;
  tone_of_voice: string | null;
}

interface Component {
  id: string;
  organization_id: string | null;
  category: string;
  name: string;
  content: { type: string; heading?: string; subheading?: string; body?: string; cta_text?: string; cta_href?: string };
  is_marketplace: boolean;
}

interface Props {
  organizationId: string;
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

// Той самий перелік, що ALLOWED_CATEGORIES у creatorComponentsHandler.ts
// (worker — джерело істини для валідації, тут лише підписи/іконки для UI).
const CATEGORIES: Array<{ key: string; label: string; icon: typeof Layout }> = [
  { key: "hero", label: "Hero", icon: Layout },
  { key: "text", label: "Текст", icon: Type },
  { key: "image", label: "Зображення", icon: ImageIcon },
  { key: "cta", label: "CTA", icon: MousePointerClick },
  { key: "faq", label: "FAQ", icon: HelpCircle },
  { key: "products", label: "Товари", icon: Package },
];

function categoryMeta(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? { key, label: key, icon: Blocks };
}

export function ComponentsLibraryUI({ organizationId }: Props) {
  return (
    <div className="space-y-10">
      <BrandKitSection organizationId={organizationId} />
      <ComponentsSection organizationId={organizationId} />
    </div>
  );
}

// ── Brand Kit ─────────────────────────────────────────────────────

function BrandKitSection({ organizationId }: { organizationId: string }) {
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [logoUrl, setLogoUrl] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#d6ff3f");
  const [accentColor, setAccentColor] = useState("#8cf6ff");
  const [toneOfVoice, setToneOfVoice] = useState("");

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/brand-kit`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const bk: BrandKit | null = data.brandKit ?? null;
    if (bk) {
      setKit(bk);
      setLogoUrl(bk.logo_url ?? "");
      setPrimaryColor(bk.colors?.primary ?? "#d6ff3f");
      setAccentColor(bk.colors?.accent ?? "#8cf6ff");
      setToneOfVoice(bk.tone_of_voice ?? "");
    }
    setLoaded(true);
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/brand-kit`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          logo_url: logoUrl.trim() || null,
          colors: { primary: primaryColor, accent: accentColor },
          tone_of_voice: toneOfVoice.trim() || null,
        }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Palette size={16} style={{ color: "var(--purple)" }} />
        <h2 className="font-display text-lg font-semibold">Brand Kit</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Бренд вашого бізнесу — лого, кольори, tone of voice. Один набір на організацію.
      </p>

      {!loaded ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-4">
          <Loader2 size={14} className="animate-spin" /> Завантаження...
        </div>
      ) : (
        <form onSubmit={save} className="glow-card p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] mb-1.5 block">URL логотипа</label>
            <input
              type="text" value={logoUrl} onChange={e => setLogoUrl(e.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[var(--text-tertiary)] mb-1.5 block">Основний колір</label>
              <div className="flex items-center gap-2">
                <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer" style={{ background: "transparent" }} />
                <input
                  type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)}
                  className="flex-1 rounded-xl px-3 py-2 text-sm font-mono outline-none"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-[var(--text-tertiary)] mb-1.5 block">Акцентний колір</label>
              <div className="flex items-center gap-2">
                <input type="color" value={accentColor} onChange={e => setAccentColor(e.target.value)} className="h-9 w-9 rounded-lg cursor-pointer" style={{ background: "transparent" }} />
                <input
                  type="text" value={accentColor} onChange={e => setAccentColor(e.target.value)}
                  className="flex-1 rounded-xl px-3 py-2 text-sm font-mono outline-none"
                  style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                />
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-[var(--text-tertiary)] mb-1.5 block">
              Tone of voice <span className="text-[var(--text-tertiary)] font-normal">(використовується AI-генерацією тексту)</span>
            </label>
            <textarea
              value={toneOfVoice} onChange={e => setToneOfVoice(e.target.value)}
              placeholder="Напр.: дружній, без канцеляриту, коротко і по суті"
              rows={2}
              className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          <button type="submit" disabled={saving} className="glow-button text-sm !py-2 !px-4 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : kit ? "Зберегти зміни" : "Створити Brand Kit"}
          </button>
        </form>
      )}
    </section>
  );
}

// ── Components ────────────────────────────────────────────────────

function ComponentsSection({ organizationId }: { organizationId: string }) {
  const [components, setComponents] = useState<Component[] | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [category, setCategory] = useState("hero");
  const [name, setName] = useState("");
  const [heading, setHeading] = useState("");
  const [body, setBody] = useState("");
  const [ctaText, setCtaText] = useState("");
  const [ctaHref, setCtaHref] = useState("");
  const [creating, setCreating] = useState(false);

  // AI Collaboration (MODULE_ROADMAP.md "Qorax Creator", AI Creator):
  // rewriteTargetId — картка, для якої зараз відкрита панель
  // інструкції. rewritePreview — результат від Gemini, ЩЕ НЕ
  // застосований (застосування — окремий підтверджуючий крок,
  // окремий PATCH-виклик applyRewrite нижче).
  const [rewriteTargetId, setRewriteTargetId] = useState<string | null>(null);
  const [instruction, setInstruction] = useState("");
  const [rewriting, setRewriting] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<Component["content"] | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/components`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    setComponents(data.components ?? []);
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, [load]);

  async function createComponent(e: React.FormEvent) {
    e.preventDefault();
    if (!heading.trim()) return;
    setCreating(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/components`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          name: name.trim() || undefined,
          content: {
            type: category,
            heading: heading.trim(),
            body: body.trim() || undefined,
            cta_text: ctaText.trim() || undefined,
            cta_href: ctaHref.trim() || undefined,
          },
        }),
      });
      setName(""); setHeading(""); setBody(""); setCtaText(""); setCtaHref("");
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function deleteComponent(id: string) {
    setComponents(prev => prev?.filter(c => c.id !== id) ?? null);
    const token = await getFreshToken();
    await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/components/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  }

  function openRewritePanel(id: string) {
    setRewriteTargetId(id);
    setInstruction("");
    setRewritePreview(null);
  }

  async function requestRewrite(componentId: string) {
    if (!instruction.trim()) return;
    setRewriting(true);
    setRewritePreview(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/components/${componentId}/rewrite`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      const data = await res.json();
      if (data.content) setRewritePreview(data.content);
    } finally {
      setRewriting(false);
    }
  }

  // Підтвердження — окремий крок від генерації: rewrite повертає лише
  // прев'ю (worker НЕ зберігає його сам), applyRewrite явно зберігає
  // те, що користувач переглянув і схвалив. "Не автозастосування без
  // перегляду" — пряма вимога плану для AI Collaboration.
  async function applyRewrite(componentId: string) {
    if (!rewritePreview) return;
    setApplying(true);
    try {
      const token = await getFreshToken();
      await fetch(`${API_BASE_URL}/api/organizations/${organizationId}/components/${componentId}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ content: rewritePreview }),
      });
      setRewriteTargetId(null);
      setRewritePreview(null);
      await load();
    } finally {
      setApplying(false);
    }
  }

  const ownComponents = components?.filter(c => c.organization_id !== null) ?? [];

  return (
    <section>
      <div className="flex items-center gap-2 mb-1">
        <Blocks size={16} style={{ color: "var(--cyan)" }} />
        <h2 className="font-display text-lg font-semibold">Компоненти</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-4">
        Перевикористовувані блоки для сторінок — той самий формат, що вже підтримує Sites-редактор.
      </p>

      {!showCreate ? (
        <button onClick={() => setShowCreate(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5 mb-4">
          <Plus size={14} /> Новий компонент
        </button>
      ) : (
        <form onSubmit={createComponent} className="glow-card p-4 space-y-3 mb-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Новий компонент</span>
            <button type="button" onClick={() => setShowCreate(false)}><X size={16} className="text-[var(--text-tertiary)]" /></button>
          </div>

          <select
            value={category} onChange={e => setCategory(e.target.value)}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>

          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder="Назва компонента (необов'язково)"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <input
            type="text" value={heading} onChange={e => setHeading(e.target.value)}
            placeholder="Заголовок"
            className="w-full rounded-xl px-3 py-2 text-sm outline-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <textarea
            value={body} onChange={e => setBody(e.target.value)}
            placeholder="Текст (необов'язково)" rows={2}
            className="w-full rounded-xl px-3 py-2 text-sm outline-none resize-none"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
          />
          <div className="flex gap-2">
            <input
              type="text" value={ctaText} onChange={e => setCtaText(e.target.value)}
              placeholder="Текст кнопки (необов'язково)"
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
            <input
              type="text" value={ctaHref} onChange={e => setCtaHref(e.target.value)}
              placeholder="Посилання"
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
            />
          </div>

          <button type="submit" disabled={creating || !heading.trim()} className="glow-button text-sm !py-2 !px-4 disabled:opacity-50">
            {creating ? <Loader2 size={14} className="animate-spin" /> : "Створити"}
          </button>
        </form>
      )}

      {!components && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {components && ownComponents.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-8">Ще немає власних компонентів.</p>
      )}

      {ownComponents.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ownComponents.map(c => {
            const meta = categoryMeta(c.category);
            const Icon = meta.icon;
            const isRewriting = rewriteTargetId === c.id;
            return (
              <div key={c.id} className="glow-card p-4 space-y-3">
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "rgba(140,246,255,0.1)" }}>
                    <Icon size={14} style={{ color: "var(--cyan)" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{meta.label}{c.content.heading ? ` · ${c.content.heading}` : ""}</p>
                  </div>
                  <button
                    onClick={() => isRewriting ? setRewriteTargetId(null) : openRewritePanel(c.id)}
                    className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                    title="AI: переробити текст"
                  >
                    <Sparkles size={14} style={{ color: isRewriting ? "var(--lime)" : "var(--text-tertiary)" }} />
                  </button>
                  <button onClick={() => deleteComponent(c.id)} className="shrink-0 p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                    <Trash2 size={14} className="text-[var(--text-tertiary)]" />
                  </button>
                </div>

                {isRewriting && (
                  <div className="pt-3 space-y-2" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div className="flex gap-2">
                      <input
                        type="text" value={instruction} onChange={e => setInstruction(e.target.value)}
                        placeholder="Напр.: зроби стиль як Apple, коротше і енергійніше"
                        className="flex-1 rounded-xl px-3 py-1.5 text-xs outline-none"
                        style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
                        onKeyDown={e => { if (e.key === "Enter") requestRewrite(c.id); }}
                      />
                      <button
                        onClick={() => requestRewrite(c.id)}
                        disabled={rewriting || !instruction.trim()}
                        className="glow-button text-xs !py-1.5 !px-3 disabled:opacity-50 shrink-0"
                      >
                        {rewriting ? <Loader2 size={12} className="animate-spin" /> : "Переробити"}
                      </button>
                    </div>

                    {rewritePreview && (
                      <div className="rounded-xl p-3 space-y-1.5" style={{ background: "rgba(214,255,63,0.04)", border: "1px solid rgba(214,255,63,0.15)" }}>
                        <p className="text-[10px] font-mono uppercase tracking-wide text-[var(--text-tertiary)]">Прев&apos;ю (ще не збережено)</p>
                        {rewritePreview.heading && <p className="text-sm font-medium">{rewritePreview.heading}</p>}
                        {rewritePreview.subheading && <p className="text-xs text-[var(--text-secondary)]">{rewritePreview.subheading}</p>}
                        {rewritePreview.body && <p className="text-xs text-[var(--text-secondary)]">{rewritePreview.body}</p>}
                        {rewritePreview.cta_text && <p className="text-xs" style={{ color: "var(--lime)" }}>{rewritePreview.cta_text}</p>}
                        <button
                          onClick={() => applyRewrite(c.id)}
                          disabled={applying}
                          className="mt-1 flex items-center gap-1.5 text-xs font-medium disabled:opacity-50"
                          style={{ color: "var(--lime)" }}
                        >
                          {applying ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Застосувати
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
