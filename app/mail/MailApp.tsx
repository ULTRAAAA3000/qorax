"use client";

import { useState, useEffect, useCallback } from "react";
import { Inbox, Loader2, Plus, Send, RefreshCw, Mail as MailIcon } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { useProductTour, type TourStep } from "@/app/lib/useProductTour";
import { TourButton } from "@/app/components/TourButton";

interface MailAccount {
  id: string;
  provider: string;
  email_address: string;
  last_synced_at: string | null;
}

interface MailThread {
  id: string;
  subject: string | null;
  participants: string[] | null;
  last_message_at: string;
  is_read: boolean;
}

interface MailMessage {
  id: string;
  direction: string;
  from_address: string;
  to_addresses: string[];
  body_html: string | null;
  body_text: string | null;
  sent_at: string;
}

interface MailContact {
  id: string;
  name: string | null;
  email: string | null;
  source: string;
  created_at: string;
}

async function getFreshToken(): Promise<string> {
  try {
    const { createClient } = await import("@/app/lib/supabase/client");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  } catch {
    return "";
  }
}

const MAIL_TOUR_STEPS: TourStep[] = [
  {
    element: '[data-tour="mail-compose"]',
    title: "Новий лист",
    description: "Напишіть і надішліть листа напряму з Qorax — без перемикання на Gmail.",
    side: "bottom",
  },
  {
    element: '[data-tour="mail-tabs"]',
    title: "Вхідні та Контакти",
    description: "Перемикайтесь між листуванням і контактами, які збираються автоматично з переписки.",
    side: "bottom",
  },
  {
    element: '[data-tour="mail-threads-list"]',
    title: "Список листів",
    description: "Тут усі ваші треди. Клікніть на будь-який, щоб прочитати повідомлення.",
    side: "right",
  },
  {
    element: '[data-tour="mail-sync"]',
    title: "Синхронізація",
    description: "Нові листи підтягуються автоматично, але можна оновити вручну в будь-який момент.",
    side: "left",
  },
];

