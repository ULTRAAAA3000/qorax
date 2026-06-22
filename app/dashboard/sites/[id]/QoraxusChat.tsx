"use client";

import { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, ChevronDown, Loader2 } from "lucide-react";

interface Message {
  role: "user" | "model";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Чому мій сайт повільний?",
  "Що виправити в першу чергу?",
  "Скільки я втрачаю через ці проблеми?",
  "Як покращити позиції в Google?",
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

export function QoraxusChat({
  siteId,
  siteName,
  accessToken,
}: {
  siteId: string;
  siteName: string;
  accessToken: string;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Скрол до останнього повідомлення
  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  // Фокус на інпут при відкритті
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);

    const userMessage: Message = { role: "user", content: text.trim() };
    const next = [...messages, userMessage];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const resp = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          site_id: siteId,
          messages: next,
        }),
      });

      const data = (await resp.json()) as {
        reply?: string;
        error?: string;
        message?: string;
      };

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
    } catch {
      setError("Не вдалося з'єднатися з асистентом");
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm font-medium shadow-lg transition-all hover:scale-105 active:scale-95"
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

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-6 right-6 z-50 flex flex-col rounded-2xl border overflow-hidden"
          style={{
            width: 380,
            height: 520,
            background: "var(--bg-raised)",
            borderColor: "var(--border-hairline)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.04), 0 24px 64px rgba(0,0,0,0.5)",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 border-b shrink-0"
            style={{ borderColor: "var(--border-hairline)" }}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="h-7 w-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: "rgba(214,255,63,0.12)" }}
              >
                <Sparkles size={13} style={{ color: "var(--lime)" }} />
              </div>
              <div>
                <p className="text-sm font-medium leading-tight">Qoraxus</p>
                <p className="text-xs leading-tight" style={{ color: "var(--text-tertiary)" }}>
                  AI-асистент · {siteName}
                </p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="p-1.5 rounded-lg transition-opacity hover:opacity-60"
            >
              <X size={15} style={{ color: "var(--text-tertiary)" }} />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {isEmpty && (
              <div className="space-y-3">
                {/* Welcome */}
                <div
                  className="rounded-xl px-3.5 py-3 text-sm"
                  style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
                >
                  <p className="font-medium mb-1" style={{ color: "var(--lime)" }}>
                    Привіт! Я Qoraxus 👋
                  </p>
                  <p style={{ color: "var(--text-secondary)" }}>
                    Запитай мене про стан сайту, проблеми або що зробити щоб більше заробляти.
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
                        background: "var(--bg)",
                        border: "1px solid var(--border-hairline)",
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
                  className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
                  style={
                    msg.role === "user"
                      ? {
                          background: "rgba(214,255,63,0.12)",
                          border: "1px solid rgba(214,255,63,0.2)",
                          color: "var(--text-primary)",
                        }
                      : {
                          background: "var(--bg)",
                          border: "1px solid var(--border-hairline)",
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
                  style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
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
          <div
            className="px-3 py-3 border-t shrink-0"
            style={{ borderColor: "var(--border-hairline)" }}
          >
            <div
              className="flex items-center gap-2 rounded-xl px-3 py-2"
              style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}
            >
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Запитай про сайт..."
                disabled={loading}
                className="flex-1 text-sm bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
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
      )}
    </>
  );
}
