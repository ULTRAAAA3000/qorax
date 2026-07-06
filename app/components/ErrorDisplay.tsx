"use client";

import { useState } from "react";
import { AlertTriangle, Copy, Check, RotateCcw } from "lucide-react";

interface Props {
  error: Error & { digest?: string };
  reset?: () => void;
  /** Назва сторінки/сегменту для контексту в скопійованому тексті. */
  context?: string;
}

/**
 * Спільний UI для error.tsx-меж Next.js. Дає користувачу зрозумілий
 * екран замість голого стектрейсу, і кнопку "Скопіювати помилку" —
 * зібраний текст (повідомлення, digest, URL, час) можна вставити
 * прямо в тікет підтримки замість скріншоту консолі.
 */
export function ErrorDisplay({ error, reset, context }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopyError() {
    const details = [
      `Сторінка: ${context ?? (typeof window !== "undefined" ? window.location.pathname : "невідомо")}`,
      `Час: ${new Date().toISOString()}`,
      `Повідомлення: ${error.message}`,
      error.digest ? `Digest: ${error.digest}` : null,
    ].filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(details);
    } catch { /* ignore */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-md w-full text-center">
        <div className="h-12 w-12 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: "rgba(245,103,90,0.1)", border: "1px solid rgba(245,103,90,0.25)" }}>
          <AlertTriangle size={20} style={{ color: "#F5675A" }} />
        </div>
        <h1 className="text-lg font-semibold mb-1.5" style={{ color: "var(--text-primary)" }}>
          Щось пішло не так
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
          Сталася непередбачена помилка. Спробуйте оновити сторінку — якщо проблема повторюється, надішліть деталі в підтримку.
        </p>

        <div className="flex items-center justify-center gap-2.5 flex-wrap">
          {reset && (
            <button
              onClick={reset}
              className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}
            >
              <RotateCcw size={13} />
              Спробувати ще раз
            </button>
          )}
          <button
            onClick={handleCopyError}
            className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-xl transition-colors"
            style={{
              background: copied ? "rgba(214,255,63,0.08)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${copied ? "rgba(214,255,63,0.2)" : "rgba(255,255,255,0.1)"}`,
              color: copied ? "var(--lime)" : "var(--text-secondary)",
            }}
          >
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? "Скопійовано ✓" : "Скопіювати помилку"}
          </button>
        </div>

        {error.digest && (
          <p className="text-xs font-mono mt-5" style={{ color: "var(--text-tertiary)" }}>
            ID помилки: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
