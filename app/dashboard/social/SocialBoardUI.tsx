"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, Loader2, Send, Sparkles, Trash2, Clock, CheckCircle2, XCircle, FileEdit } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface SocialConnection {
  id: string;
  platform: string;
  account_label: string | null;
  telegram_chat_id: string;
  is_active: boolean;
  created_at: string;
}

interface SocialPost {
  id: string;
  connection_id: string | null;
  content: string;
  hashtags: string[] | null;
  scheduled_at: string | null;
  published_at: string | null;
  status: string;
  fail_reason: string | null;
  ai_generated: boolean;
  created_at: string;
}

interface Props {
  organizationId: string;
  accessToken: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: "Чернетка", color: "var(--text-tertiary)", icon: FileEdit },
  scheduled: { label: "Заплановано", color: "var(--cyan)", icon: Clock },
  published: { label: "Опубліковано", color: "var(--lime)", icon: CheckCircle2 },
  failed: { label: "Помилка", color: "#ff8080", icon: XCircle },
};

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function SocialBoardUI({ organizationId, accessToken }: Props) {
  const [connections, setConnections] = useState<SocialConnection[] | null>(null);
  const [posts, setPosts] = useState<SocialPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Підключення каналу ──
  const [showConnect, setShowConnect] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [connecting, setConnecting] = useState(false);

  // ── Новий пост ──
  const [showNewPost, setShowNewPost] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [postConnectionId, setPostConnectionId] = useState("");
  const [postScheduledAt, setPostScheduledAt] = useState("");
  const [creatingPost, setCreatingPost] = useState(false);

  // ── AI-генерація ──
  const [showGenerate, setShowGenerate] = useState(false);
  const [genTopic, setGenTopic] = useState("");
  const [genTone, setGenTone] = useState("");
  const [generating, setGenerating] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const loadConnections = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/connections?organization_id=${organizationId}`, { headers: authHeaders });
      const data = await res.json();
      setConnections(data.connections ?? []);
    } catch {
      setConnections([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, accessToken]);

  const loadPosts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/posts?organization_id=${organizationId}`, { headers: authHeaders });
      const data = await res.json();
      setPosts(data.posts ?? []);
    } catch {
      setPosts([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, accessToken]);

  useEffect(() => {
    loadConnections();
    loadPosts();
  }, [loadConnections, loadPosts]);

  const activeConnections = connections?.filter(c => c.is_active) ?? [];

  async function connectChannel(e: React.FormEvent) {
    e.preventDefault();
    if (!botToken.trim() || !chatId.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/connections`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          bot_token: botToken.trim(),
          telegram_chat_id: chatId.trim(),
          account_label: accountLabel.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setBotToken("");
      setChatId("");
      setAccountLabel("");
      setShowConnect(false);
      await loadConnections();
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectChannel(id: string) {
    if (!confirm("Відключити цей канал? Заплановані пости на нього більше не публікуватимуться.")) return;
    try {
      await fetch(`${API_BASE_URL}/api/social/connections/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      await loadConnections();
    } catch { /* ignore */ }
  }

  async function createPost(e: React.FormEvent) {
    e.preventDefault();
    if (!postContent.trim()) return;
    setCreatingPost(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/posts`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          connection_id: postConnectionId || undefined,
          content: postContent.trim(),
          scheduled_at: postScheduledAt ? new Date(postScheduledAt).toISOString() : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setPostContent("");
      setPostScheduledAt("");
      setShowNewPost(false);
      await loadPosts();
    } finally {
      setCreatingPost(false);
    }
  }

  async function deletePost(id: string) {
    if (!confirm("Видалити цей пост?")) return;
    try {
      await fetch(`${API_BASE_URL}/api/social/posts/${id}`, {
        method: "DELETE",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      await loadPosts();
    } catch { /* ignore */ }
  }

  async function generateWithAi(e: React.FormEvent) {
    e.preventDefault();
    if (!genTopic.trim()) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/social/generate`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, topic: genTopic.trim(), tone: genTone.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setPostContent(data.content);
      setShowGenerate(false);
      setGenTopic("");
      setGenTone("");
      setShowNewPost(true);
    } finally {
      setGenerating(false);
    }
  }

  const inputStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* ── Підключені канали ── */}
      <div className="glow-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Telegram-канали</h2>
          {!showConnect && (
            <button onClick={() => setShowConnect(true)} className="glow-button text-xs !py-1.5 !px-3 flex items-center gap-1.5">
              <Plus size={12} /> Підключити канал
            </button>
          )}
        </div>

        {showConnect && (
          <form onSubmit={connectChannel} className="space-y-2 p-3 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
              Створіть бота через <span className="font-mono">@BotFather</span> в Telegram, додайте його адміністратором вашого каналу і вставте токен та ID каналу нижче.
            </p>
            <input
              value={botToken}
              onChange={e => setBotToken(e.target.value)}
              placeholder="Bot token (від @BotFather)"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono"
              style={inputStyle}
              autoFocus
            />
            <input
              value={chatId}
              onChange={e => setChatId(e.target.value)}
              placeholder="Chat ID або @username_каналу"
              className="w-full rounded-lg px-3 py-2 text-sm font-mono"
              style={inputStyle}
            />
            <input
              value={accountLabel}
              onChange={e => setAccountLabel(e.target.value)}
              placeholder="Назва (необов'язково, напр. 'Основний канал')"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
            <div className="flex items-center gap-2">
              <button type="submit" disabled={connecting} className="glow-button text-sm !py-2 !px-4">
                {connecting ? <Loader2 size={14} className="animate-spin" /> : "Підключити і перевірити"}
              </button>
              <button type="button" onClick={() => setShowConnect(false)} className="text-sm text-[var(--text-tertiary)]">Скасувати</button>
            </div>
          </form>
        )}

        {connections === null ? (
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        ) : activeConnections.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Ще немає підключених каналів.</p>
        ) : (
          <div className="space-y-1.5">
            {activeConnections.map(c => (
              <div key={c.id} className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Send size={13} style={{ color: "var(--cyan)" }} />
                  <span className="text-sm truncate">{c.account_label || c.telegram_chat_id}</span>
                </div>
                <button onClick={() => disconnectChannel(c.id)} className="text-[var(--text-tertiary)] hover:text-[#ff8080] transition-colors shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Дії ── */}
      <div className="flex items-center gap-2">
        {!showNewPost && (
          <button onClick={() => setShowNewPost(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
            <Plus size={14} /> Новий пост
          </button>
        )}
        {!showGenerate && (
          <button onClick={() => setShowGenerate(true)} className="text-sm px-4 py-2 rounded-lg flex items-center gap-1.5" style={{ border: "1px solid rgba(140,246,255,0.2)", color: "var(--cyan)" }}>
            <Sparkles size={14} /> Згенерувати AI
          </button>
        )}
      </div>

      {showGenerate && (
        <form onSubmit={generateWithAi} className="glow-card p-4 space-y-2">
          <input
            value={genTopic}
            onChange={e => setGenTopic(e.target.value)}
            placeholder="Тема посту (напр. 'знижка 20% на літню колекцію')"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
            autoFocus
          />
          <input
            value={genTone}
            onChange={e => setGenTone(e.target.value)}
            placeholder="Тон (необов'язково, напр. 'грайливий')"
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={inputStyle}
          />
          <div className="flex items-center gap-2">
            <button type="submit" disabled={generating} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
              {generating ? <Loader2 size={14} className="animate-spin" /> : <><Sparkles size={14} /> Згенерувати</>}
            </button>
            <button type="button" onClick={() => setShowGenerate(false)} className="text-sm text-[var(--text-tertiary)]">Скасувати</button>
          </div>
        </form>
      )}

      {showNewPost && (
        <form onSubmit={createPost} className="glow-card p-4 space-y-2">
          <textarea
            value={postContent}
            onChange={e => setPostContent(e.target.value)}
            placeholder="Текст посту..."
            rows={5}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none"
            style={inputStyle}
          />
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={postConnectionId}
              onChange={e => setPostConnectionId(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            >
              <option value="">Оберіть канал</option>
              {activeConnections.map(c => (
                <option key={c.id} value={c.id}>{c.account_label || c.telegram_chat_id}</option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={postScheduledAt}
              onChange={e => setPostScheduledAt(e.target.value)}
              className="rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
            />
            <button type="submit" disabled={creatingPost} className="glow-button text-sm !py-2 !px-4">
              {creatingPost ? <Loader2 size={14} className="animate-spin" /> : postScheduledAt ? "Запланувати" : "Зберегти чернетку"}
            </button>
            <button type="button" onClick={() => setShowNewPost(false)} className="text-sm text-[var(--text-tertiary)]">Скасувати</button>
          </div>
          <p className="text-xs text-[var(--text-tertiary)]">Без дати публікації пост збережеться як чернетка.</p>
        </form>
      )}

      {/* ── Контент-календар ── */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold px-1">Пости</h2>
        {posts === null ? (
          <div className="glow-card p-10 text-center">
            <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : posts.length === 0 ? (
          <div className="glow-card p-10 text-center">
            <p className="text-sm text-[var(--text-secondary)]">Ще немає постів — створіть перший.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map(post => {
              const meta = STATUS_META[post.status] ?? STATUS_META.draft;
              const StatusIcon = meta.icon;
              return (
                <div key={post.id} className="glow-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm flex-1 whitespace-pre-wrap">{post.content}</p>
                    {post.status !== "published" && (
                      <button onClick={() => deletePost(post.id)} className="text-[var(--text-tertiary)] hover:text-[#ff8080] transition-colors shrink-0">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-3 text-xs text-[var(--text-tertiary)]">
                    <span className="flex items-center gap-1" style={{ color: meta.color }}>
                      <StatusIcon size={12} /> {meta.label}
                    </span>
                    {post.ai_generated && <span className="flex items-center gap-1"><Sparkles size={11} /> AI</span>}
                    {post.scheduled_at && post.status === "scheduled" && <span>Заплановано: {fmtDateTime(post.scheduled_at)}</span>}
                    {post.published_at && <span>Опубліковано: {fmtDateTime(post.published_at)}</span>}
                    {post.fail_reason && <span style={{ color: "#ff8080" }}>{post.fail_reason}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
