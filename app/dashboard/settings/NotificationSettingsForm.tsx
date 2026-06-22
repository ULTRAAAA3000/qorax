"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Bell, Mail, Send, Lock } from "lucide-react";

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
}

export function NotificationSettingsForm({
  organizationId,
  initialSettings,
  isTelegramAvailable,
  planName,
}: Props) {
  const [settings, setSettings] = useState<NotifSettings>({
    email_enabled: initialSettings?.email_enabled ?? true,
    telegram_enabled: initialSettings?.telegram_enabled ?? false,
    telegram_chat_id: initialSettings?.telegram_chat_id ?? "",
    notify_site_down: initialSettings?.notify_site_down ?? true,
    notify_ssl_domain_expiry: initialSettings?.notify_ssl_domain_expiry ?? true,
    notify_broken_links: initialSettings?.notify_broken_links ?? true,
    notify_speed_degraded: initialSettings?.notify_speed_degraded ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const supabase = createClient();
      const { error: upsertError } = await supabase
        .from("notification_settings")
        .upsert({
          organization_id: organizationId,
          email_enabled: settings.email_enabled,
          telegram_enabled: isTelegramAvailable ? settings.telegram_enabled : false,
          telegram_chat_id: isTelegramAvailable ? settings.telegram_chat_id : null,
          notify_site_down: settings.notify_site_down,
          notify_ssl_domain_expiry: settings.notify_ssl_domain_expiry,
          notify_broken_links: settings.notify_broken_links,
          notify_speed_degraded: settings.notify_speed_degraded,
        }, { onConflict: "organization_id" });

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
            <NotifRow
              label="Сайт недоступний / відновлено"
              value={settings.notify_site_down}
              onChange={() => toggle("notify_site_down")}
            />
            <NotifRow
              label="SSL закінчується (30д і 7д)"
              value={settings.notify_ssl_domain_expiry}
              onChange={() => toggle("notify_ssl_domain_expiry")}
            />
            <NotifRow
              label="Знайдено биті посилання"
              value={settings.notify_broken_links}
              onChange={() => toggle("notify_broken_links")}
            />
            <NotifRow
              label="Падіння швидкості"
              value={settings.notify_speed_degraded}
              onChange={() => toggle("notify_speed_degraded")}
            />
          </div>
        )}
      </div>

      {/* Telegram block */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Send size={15} className="text-[var(--text-tertiary)]" />
            <span className="text-sm font-medium">Telegram сповіщення</span>
            {!isTelegramAvailable && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md"
                style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-tertiary)" }}>
                <Lock size={10} /> Growth
              </span>
            )}
          </div>
          <Toggle
            value={isTelegramAvailable && settings.telegram_enabled}
            onChange={() => isTelegramAvailable && toggle("telegram_enabled")}
            disabled={!isTelegramAvailable}
          />
        </div>

        {isTelegramAvailable && settings.telegram_enabled && (
          <div className="pl-6 border-l-2 space-y-3" style={{ borderColor: "var(--border-hairline)" }}>
            <div>
              <label className="text-xs text-[var(--text-tertiary)] mb-1.5 block">
                Chat ID (отримайте у @userinfobot в Telegram)
              </label>
              <input
                type="text"
                value={settings.telegram_chat_id ?? ""}
                onChange={e => setSettings(prev => ({ ...prev, telegram_chat_id: e.target.value }))}
                placeholder="-1001234567890"
                className="w-full text-sm font-mono px-3 py-2 rounded-lg outline-none transition-colors"
                style={{
                  background: "var(--bg)",
                  border: "1px solid var(--border-hairline)",
                  color: "var(--text-primary)",
                }}
                onFocus={e => e.target.style.borderColor = "var(--lime)"}
                onBlur={e => e.target.style.borderColor = "var(--border-hairline)"}
              />
            </div>
            <p className="text-xs text-[var(--text-tertiary)]">
              Інструкція: 1) Додайте бота <span className="font-mono text-[var(--cyan)]">@QoraxBot</span> у ваш чат або групу → 2) Напишіть /start → 3) Скопіюйте Chat ID з відповіді
            </p>
          </div>
        )}

        {!isTelegramAvailable && (
          <p className="text-xs text-[var(--text-tertiary)] pl-6 mt-1">
            Telegram алерти доступні з тарифу Growth. Зараз: {planName}.
          </p>
        )}
      </div>

      {/* Save button */}
      {error && (
        <p className="text-sm mb-3" style={{ color: "#F5675A" }}>{error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-sm font-medium px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--lime)", color: "#0C111D" }}
        >
          {saving ? "Збереження..." : "Зберегти налаштування"}
        </button>
        {saved && (
          <span className="text-sm" style={{ color: "var(--lime)" }}>✓ Збережено</span>
        )}
      </div>
    </div>
  );
}

function Toggle({ value, onChange, disabled }: {
  value: boolean; onChange: () => void; disabled?: boolean;
}) {
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

function NotifRow({ label, value, onChange }: {
  label: string; value: boolean; onChange: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      <Toggle value={value} onChange={onChange} />
    </div>
  );
}
