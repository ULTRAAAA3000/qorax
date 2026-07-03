"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, ChevronDown, Loader2, X } from "lucide-react";

interface Message {
  role: "user" | "model";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Чому мій сайт повільний?",
  "Що виправити в першу чергу?",
  "Скільки я втрачаю через ці проблеми?",
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

// Завжди беремо свіжий токен із Supabase client.
// Ніколи не використовуємо серверний токен з props — він може бути
// протухлим (Supabase JWT живе 1 годину, а сторінка може бути
// відкрита довше).
async function getFreshToken(): Promise<string> {
  try {
    const { createClient } = await import("@/app/lib/supabase/client");
    const supabase = createClient();
    // getSession повертає токен з localStorage — він найсвіжіший
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    // Якщо localStorage порожній — робимо network refresh
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  } catch {
    return "";
  }
}

function useChat(siteId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);

    const userMessage: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const token = await getFreshToken();
      if (!token) {
        setError("Сесія закінчилась — оновіть сторінку");
        return;
      }

      let resp: Response;
      try {
        resp = await fetch(`${API_BASE}/api/chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            site_id: siteId,
            messages: next,
          }),
        });
      } catch (fetchErr) {
        console.error("[QoraxusChat] network error:", fetchErr);
        setError("Мережева помилка — перевірте з'єднання");
        return;
      }

      let data: { reply?: string; error?: string; message?: string };
      try {
        data = (await resp.json()) as { reply?: string; error?: string; message?: string };
      } catch {
        console.error("[QoraxusChat] non-JSON response, status:", resp.status);
        setError(`Помилка сервера (${resp.status})`);
        return;
      }

      if (!resp.ok || data.error) {
        if (data.error === "upgrade_required") {
          setError("upgrade");
        } else {
          setError(data.error ?? data.message ?? "Помилка з'єднання");
        }
        return;
      }

      setMessages((prev) => [
        ...prev,
        { role: "model", content: data.reply ?? "" },
      ]);
    } catch (err) {
      console.error("[QoraxusChat] unexpected error:", err);
      setError("Не вдалося з'єднатися з асистентом");
    } finally {
      setLoading(false);
    }
  }

  return { messages, input, setInput, loading, error, send };
}

function ChatBody({
  siteName,
  messages,
  input,
  setInput,
  loading,
  error,
  send,
  onClose,
  autoFocus,
}: {
  siteName: string;
  messages: Message[];
  input: string;
  setInput: (v: string) => void;
  loading: boolean;
  error: string | null;
  send: (text: string) => void;
  onClose?: () => void;
  autoFocus?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 150);
  }, [autoFocus]);

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <div className="flex items-center justify-between gap-2.5 px-4 py-3.5 border-b shrink-0"
        style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(214,255,63,0.12)" }}
          >
            <Sparkles size={14} style={{ color: "var(--lime)" }} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-tight">Qoraxus</p>
            <p className="text-xs leading-tight truncate" style={{ color: "var(--text-tertiary)" }}>
              AI-асистент · {siteName}
            </p>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg transition-opacity hover:opacity-60 shrink-0"
          >
            <X size={15} style={{ color: "var(--text-tertiary)" }} />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {isEmpty && (
          <div className="space-y-3">
            {/* Welcome */}
            <div
              className="rounded-xl px-3.5 py-3 text-sm"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="font-medium mb-1" style={{ color: "var(--lime)" }}>
                Привіт! Я Qoraxus
              </p>
              <p style={{ color: "var(--text-secondary)" }}>
                Запитай про стан сайту, проблеми або що покращити, щоб більше заробляти.
              </p>
            </div>

            {/* Suggested questions */}
            <div className="space-y-1.5">
              <p className="text-xs px-0.5" style={{ color: "var(--text-tertiary)" }}>
                Спробуй запитати:
              </p>
              {SUGGESTED_QUESTIONS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="w-full text-left text-sm rounded-xl px-3.5 py-2.5 transition-colors hover:opacity-80"
                  style={{
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "var(--text-secondary)",
                  }}
                >
                  <ChevronDown
                    size={11}
                    className="inline mr-1.5 -rotate-90"
                    style={{ color: "var(--text-tertiary)" }}
                  />
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className="max-w-[90%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
              style={
                msg.role === "user"
                  ? {
                      background: "rgba(214,255,63,0.12)",
                      border: "1px solid rgba(214,255,63,0.2)",
                      color: "var(--text-primary)",
                    }
                  : {
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.06)",
                      color: "var(--text-secondary)",
                    }
              }
            >
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div
              className="rounded-xl px-3.5 py-2.5 flex items-center gap-2"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <Loader2 size={13} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Аналізую дані сайту...
              </span>
            </div>
          </div>
        )}

        {error && error !== "upgrade" && (
          <div
            className="rounded-xl px-3.5 py-2.5 text-sm"
            style={{
              background: "rgba(245,103,90,0.08)",
              border: "1px solid rgba(245,103,90,0.2)",
              color: "#F5675A",
            }}
          >
            {error}
          </div>
        )}

        {error === "upgrade" && (
          <div
            className="rounded-xl px-3.5 py-3 text-sm"
            style={{
              background: "rgba(140,246,255,0.06)",
              border: "1px solid rgba(140,246,255,0.2)",
            }}
          >
            <p className="font-medium mb-1" style={{ color: "var(--cyan)" }}>
              Growth план потрібен
            </p>
            <p style={{ color: "var(--text-secondary)" }}>
              AI-асистент доступний з Growth $99/міс.
            </p>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3.5 py-3.5 border-t shrink-0" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Запитай про сайт..."
            disabled={loading}
            className="flex-1 min-w-0 text-sm bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
            style={{ color: "var(--text-primary)" }}
          />
          <button
            onClick={() => send(input)}
            disabled={!input.trim() || loading}
            className="shrink-0 rounded-lg p-1.5 transition-opacity disabled:opacity-30 hover:opacity-80"
            style={{ background: "var(--lime)" }}
          >
            <Send size={13} style={{ color: "#0c111d" }} />
          </button>
        </div>
        <p className="text-center text-xs mt-2" style={{ color: "var(--text-tertiary)", opacity: 0.5 }}>
          Qoraxus · на основі даних моніторингу
        </p>
      </div>
    </div>
  );
}

export function QoraxusChat({
  siteId,
  siteName,
  mode = "both",
}: {
  siteId: string;
  siteName: string;
  accessToken?: string; // залишаємо для сумісності але не використовуємо
  mode?: "desktop" | "mobile" | "both";
}) {
  const chat = useChat(siteId);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* ── Desktop: завжди відкрита панель (рендериться батьком у сайдбарі) ── */}
      {mode !== "mobile" && (
        <div className="hidden xl:flex flex-col h-full min-h-0">
          <ChatBody siteName={siteName} {...chat} />
        </div>
      )}

      {/* ── Mobile / tablet: floating-кнопка + попап, як раніше ── */}
      {mode !== "desktop" && (
        <div className="xl:hidden">
          {!mobileOpen && (
            <button
              onClick={() => setMobileOpen(true)}
              className="fixed bottom-5 right-5 z-50 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all hover:scale-105 active:scale-95"
              style={{
                background: "var(--lime)",
                color: "#0c111d",
                boxShadow: "0 0 0 1px rgba(214,255,63,0.3), 0 8px 32px rgba(214,255,63,0.15)",
                transitionDuration: "150ms",
              }}
            >
              <Sparkles size={15} />
              Qoraxus AI
            </button>
          )}

          {mobileOpen && (
            <div
              className="fixed inset-0 z-50 flex flex-col sm:inset-auto sm:bottom-5 sm:right-5"
              style={{
                background: "var(--bg-raised)",
                border: "1px solid var(--border-hairline)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.5)",
              }}
            >
              <div className="flex-1 min-h-0 sm:w-[380px] sm:h-[560px] sm:rounded-2xl sm:overflow-hidden flex flex-col">
                <ChatBody
                  siteName={siteName}
                  {...chat}
                  onClose={() => setMobileOpen(false)}
                  autoFocus
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
