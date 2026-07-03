"use client";

import { useState, useRef } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Upload, Loader2, CheckCircle2, Trash2 } from "lucide-react";

interface Props {
  organizationId: string;
  initialEnabled: boolean;
  initialCompanyName: string | null;
  initialLogoUrl: string | null;
  orgName: string;
}

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB, узгоджено з bucket policy
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/svg+xml", "image/webp"];

export function WhiteLabelSettingsForm({
  organizationId,
  initialEnabled,
  initialCompanyName,
  initialLogoUrl,
  orgName,
}: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [companyName, setCompanyName] = useState(initialCompanyName ?? orgName);
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Дозволені формати: PNG, JPEG, SVG, WebP");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError("Розмір файлу не повинен перевищувати 2 МБ");
      return;
    }

    setError(null);
    setUploading(true);
    try {
      const supabase = createClient();
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${organizationId}/logo.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from("agency-logos")
        .upload(path, file, { upsert: true, cacheControl: "3600" });

      if (uploadError) {
        setError("Не вдалося завантажити файл. Спробуйте ще раз.");
        return;
      }

      const { data: publicUrlData } = supabase.storage
        .from("agency-logos")
        .getPublicUrl(path);

      // Додаємо timestamp щоб уникнути кешування старого лого браузером/PDF
      const freshUrl = `${publicUrlData.publicUrl}?t=${Date.now()}`;
      setLogoUrl(freshUrl);

      await supabase
        .from("organizations")
        .update({ white_label_logo_url: freshUrl })
        .eq("id", organizationId);

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Помилка мережі. Спробуйте ще раз.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRemoveLogo() {
    setUploading(true);
    setError(null);
    try {
      const supabase = createClient();
      await supabase
        .from("organizations")
        .update({ white_label_logo_url: null })
        .eq("id", organizationId);
      setLogoUrl(null);
    } catch {
      setError("Не вдалося видалити лого");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase
        .from("organizations")
        .update({
          white_label_enabled: enabled,
          white_label_company_name: companyName.trim() || null,
        })
        .eq("id", organizationId);

      if (updateError) {
        setError("Не вдалося зберегти налаштування");
        return;
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Помилка мережі. Спробуйте ще раз.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-2xl p-5"
      style={{ background: "rgba(140,246,255,0.02)", border: "1px solid rgba(140,246,255,0.1)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <span className="text-xs font-mono" style={{ color: "var(--cyan)" }}>✦</span>
          <h2 className="text-sm font-semibold">White-label (Agency)</h2>
        </div>
        <button
          onClick={() => setEnabled(!enabled)}
          className="relative w-9 h-5 rounded-full transition-colors"
          style={{ background: enabled ? "var(--lime)" : "rgba(255,255,255,0.12)" }}
          aria-label="Увімкнути white-label"
        >
          <span
            className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform"
            style={{ transform: enabled ? "translateX(18px)" : "translateX(2px)" }}
          />
        </button>
      </div>

      <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mb-4">
        Коли увімкнено, PDF-звіти та статус-сторінки клієнтів показують ваш бренд
        замість Qorax.
      </p>

      <div className="space-y-4">
        {/* Company name */}
        <div>
          <label className="text-xs text-[var(--text-tertiary)] block mb-1.5">Назва бренду</label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder={orgName}
            maxLength={80}
            className="w-full text-sm px-3 py-2 rounded-lg outline-none transition-colors"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-primary)",
            }}
          />
        </div>

        {/* Logo upload */}
        <div>
          <label className="text-xs text-[var(--text-tertiary)] block mb-1.5">Логотип</label>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg flex items-center justify-center overflow-hidden"
                  style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Логотип" className="max-w-full max-h-full object-contain" />
                </div>
                <button
                  onClick={handleRemoveLogo}
                  disabled={uploading}
                  className="text-xs flex items-center gap-1 px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}
                >
                  <Trash2 size={12} /> Видалити
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="text-xs flex items-center gap-1.5 px-3 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
              >
                {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {uploading ? "Завантаження..." : "Завантажити PNG/SVG"}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/svg+xml,image/webp"
              onChange={handleFileSelect}
              className="hidden"
            />
          </div>
          <p className="text-[11px] text-[var(--text-tertiary)] mt-1.5">
            PNG, JPEG, SVG або WebP, до 2 МБ
          </p>
        </div>

        {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-medium px-4 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
            style={{ background: "var(--lime)", color: "#0a0a0a" }}
          >
            {saving && <Loader2 size={12} className="animate-spin" />}
            {saving ? "Збереження..." : "Зберегти"}
          </button>
          {saved && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--lime)" }}>
              <CheckCircle2 size={12} /> Збережено
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
