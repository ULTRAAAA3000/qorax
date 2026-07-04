"use client";

import { useState } from "react";
import { Wrench, X, CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

interface Props {
  siteId: string;
  insightId?: string;
  prefillDescription?: string;
  /** Компактна кнопка на картці інсайту, або повна на рівні сайту */
  variant?: "compact" | "full";
}

const PLATFORMS = [
  { value: "wordpress", label: "WordPress" },
  { value: "tilda", label: "Tilda" },
  { value: "wix", label: "Wix" },
  { value: "custom", label: "Кастомна розробка" },
  { value: "other", label: "Не знаю / інше" },
];

export function FixRequestButton({ siteId, insightId, prefillDescription, variant = "compact" }: Props) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState(prefillDescription ?? "");
  const [platform, setPlatform] = useState<string>("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ isFree: boolean } | null>(null);

  async function handleSubmit() {
    if (!description.trim()) {
      setError("Опишіть проблему");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setError("Потрібно увійти в акаунт");
        setSending(false);
        return;
      }

      const resp = await fetch(`${API_URL}/api/fix-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          site_id: siteId,
          insight_id: insightId ?? null,
          problem_description: description.trim(),
          site_platform: platform || null,
        }),
      });
      const data = await resp.json() as { ok?: boolean; isFree?: boolean; error?: string; message?: string };

      if (resp.ok && data.ok) {
        setSuccess({ isFree: !!data.isFree });
      } else if (resp.status === 403 && data.error === "upgrade_required") {
        setError(data.message ?? "Доступно з плану Growth");
      } else {
        setError(data.error ?? "Не вдалося надіслати заявку");
      }
    } catch {
      setError("Помилка мережі. Спробуйте ще раз.");
    } finally {
      setSending(false);
    }
  }

  function closeAndReset() {
    setOpen(false);
    setTimeout(() => {
      setSuccess(null);
      setError(null);
      setDescription(prefillDescription ?? "");
      setPlatform("");
    }, 200);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          variant === "compact"
            ? "text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80 flex items-center gap-1.5"
            : "text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 flex items-center gap-2"
        }
        style={
          variant === "compact"
            ? { background: "rgba(214,255,63,0.08)", border: "1px solid rgba(214,255,63,0.25)", color: "var(--lime)" }
            : { background: "var(--lime)", color: "#0C111D" }
        }
      >
        <Wrench size={variant === "compact" ? 11 : 14} />
        {variant === "compact" ? "Замовити виправлення" : "Потрібна допомога з цим сайтом?"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)" }}
          onClick={closeAndReset}
        >
          <div
            className="w-full max-w-md rounded-2xl p-6"
            style={{ background: "#0F1420", border: "1px solid var(--border-hairline)" }}
            onClick={e => e.stopPropagation()}
          >
            {success ? (
              <div className="text-center py-4">
                <CheckCircle2 size={32} className="mx-auto mb-3" style={{ color: "var(--lime)" }} />
                <h3 className="text-base font-semibold mb-1.5">Заявку надіслано</h3>
                <p className="text-sm text-[var(--text-tertiary)] leading-relaxed mb-1">
                  {success.isFree
                    ? "Це безкоштовна заявка в межах вашого плану. Ми зв'яжемось найближчим часом."
                    : "Це платна заявка — ми обговоримо деталі та вартість особисто."}
                </p>
                <button
                  onClick={closeAndReset}
                  className="mt-4 text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
                  style={{ background: "var(--lime)", color: "#0C111D" }}
                >
                  Готово
                </button>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-base font-semibold">Замовити виправлення</h3>
                  <button onClick={closeAndReset} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
                    <X size={18} />
                  </button>
                </div>

                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed mb-4">
                  Опишіть проблему — команда Qorax зв&apos;яжеться з вами і виправить її на сайті.
                  Перша заявка на місяць безкоштовна, наступні — за домовленістю.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-[var(--text-tertiary)] block mb-1.5">Опис проблеми</label>
                    <textarea
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      rows={4}
                      placeholder="Наприклад: сторінка контактів видає помилку 404..."
                      className="w-full text-sm px-3 py-2 rounded-lg outline-none resize-none"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
                    />
                  </div>

                  <div>
                    <label className="text-xs text-[var(--text-tertiary)] block mb-1.5">На чому зроблено сайт? (якщо знаєте)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {PLATFORMS.map(p => (
                        <button
                          key={p.value}
                          onClick={() => setPlatform(platform === p.value ? "" : p.value)}
                          className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                          style={{
                            background: platform === p.value ? "rgba(214,255,63,0.12)" : "rgba(255,255,255,0.03)",
                            border: `1px solid ${platform === p.value ? "rgba(214,255,63,0.4)" : "rgba(255,255,255,0.08)"}`,
                            color: platform === p.value ? "var(--lime)" : "var(--text-secondary)",
                          }}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

                  <button
                    onClick={handleSubmit}
                    disabled={sending}
                    className="w-full text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
                    style={{ background: "var(--lime)", color: "#0C111D" }}
                  >
                    {sending && <Loader2 size={14} className="animate-spin" />}
                    {sending ? "Надсилання..." : "Надіслати заявку"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
