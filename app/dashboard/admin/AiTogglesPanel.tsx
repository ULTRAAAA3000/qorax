"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Loader2, Sparkles } from "lucide-react";

interface AiToggle {
  product: string;
  label: string;
  enabled: boolean;
}

/**
 * AiTogglesPanel — admin-перемикач "весь AI" по кожному з п'яти
 * продуктів екосистеми (ai_product_toggles, міграція 0082). Артем
 * (липень 2026): поки немає клієнтури, потрібен простий спосіб
 * вимкнути AI по продукту цілком, щоб не витрачати Gemini-квоту
 * даремно — один тумблер на продукт, без розбивки по окремих
 * AI-фічах (Chat/Agents/Vision тощо).
 *
 * Той самий паттерн, що PlatformModulesPanel — прямий запис через
 * browser Supabase client, RLS (0082: is_platform_admin()) захищає
 * update, окремий worker-ендпоінт не потрібен. worker/src/lib/
 * aiCredits.ts::checkAiCredits() читає цю ж таблицю ПЕРЕД кожним
 * викликом Gemini у всіх п'яти продуктах — вимкнення тут реально
 * блокує запит на бекенді, не лише ховає щось в UI.
 */
export function AiTogglesPanel() {
  const supabase = createClient();
  const [toggles, setToggles] = useState<AiToggle[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from("ai_product_toggles")
      .select("product, label, enabled")
      .then(({ data, error }) => {
        if (error) { setError(error.message); return; }
        setToggles(data as AiToggle[]);
      });
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function toggle(product: string, enabled: boolean) {
    setUpdating(product);
    setError(null);
    const { error } = await supabase
      .from("ai_product_toggles")
      .update({ enabled })
      .eq("product", product);
    setUpdating(null);
    if (error) { setError(error.message); return; }
    setToggles(prev => prev?.map(t => (t.product === product ? { ...t, enabled } : t)) ?? null);
  }

  return (
    <div className="glow-card p-6">
      <div className="flex items-center gap-2 mb-1">
        <Sparkles size={16} style={{ color: "var(--lime)" }} />
        <h2 className="font-display text-lg font-semibold">AI по продуктах</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        Вимикає весь AI (Gemini) у продукті одразу на бекенді — без клієнтури зайві виклики не потрібні. Не впливає на решту функціоналу продукту.
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
          {error}
        </div>
      )}

      {!toggles && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {toggles && (
        <div className="space-y-2">
          {toggles.map(t => (
            <div
              key={t.product}
              className="flex items-center gap-3 px-3 py-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium">{t.label}</span>
              </div>

              {updating === t.product && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--text-tertiary)" }} />}

              <button
                onClick={() => toggle(t.product, !t.enabled)}
                disabled={updating === t.product}
                role="switch"
                aria-checked={t.enabled}
                className="relative shrink-0 h-6 w-11 rounded-full transition-colors"
                style={{ background: t.enabled ? "var(--lime)" : "rgba(255,255,255,0.12)" }}
              >
                <span
                  className="absolute top-0.5 h-5 w-5 rounded-full transition-transform"
                  style={{
                    background: "var(--bg)",
                    transform: t.enabled ? "translateX(22px)" : "translateX(2px)",
                  }}
                />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
