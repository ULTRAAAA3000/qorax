"use client";

import { useState, useEffect, useRef } from "react";
import { Send, CheckCircle2, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

// TelegramConnectButton — портативна кнопка підключення Telegram-бота,
// винесена з app/dashboard/settings/NotificationSettingsForm.tsx (та
// сама логіка deep link + polling), щоб точку входу можна було
// розмістити будь-де на сайті — лендінг, шапка будь-якого продукту
// (Business/Mail/Creator/Office/Browser), не лише в Налаштуваннях.
// Артем: "щоб можна було підключити з будь-якого місця на сайті,
// лендосі, продукті і т.д." — сама кнопка, не новий рівень авторизації.
//
// Два режими:
// - organizationId переданий (юзер залогінений і в контексті
//   організації) — повний флоу: deep link з org_id як payload +
//   polling /api/telegram/status, той самий що в Settings
// - organizationId відсутній (лендінг, незалогінений відвідувач) —
//   просто відкриває бота БЕЗ payload (загальний /start), підключення
//   тоді відбувається пізніше зсередини Dashboard після реєстрації —
//   тут це "ознайомча" кнопка, не повне підключення

interface Props {
  organizationId?: string;
  variant?: "primary" | "ghost";
  label?: string;
  className?: string;
}

function readBotName(): string {
  return process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME ?? "QoraxBot";
}

export function TelegramConnectButton({ organizationId, variant = "primary", label, className }: Props) {
  const [status, setStatus] = useState<"idle" | "waiting" | "connected">("idle");
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (pollingTimeoutRef.current) {
      clearTimeout(pollingTimeoutRef.current);
      pollingTimeoutRef.current = null;
    }
  }

  useEffect(() => () => stopPolling(), []);

  function startPolling(orgId: string) {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch(`${API_BASE_URL}/api/telegram/status?org=${encodeURIComponent(orgId)}`);
        const data = (await resp.json()) as { connected: boolean };
        if (data.connected) {
          stopPolling();
          setStatus("connected");
        }
      } catch {
        // мережева помилка — просто ігноруємо, продовжуємо polling
      }
    }, 3000);

    pollingTimeoutRef.current = setTimeout(() => {
      stopPolling();
      setStatus(prev => (prev === "waiting" ? "idle" : prev));
    }, 5 * 60 * 1000);
  }

  function handleClick() {
    const botName = readBotName();
    if (organizationId) {
      // Той самий payload-формат, що Settings: дефіси UUID заборонені
      // в Telegram deep link payload, замінюємо на підкреслення —
      // webhook (telegramWebhook.ts) відновлює UUID назад.
      const safeOrgId = organizationId.replace(/-/g, "_");
      window.open(`https://t.me/${botName}?start=${safeOrgId}`, "_blank", "noopener,noreferrer");
      setStatus("waiting");
      startPolling(organizationId);
    } else {
      // Немає організації в контексті (лендінг/незалогінений) —
      // просто відкриваємо бота без payload, /start без параметру
      // показує ознайомче повідомлення (telegramWebhook.ts).
      window.open(`https://t.me/${botName}`, "_blank", "noopener,noreferrer");
    }
  }

  const baseClass = "inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80";
  const style =
    variant === "primary"
      ? { background: "rgba(140,246,255,0.1)", border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }
      : { background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "var(--text-secondary)" };

  if (status === "connected") {
    return (
      <span className={`inline-flex items-center gap-2 text-sm ${className ?? ""}`} style={{ color: "var(--lime)" }}>
        <CheckCircle2 size={15} /> Telegram підключено
      </span>
    );
  }

  return (
    <button onClick={handleClick} className={`${baseClass} ${className ?? ""}`} style={style}>
      {status === "waiting" ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
      {status === "waiting" ? "Очікуємо підключення..." : (label ?? "Підключити Telegram")}
    </button>
  );
}
