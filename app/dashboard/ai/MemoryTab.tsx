"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Save, Check, X, Plus, Trash2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface MemoryData {
  business_summary: string | null;
  tone_preference: string | null;
  competitors: string[] | null;
  goals: string | null;
  updated_at: string | null;
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

// Memory — вкладка Qorax AI хаба (EXECUTION_PLAN.md, крок після
// Workspace). MODULE_ROADMAP.md: "проста форма, дешева технічно,
// дає AI одразу [контекст]" — навмисно проста форма без AI-логіки
// автогенерації полів. Заповнене тут одразу впливає на Chat
// (buildMemoryContext в memoryHandler.ts додається в системний
// промпт chatHandler.ts).
export function MemoryTab() {
  const [data, setData] = useState<MemoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newCompetitor, setNewCompetitor] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getFreshToken();
      if (!token) { setLoading(false); return; }

      const resp = await fetch(`${API_BASE_URL}/api/memory`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { setLoading(false); return; }

      const json = (await resp.json()) as { memory: MemoryData };
      setData(json.memory);
    } catch (err) {
      console.error("[MemoryTab] failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function save() {
    if (!data) return;
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const token = await getFreshToken();
      if (!token) {
        setError("Сесія закінчилась — оновіть сторінку");
        return;
      }

      const resp = await fetch(`${API_BASE_URL}/api/memory`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          business_summary: data.business_summary,
          tone_preference: data.tone_preference,
          competitors: data.competitors,
          goals: data.goals,
        }),
      });

      const json = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(json.error ?? "Не вдалося зберегти");
        return;
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error("[MemoryTab] save error:", err);
      setError("Мережева помилка — перевірте з'єднання");
    } finally {
      setSaving(false);
    }
  }

  function update<K extends keyof MemoryData>(key: K, value: MemoryData[K]) {
    setData((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function addCompetitor() {
    const trimmed = newCompetitor.trim();
    if (!trimmed || !data) return;
    const current = data.competitors ?? [];
    if (current.includes(trimmed)) { setNewCompetitor(""); return; }
    update("competitors", [...current, trimmed]);
    setNewCompetitor("");
  }

  function removeCompetitor(name: string) {
    if (!data) return;
    update("competitors", (data.competitors ?? []).filter((c) => c !== name));
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        Розкажіть про свій бізнес — AI використовуватиме це в кожній розмові в Chat,
        щоб давати більш релевантні поради.
      </p>

      <Field
        label="Чим займається бізнес"
        value={data.business_summary ?? ""}
        onChange={(v) => update("business_summary", v)}
        placeholder="Напр.: інтернет-магазин вітамінів та БАДів для спортсменів, працюємо в Україні та ЄС"
        multiline
        maxLength={2000}
      />

      <Field
        label="Бажаний стиль спілкування"
        value={data.tone_preference ?? ""}
        onChange={(v) => update("tone_preference", v)}
        placeholder="Напр.: коротко і по суті, без зайвого технічного жаргону"
        maxLength={500}
      />

      <Field
        label="Цілі"
        value={data.goals ?? ""}
        onChange={(v) => update("goals", v)}
        placeholder="Напр.: збільшити конверсію з мобільного трафіку, скоротити відмови в кошику"
        multiline
        maxLength={2000}
      />

      {/* Competitors — chip-список */}
      <div>
        <label className="block text-sm font-medium mb-1.5" style={{ color: "var(--text-primary)" }}>
          Конкуренти
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {(data.competitors ?? []).map((c) => (
            <span
              key={c}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
            >
              {c}
              <button onClick={() => removeCompetitor(c)}>
                <X size={11} style={{ color: "var(--text-tertiary)" }} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={newCompetitor}
            onChange={(e) => setNewCompetitor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCompetitor(); } }}
            placeholder="Додати конкурента..."
            className="flex-1 min-w-0 text-sm rounded-lg px-3 py-2 bg-transparent outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
          />
          <button
            onClick={addCompetitor}
            disabled={!newCompetitor.trim()}
            className="shrink-0 rounded-lg px-3 py-2 disabled:opacity-30 transition-opacity hover:opacity-80"
            style={{ background: "rgba(255,255,255,0.06)" }}
          >
            <Plus size={14} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(245,103,90,0.08)", border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A" }}
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: "var(--lime)", color: "#0c111d" }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
          Зберегти
        </button>

        {saved && (
          <span className="flex items-center gap-1.5 text-sm" style={{ color: "var(--lime)" }}>
            <Check size={14} /> Збережено
          </span>
        )}
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  multiline?: boolean;
  maxLength: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </label>
        <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {value.length}/{maxLength}
        </span>
      </div>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          rows={3}
          className="w-full text-sm rounded-lg px-3 py-2.5 bg-transparent outline-none resize-none placeholder:text-[var(--text-tertiary)]"
          style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.slice(0, maxLength))}
          placeholder={placeholder}
          className="w-full text-sm rounded-lg px-3 py-2.5 bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
          style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
        />
      )}
    </div>
  );
}
