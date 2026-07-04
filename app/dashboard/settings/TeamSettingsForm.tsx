"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Users, UserPlus, X, Loader2, Crown, Mail } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

interface Member {
  id: string;
  userId: string;
  role: string;
  fullName: string | null;
  email: string | null;
}
interface Invite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
}
interface TeamData {
  members: Member[];
  invites: Invite[];
  currentUserRole: string;
  canManage: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Власник",
  admin: "Адміністратор",
  editor: "Редактор",
  viewer: "Перегляд",
  member: "Учасник",
};

const INVITE_ROLES = [
  { value: "editor", label: "Редактор", hint: "Керує сайтами й алертами" },
  { value: "viewer", label: "Перегляд", hint: "Тільки дивиться дашборд" },
  { value: "admin", label: "Адміністратор", hint: "Повний доступ, окрім видалення власника" },
];

interface Props { hasAccess: boolean; }

export function TeamSettingsForm({ hasAccess }: Props) {
  const [data, setData] = useState<TeamData | null>(null);
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    const supabase = createClient();
    return supabase.auth.getSession()
      .then(({ data: { session } }) => {
        const token = session?.access_token;
        if (!token) return null;
        return fetch(`${API_URL}/api/team`, { headers: { Authorization: `Bearer ${token}` } })
          .then(resp => resp.ok ? resp.json() : null);
      })
      .then(result => { if (result) setData(result); })
      .catch(() => {
        // тихо ігноруємо — панель просто лишиться в стані завантаження
      });
  }, []);

  useEffect(() => {
    if (hasAccess) load();
  }, [hasAccess, load]);

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

  async function handleInvite() {
    if (!inviteEmail.trim() || !inviteEmail.includes("@")) {
      setError("Вкажіть коректний email");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const resp = await authedFetch("/api/team/invite", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const result = await resp.json() as { ok?: boolean; error?: string; message?: string };
      if (resp.ok && result.ok) {
        setInviteEmail("");
        setShowInviteForm(false);
        await load();
      } else {
        setError(result.message ?? result.error ?? "Не вдалося надіслати запрошення");
      }
    } catch {
      setError("Помилка мережі");
    } finally {
      setSending(false);
    }
  }

  async function handleRevoke(inviteId: string) {
    try {
      await authedFetch(`/api/team/invite/${inviteId}`, { method: "DELETE" });
      await load();
    } catch { /* ignore */ }
  }

  async function handleRoleChange(memberId: string, role: string) {
    try {
      await authedFetch(`/api/team/member/${memberId}`, { method: "PATCH", body: JSON.stringify({ role }) });
      await load();
    } catch { /* ignore */ }
  }

  async function handleRemove(memberId: string) {
    if (!confirm("Видалити цю людину з команди?")) return;
    try {
      await authedFetch(`/api/team/member/${memberId}`, { method: "DELETE" });
      await load();
    } catch { /* ignore */ }
  }

  if (!hasAccess) {
    return (
      <div className="rounded-2xl p-5"
        style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <div className="flex items-center gap-2.5 mb-2">
          <Users size={14} className="text-[var(--text-tertiary)]" />
          <h2 className="text-sm font-semibold">Команда</h2>
        </div>
        <p className="text-sm text-[var(--text-tertiary)] leading-relaxed">
          Запрошення тимейтів доступне з плану Growth. Додайте колег — редакторів для керування сайтами
          або перегляд для клієнтів.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5"
      style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <Users size={14} className="text-[var(--text-tertiary)]" />
          <h2 className="text-sm font-semibold">Команда</h2>
        </div>
        {data?.canManage && (
          <button
            onClick={() => setShowInviteForm(!showInviteForm)}
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 flex items-center gap-1.5"
            style={{ background: "var(--lime)", color: "#0a0a0a" }}
          >
            <UserPlus size={12} /> Запросити
          </button>
        )}
      </div>

      {showInviteForm && (
        <div className="rounded-xl p-4 mb-4" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="colleague@example.com"
            className="w-full text-sm px-3 py-2 rounded-lg outline-none mb-3"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
          />
          <div className="flex flex-wrap gap-1.5 mb-3">
            {INVITE_ROLES.map(r => (
              <button
                key={r.value}
                onClick={() => setInviteRole(r.value)}
                title={r.hint}
                className="text-xs px-2.5 py-1.5 rounded-lg transition-colors"
                style={{
                  background: inviteRole === r.value ? "rgba(214,255,63,0.12)" : "rgba(255,255,255,0.03)",
                  border: `1px solid ${inviteRole === r.value ? "rgba(214,255,63,0.4)" : "rgba(255,255,255,0.08)"}`,
                  color: inviteRole === r.value ? "var(--lime)" : "var(--text-secondary)",
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
          {error && <p className="text-xs mb-2" style={{ color: "#F5675A" }}>{error}</p>}
          <button
            onClick={handleInvite}
            disabled={sending}
            className="w-full text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
            style={{ background: "var(--lime)", color: "#0a0a0a" }}
          >
            {sending && <Loader2 size={13} className="animate-spin" />}
            {sending ? "Надсилання..." : "Надіслати запрошення"}
          </button>
        </div>
      )}

      {!data ? (
        <div className="flex justify-center py-6 text-[var(--text-tertiary)]">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-0 divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          {data.members.map(m => (
            <div key={m.id} className="flex items-center justify-between py-3 first:pt-0">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium truncate">{m.fullName || m.email || "—"}</span>
                  {m.role === "owner" && <Crown size={11} className="text-[var(--lime)] shrink-0" />}
                </div>
                <p className="text-xs text-[var(--text-tertiary)] font-mono truncate">{m.email}</p>
              </div>
              {data.canManage && m.role !== "owner" ? (
                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={m.role}
                    onChange={e => handleRoleChange(m.id, e.target.value)}
                    className="text-xs px-2 py-1.5 rounded-lg outline-none"
                    style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-secondary)" }}
                  >
                    <option value="admin">Адміністратор</option>
                    <option value="editor">Редактор</option>
                    <option value="viewer">Перегляд</option>
                  </select>
                  <button onClick={() => handleRemove(m.id)} className="text-[var(--text-tertiary)] hover:text-[#F5675A] transition-colors">
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <span className="text-xs px-2 py-1 rounded-md shrink-0" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-tertiary)" }}>
                  {ROLE_LABELS[m.role] ?? m.role}
                </span>
              )}
            </div>
          ))}

          {data.invites.map(inv => (
            <div key={inv.id} className="flex items-center justify-between py-3">
              <div className="min-w-0 flex items-center gap-2">
                <Mail size={13} className="text-[var(--text-tertiary)] shrink-0" />
                <div>
                  <span className="text-sm truncate">{inv.email}</span>
                  <p className="text-xs text-[var(--text-tertiary)]">Очікує · {ROLE_LABELS[inv.role] ?? inv.role}</p>
                </div>
              </div>
              {data.canManage && (
                <button onClick={() => handleRevoke(inv.id)} className="text-xs text-[var(--text-tertiary)] hover:text-[#F5675A] transition-colors shrink-0">
                  Відкликати
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
