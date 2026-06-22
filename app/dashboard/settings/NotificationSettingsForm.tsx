"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Bell, Mail, Send, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface NotifSettings {
  email_enabled: boolean;
  telegram_enabled: boolean;
  telegram_chat_id: string | null;
  notify_site_down: boolean;
  notify_ssl_domain_expiry: boolean;
  notify_broken_links: boolean;
  notify_speed_degraded: boolean;
}

interface Props {
  organizationId: string;
  initialSettings: NotifSettings | null;
  isTelegramAvailable: boolean;
  planName: string;
  telegramBotName: string; // ім'я бота без @ — для генерації deep link
}

export function NotificationSettingsForm({
  organizationId,
  initialSettings,
  isTelegramAvailable,
  planName,
  telegramBotName,
}: Props) {
  const [settings, setSettings] = useState<NotifSettings>({
    email_enabled: initialSettings?.email_enabled ?? true,
    telegram_enabled: initialSettings?.telegram_enabled ?? false,
    telegram_chat_id: initialSettings?.telegram_chat_id ?? null,
    notify_site_down: initialSettings?.notify_site_down ?? true,
    notify_ssl_domain_expiry: initialSettings?.notify_ssl_domain_expiry ?? true,
    notify_broken_links: initialSettings?.notify_broken_links ?? true,
    notify_speed_degraded: initialSettings?.notify_speed_degraded ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Стан підключення Telegram:
  //   idle        — ще не починали підключення
  //   waiting     — користувач відкрив бота, polling кожні 3с
  //   connected   — chat_id отримано, показуємо ✅
  //   disconnecting — іде відключення
  const [tgStatus, setTgStatus] = useState<"idle" | "waiting" | "connected" | "disconnecting">(
    initialSettings?.telegram_chat_id && initialSettings?.telegram_enabled ? "connected" : "idle"
  );
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }

  // Запускаємо polling після того як користувач натиснув "Підключити"
  function startPolling() {
    stopPolling();
    pollingRef.current = setInterval(async () => {
      try {
        const resp = await fetch(
          `${API_BASE_URL}/api/telegram/status?org=${encodeURIComponent(organizationId)}`
        );
        const data = (await resp.json()) as { connected: boolean; chatId?: string };
        if (data.connected) {
          stopPolling();
          setTgStatus("connected");
          setSettings(prev => ({
            ...prev,
            telegram_enabled: true,
            telegram_chat_id: data.chatId ?? prev.telegram_chat_id,
          }));
        }
      } catch {
        // мережева помилка — просто ігноруємо, продовжуємо polling
      }
    }, 3000);
  }

  // Зупиняємо polling при розмонтуванні компоненту
  useEffect(() => () => stopPolling(), []);

  function handleConnectClick() {
    setTgStatus("waiting");
    // Відкриваємо бота в новій вкладці — org_id передається як deep link payload.
    // Telegram підставить його як параметр команди /start.
    const deepLink = `https://t.me/${telegramBotName}?start=${encodeURIComponent(organizationId)}`;
    window.open(deepLink, "_blank", "noopener,noreferrer");
    startPolling();
  }

  async function handleDisconnect() {
    setTgStatus("disconnecting");
    stopPolling();
    try {
      const supabase = createClient();
      await supabase
        .from("notification_settings")
        .upsert(
          {
            organization_id: organizationId,
            telegram_enabled: false,
            telegram_chat_id: null,
          },
          { onConflict: "organization_id" }
        );
      setSettings(prev => ({ ...prev, telegram_enabled: false, telegram_chat_id: null }));
      setTgStatus("idle");
    } catch {
      setTgStatus("connected");
    }
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const supabase = createClient();
      const { error: upsertError } = await supabase
        .from("notification_settings")
        .upsert(
          {
            organization_id: organizationId,
            email_enabled: settings.email_enabled,
            telegram_enabled: isTelegramAvailable ? settings.telegram_enabled : false,
            telegram_chat_id: isTelegramAvailable ? settings.telegram_chat_id : null,
            notify_site_down: settings.notify_site_down,
            notify_ssl_domain_expiry: settings.notify_ssl_domain_expiry,
            notify_broken_links: settings.notify_broken_links,
            notify_speed_degraded: settings.notify_speed_degraded,
          },
          { onConflict: "organization_id" }
        );
      if (upsertError) {
        setError("Помилка збереження: " + upsertError.message);
      } else {
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      }
    } catch {
      setError("Щось пішло не так, спробуйте ще раз.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(key: keyof NotifSettings) {
    setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
      <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-5 flex items-center gap-2">
        <Bell size={13} /> Сповіщення
      </h2>

      {/* Email block */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Mail size={15} className="text-[var(--text-tertiary)]" />
            <span className="text-sm font-medium">Email сповіщення</span>
          </div>
          <Toggle value={settings.email_enabled} onChange={() => toggle("email_enabled")} />
        </div>

        {settings.email_enabled && (
          <div className="space-y-3 pl-6 border-l-2" style={{ borderColor: "var(--border-hairline)" }}>
            <NotifRow label="Сайт недоступний / відновлено" value={settings.notify_site_down} onChange={() => toggle("notify_site_down")} />
            <NotifRow label="SSL закінчується (30д і 7д)" value={settings.notify_ssl_domain_expiry} onChange={() => toggle("notify_ssl_domain_expiry")} />
            <NotifRow label="Знайдено биті посилання" value={settings.notify_broken_links} onChange={() => toggle("notify_broken_links")} />
            <NotifRow label="Падіння швидкості" value={settings.notify_speed_degraded} onChange={() => toggle("notify_speed_degraded")} />
          </div>
        )}
      </div>

      {/* Telegram block */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Send size={15} className="text-[var(--text-tertiary)]" />
          <span className="text-sm font-medium">Telegram сповіщення</span>
          {!isTelegramAvailable && (
            <span
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
              style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-tertiary)" }}
            >
              <Lock size={10} /> Growth
            </span>
          )}
        </div>

        {!isTelegramAvailable ? (
          <p className="text-xs text-[var(--text-tertiary)] pl-6">
            Telegram алерти доступні з тарифу Growth. Зараз: {planName}.
          </p>
        ) : tgStatus === "connected" || tgStatus === "disconnecting" ? (
          /* ── Підключено ── */
          <div className="pl-6 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} style={{ color: "var(--lime)" }} />
              <span className="text-sm" style={{ color: "var(--lime)" }}>Telegram підключено</span>
              {settings.telegram_chat_id && (
                <span className="text-xs font-mono text-[var(--text-tertiary)]">
                  ID: {settings.telegram_chat_id}
                </span>
              )}
            </div>
            <button
              onClick={handleDisconnect}
              disabled={tgStatus === "disconnecting"}
              className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
            >
              {tgStatus === "disconnecting" ? "Відключення..." : "Відключити"}
            </button>
          </div>
        ) : tgStatus === "waiting" ? (
          /* ── Очікуємо ── */
          <div className="pl-6 space-y-3">
            <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
              <Loader2 size={14} className="animate-spin" style={{ color: "var(--cyan)" }} />
              Очікуємо підключення...
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">
              Відкрийте бота <span className="font-mono" style={{ color: "var(--cyan)" }}>@{telegramBotName}</span> і натисніть{" "}
              <span className="font-medium">START</span> — підключення відбудеться автоматично.
            </p>
            <button
              onClick={handleConnectClick}
              className="text-xs underline text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              Відкрити бота ще раз →
            </button>
          </div>
        ) : (
          /* ── Idle — кнопка підключення ── */
          <div className="pl-6 space-y-3">
            <button
              onClick={handleConnectClick}
              className="inline-flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
              style={{ background: "rgba(140,246,255,0.1)", border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }}
            >
              <Send size={14} />
              Підключити Telegram
            </button>
            <p className="text-xs text-[var(--text-tertiary)]">
              Відкриється бот{" "}
              <span className="font-mono" style={{ color: "var(--cyan)" }}>@{telegramBotName}</span>.
              Натисніть START — і алерти налаштуються автоматично, без зайвих кроків.
            </p>
          </div>
        )}
      </div>

      {/* Save button — тільки для email-налаштувань */}
      {error && <p className="text-sm mb-3" style={{ color: "#F5675A" }}>{error}</p>}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--lime)", color: "#0C111D" }}
        >
          {saving ? "Збереження..." : "Зберегти налаштування"}
        </button>
        {saved && <span className="text-sm" style={{ color: "var(--lime)" }}>✓ Збережено</span>}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }: { value: boolean; onChange: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={onChange}
      disabled={disabled}
      className="relative w-10 h-6 rounded-full transition-colors duration-200 shrink-0 disabled:opacity-40"
      style={{ background: value ? "var(--lime)" : "rgba(255,255,255,0.12)" }}
    >
      <span
        className="absolute top-1 left-1 w-4 h-4 rounded-full transition-transform duration-200"
        style={{
          background: value ? "#0C111D" : "rgba(255,255,255,0.5)",
          transform: value ? "translateX(16px)" : "translateX(0)",
        }}
      />
    </button>
  );
}

function NotifRow({ label, value, onChange }: { label: string; value: boolean; onChange: () => void }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}