// Qorax Mail — Шар 1. Три-панельний Inbox (треди зліва, лист по
// центру, форма нового листа) — той самий загальний layout, що
// звичайні поштові клієнти, MVP без пошуку/папок/лейблів (наступні
// ітерації Шару 1, не цей прохід).
export function MailApp({ organizationId }: { organizationId: string }) {
  const [view, setView] = useState<"inbox" | "contacts">("inbox");
  const [contacts, setContacts] = useState<MailContact[] | null>(null);
  const [accounts, setAccounts] = useState<MailAccount[] | null>(null);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [threads, setThreads] = useState<MailThread[] | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MailMessage[] | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showCompose, setShowCompose] = useState(false);
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");
  const [sending, setSending] = useState(false);

  // Тур має сенс лише коли реальний UI (треди/новий лист/синк) вже в
  // DOM — поки акаунт не підключено, рендериться зовсім інший екран
  // ("Підключіть Gmail") без жодного data-tour елемента. Порожній
  // масив кроків, доки accounts не завантажені й непорожні — хук сам
  // no-op'ає на steps.length === 0 (useProductTour.ts).
  const { startTour } = useProductTour("mail", accounts && accounts.length > 0 ? MAIL_TOUR_STEPS : []);

  const loadAccounts = useCallback(async () => {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/mail/accounts?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      const list: MailAccount[] = data.accounts ?? [];
      setAccounts(list);
      if (list.length > 0 && !activeAccountId) setActiveAccountId(list[0].id);
    } catch {
      setAccounts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const loadThreads = useCallback(async () => {
    if (!activeAccountId) return;
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/mail/threads?mail_account_id=${activeAccountId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setThreads(data.threads ?? []);
    } catch {
      setThreads([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAccountId]);

  const loadMessages = useCallback(async () => {
    if (!activeThreadId) return;
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/mail/threads/${activeThreadId}/messages`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      setMessages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId]);

  const loadContacts = useCallback(async () => {
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/mail/contacts?organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setContacts(data.contacts ?? []);
    } catch {
      setContacts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);
  useEffect(() => { loadThreads(); }, [loadThreads]);
  useEffect(() => { loadMessages(); }, [loadMessages]);
  useEffect(() => { if (view === "contacts" && contacts === null) loadContacts(); }, [view, contacts, loadContacts]);

  async function connectGmail() {
    setConnecting(true);
    const token = await getFreshToken();
    const authUrl = `${API_BASE_URL}/api/mail/auth?organization_id=${encodeURIComponent(organizationId)}&access_token=${encodeURIComponent(token)}`;
    window.location.href = authUrl;
  }

  async function syncNow() {
    if (!activeAccountId) return;
    setSyncing(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/mail/accounts/${activeAccountId}/sync`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка синхронізації"); return; }
      await loadThreads();
    } finally {
      setSyncing(false);
    }
  }

  async function sendMail(e: React.FormEvent) {
    e.preventDefault();
    if (!activeAccountId || !composeTo.trim() || !composeBody.trim()) return;
    setSending(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/mail/send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          mail_account_id: activeAccountId,
          to: composeTo.trim(),
          subject: composeSubject.trim(),
          body_html: composeBody.trim().replace(/\n/g, "<br>"),
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Не вдалося надіслати лист"); return; }
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      setShowCompose(false);
      await loadThreads();
    } finally {
      setSending(false);
    }
  }

  const activeThread = threads?.find(t => t.id === activeThreadId);

  // ── Немає підключеного акаунту ──
  if (accounts !== null && accounts.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="glow-card p-10 text-center max-w-md">
          <MailIcon size={28} className="mx-auto mb-4" style={{ color: "var(--cyan)" }} />
          <h1 className="font-display text-xl font-semibold mb-2">Підключіть поштову скриньку</h1>
          <p className="text-sm text-[var(--text-secondary)] mb-6">
            Qorax Mail працює через ваш Gmail-акаунт — ми нічого не хостимо, тільки читаємо й надсилаємо листи через офіційний Gmail API.
          </p>
          <button onClick={connectGmail} disabled={connecting} className="glow-button text-sm !py-2.5 !px-5">
            {connecting ? <Loader2 size={14} className="animate-spin" /> : "Підключити Gmail"}
          </button>
        </div>
      </div>
    );
  }

  if (accounts === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg)" }}>
        <Loader2 size={24} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  return (
    <div className="flex" style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Список тредів */}
      <div className="w-80 shrink-0 border-r flex flex-col" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
          <div className="flex items-center gap-2">
            <Inbox size={16} style={{ color: "var(--cyan)" }} />
            <span className="text-sm font-semibold">{accounts.find(a => a.id === activeAccountId)?.email_address}</span>
          </div>
          <div className="flex items-center gap-1">
            <TourButton onStart={startTour} />
            <button onClick={syncNow} disabled={syncing} data-tour="mail-sync" className="text-[var(--text-tertiary)]">
              {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            </button>
          </div>
        </div>

        <button onClick={() => setShowCompose(true)} data-tour="mail-compose" className="glow-button text-sm !py-2 !mx-4 !mt-3 flex items-center justify-center gap-1.5">
          <Plus size={14} /> Новий лист
        </button>

        <div className="flex items-center gap-1 px-4 mt-3" data-tour="mail-tabs">
          <button
            onClick={() => setView("inbox")}
            className="text-xs px-2.5 py-1 rounded-lg"
            style={view === "inbox" ? { background: "rgba(214,255,63,0.1)", color: "var(--lime)" } : { color: "var(--text-tertiary)" }}
          >
            Вхідні
          </button>
          <button
            onClick={() => setView("contacts")}
            className="text-xs px-2.5 py-1 rounded-lg"
            style={view === "contacts" ? { background: "rgba(214,255,63,0.1)", color: "var(--lime)" } : { color: "var(--text-tertiary)" }}
          >
            Контакти
          </button>
        </div>

        {view === "contacts" ? (
          <div className="flex-1 overflow-y-auto mt-3">
            {contacts === null ? (
              <div className="p-6 text-center"><Loader2 size={16} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} /></div>
            ) : contacts.length === 0 ? (
              <p className="text-xs text-center p-6" style={{ color: "var(--text-tertiary)" }}>Ще немає контактів — з'являться автоматично з листування.</p>
            ) : (
              contacts.map(contact => (
                <div key={contact.id} className="px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                  <p className="text-sm">{contact.name || contact.email}</p>
                  {contact.name && <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{contact.email}</p>}
                </div>
              ))
            )}
          </div>
        ) : (
        <div className="flex-1 overflow-y-auto mt-3" data-tour="mail-threads-list">
          {threads === null ? (
            <div className="p-6 text-center"><Loader2 size={16} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} /></div>
          ) : threads.length === 0 ? (
            <p className="text-xs text-center p-6" style={{ color: "var(--text-tertiary)" }}>Немає листів. Спробуйте синхронізувати.</p>
          ) : (
            threads.map(thread => (
              <button
                key={thread.id}
                onClick={() => setActiveThreadId(thread.id)}
                className="w-full text-left px-4 py-3 border-b transition-colors"
                style={{
                  borderColor: "rgba(255,255,255,0.04)",
                  background: activeThreadId === thread.id ? "rgba(255,255,255,0.03)" : "transparent",
                }}
              >
                <p className="text-sm truncate" style={{ fontWeight: thread.is_read ? 400 : 600 }}>{thread.subject || "(без теми)"}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(thread.last_message_at).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}
                </p>
              </button>
            ))
          )}
        </div>
        )}
      </div>

      {/* Лист / компонування */}
      <div className="flex-1 flex flex-col">
        {error && (
          <div className="m-4 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
            {error}
          </div>
        )}

        {showCompose ? (
          <form onSubmit={sendMail} className="p-6 space-y-3 max-w-xl">
            <h2 className="text-sm font-semibold mb-2">Новий лист</h2>
            <input
              type="email"
              required
              value={composeTo}
              onChange={e => setComposeTo(e.target.value)}
              placeholder="Кому"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            />
            <input
              value={composeSubject}
              onChange={e => setComposeSubject(e.target.value)}
              placeholder="Тема"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            />
            <textarea
              required
              value={composeBody}
              onChange={e => setComposeBody(e.target.value)}
              placeholder="Текст листа..."
              rows={10}
              className="w-full rounded-lg px-3 py-2 text-sm resize-none"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCompose(false)} className="text-sm px-4 py-2 rounded-lg" style={{ color: "var(--text-tertiary)" }}>
                Скасувати
              </button>
              <button type="submit" disabled={sending} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
                {sending ? <Loader2 size={14} className="animate-spin" /> : (<><Send size={14} /> Надіслати</>)}
              </button>
            </div>
          </form>
        ) : !activeThread ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>Оберіть лист зліва.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <h1 className="font-display text-lg font-semibold">{activeThread.subject || "(без теми)"}</h1>
            {messages === null ? (
              <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            ) : (
              messages.map(msg => (
                <div key={msg.id} className="glow-card p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium">{msg.from_address}</span>
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(msg.sent_at).toLocaleString("uk-UA")}
                    </span>
                  </div>
                  {msg.body_html ? (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }} dangerouslySetInnerHTML={{ __html: msg.body_html }} />
                  ) : (
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{msg.body_text}</p>
                  )}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
