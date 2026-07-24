"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Code2, Plus, Trash2, Loader2, Copy, Check } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

/**
 * DeveloperApiSettingsForm — розділ "Developer API" у налаштуваннях,
 * керування ключами публічної Qorax SEO Platform (MVP: лише SEO
 * Audit API, POST /api/v1/audit). Той самий паттерн authedFetch, що
 * TeamSettingsForm.tsx — прямий виклик worker API з Supabase JWT
 * поточного користувача (не сам API-ключ, це для management, не для
 * самого Developer API виклику).
 */

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  requests_limit: number;
  requests_used: number;
  revoked: boolean;
  created_at: string;
  last_used_at: string | null;
}

export function DeveloperApiSettingsForm() {
  const [keys, setKeys] = useState<ApiKeyRow[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function authedFetch(path: string, options: RequestInit = {}) {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) throw new Error("no session");
    return fetch(`${API_URL}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
  }

  const load = useCallback(() => {
    authedFetch("/api/developer/keys")
      .then(resp => (resp.ok ? resp.json() : null))
      .then(result => { if (result) setKeys(result.keys); })
      .catch(() => {
        // тихо ігноруємо — панель лишиться в стані завантаження
      });
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setCreating(true);
    setError(null);
    try {
      const resp = await authedFetch("/api/developer/keys", { method: "POST" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setError(body?.error ?? "Не вдалося створити ключ");
        return;
      }
      const body = await resp.json();
      setNewKey(body.apiKey);
      load();
    } catch {
      setError("Помилка мережі");
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(id: string) {
    setRevokingId(id);
    setError(null);
    try {
      const resp = await authedFetch(`/api/developer/keys/${id}`, { method: "DELETE" });
      if (!resp.ok) {
        const body = await resp.json().catch(() => null);
        setError(body?.error ?? "Не вдалося відкликати ключ");
        return;
      }
      load();
    } catch {
      setError("Помилка мережі");
    } finally {
      setRevokingId(null);
    }
  }

  function copyNewKey() {
    if (!newKey) return;
    navigator.clipboard.writeText(newKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Code2 size={14} className="text-[var(--text-tertiary)]" />
          <h2 className="text-sm font-semibold">Developer API</h2>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ background: "var(--lime)", color: "#0a0a0a" }}
        >
          {creating ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
          Створити ключ
        </button>
      </div>

      <p className="text-xs text-[var(--text-tertiary)] mb-4 leading-relaxed">
        <strong>SEO Audit</strong> — <code className="font-mono">POST /api/v1/audit</code>.{" "}
        <strong>Schema</strong> — <code className="font-mono">POST /api/v1/schema</code>.{" "}
        <strong>Reporting</strong> — <code className="font-mono">POST /api/v1/report</code> (параметр <code className="font-mono">format</code>: html або json).{" "}
        <strong>Monitoring</strong> — <code className="font-mono">POST/GET/DELETE /api/v1/monitor</code> (стежить за title/canonical/schema/robots/швидкістю щогодини).{" "}
        Заголовок <code className="font-mono">Authorization: Bearer &lt;ключ&gt;</code>. 1000 запитів на місяць на ключ, спільний ліміт на всі чотири ендпоінти.
      </p>

      {newKey && (
        <div
          className="mb-4 rounded-xl p-4"
          style={{ background: "rgba(214,255,63,0.06)", border: "1px solid rgba(214,255,63,0.2)" }}
        >
          <p className="text-xs text-[var(--text-secondary)] mb-2">
            Збережіть цей ключ зараз — він більше ніколи не показуватиметься:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-xs font-mono px-3 py-2 rounded-lg break-all" style={{ background: "rgba(0,0,0,0.3)" }}>
              {newKey}
            </code>
            <button
              onClick={copyNewKey}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg transition-colors"
              style={{ background: "rgba(255,255,255,0.06)" }}
            >
              {copied ? <Check size={13} className="text-[var(--lime)]" /> : <Copy size={13} />}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
          {error}
        </div>
      )}

      {keys === null && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-6 justify-center">
          <Loader2 size={14} className="animate-spin" /> Завантаження...
        </div>
      )}

      {keys && keys.length === 0 && (
        <p className="text-sm text-[var(--text-tertiary)] text-center py-6">Ключів ще немає</p>
      )}

      {keys && keys.length > 0 && (
        <div className="space-y-2">
          {keys.map(k => (
            <div
              key={k.id}
              className="flex items-center gap-3 px-3 py-3 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="flex-1 min-w-0">
                <span className="text-sm font-mono">{k.key_prefix}…</span>
                <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {k.requests_used} / {k.requests_limit} запитів цього місяця
                  {k.revoked && <span className="ml-2 text-[#F5675A]">відкликано</span>}
                </div>
              </div>
              {!k.revoked && (
                <button
                  onClick={() => handleRevoke(k.id)}
                  disabled={revokingId === k.id}
                  className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg transition-colors hover:opacity-80"
                  style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A" }}
                  title="Відкликати ключ"
                >
                  {revokingId === k.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
