"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CopyButtonProps {
  /** Текст, який буде скопійовано в буфер обміну. */
  value: string;
  /** Текст кнопки в звичайному стані. За замовчуванням — тільки іконка. */
  label?: string;
  /** Текст кнопки після копіювання. */
  copiedLabel?: string;
  /** Скільки мс показувати стан "скопійовано". */
  resetAfterMs?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Розмір іконки. */
  iconSize?: number;
}

/**
 * Єдина реалізація "скопіювати в буфер + показати Скопійовано ✓" —
 * раніше цей паттерн (navigator.clipboard.writeText + setCopied +
 * setTimeout) був незалежно продубльований у StatusPageSection.tsx
 * і UptimeBadgeSection.tsx. Тепер це — спільний компонент.
 */
export function CopyButton({
  value,
  label,
  copiedLabel = "Скопійовано ✓",
  resetAfterMs = 1800,
  className,
  style,
  iconSize = 13,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Фолбек для середовищ без Clipboard API (рідко, але про всяк випадок)
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      try { document.execCommand("copy"); } catch { /* no-op */ }
      document.body.removeChild(textarea);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), resetAfterMs);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        transition: "all 0.15s",
        color: copied ? "var(--lime)" : "var(--text-tertiary)",
        ...style,
      }}
      aria-label={label ?? "Копіювати"}
      title={label ?? "Копіювати"}
    >
      {copied ? <Check size={iconSize} /> : <Copy size={iconSize} />}
      {(label || copiedLabel) && (
        <span>{copied ? copiedLabel : label}</span>
      )}
    </button>
  );
}
