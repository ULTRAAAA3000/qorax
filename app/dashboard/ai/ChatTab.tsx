"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2 } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Message {
  role: "user" | "model";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "Як справи з моїм портфоліо сайтів?",
  "На що звернути увагу в першу чергу?",
  "Підсумуй активні проблеми по всіх сайтах",
];

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

// Chat — вкладка Qorax AI хаба (EXECUTION_PLAN.md, четвертий крок
// хвилі 3). Це organization-рівня чат (site_id не передається) —
// backend вже підтримує цю гілку з попередньої сесії
// (buildOrgScopedPrompt в chatHandler.ts, повна агрегація по всіх
// сайтах). Той самий /api/ai-chat + /api/ai-chat/thread, що і
// QoraxusChat.tsx на сторінці сайту, але без site_id і без
// floating/mobile-специфіки (тут завжди повнорозмірна панель
// всередині вкладки хаба).
export function ChatTab() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const threadIdRef = useRef<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadThread() {
      setHistoryLoading(true);
      try {
        const token = await getFreshToken();
        if (!token) { if (!cancelled) setHistoryLoading(false); return; }

        // Без site_id — organization-рівня тред
        const resp = await fetch(`${API_BASE_URL}/api/ai-chat/thread`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!resp.ok) { if (!cancelled) setHistoryLoading(false); return; }

        const data = (await resp.json()) as { thread_id: string; messages: Message[] };
        if (cancelled) return;

        threadIdRef.current = data.thread_id;
        setMessages(data.messages ?? []);
      } catch (err) {
        console.error("[ChatTab] failed to load thread:", err);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }

    loadThread();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(text: string) {
    if (!text.trim() || loading) return;
    setError(null);

    const userMessage: Message = { role: "user", content: text.trim() };
    setMessages((prev) => [...prev, userMessage]);
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
        resp = await fetch(`${API_BASE_URL}/api/ai-chat`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            thread_id: threadIdRef.current ?? undefined,
            message: text.trim(),
            // site_id навмисно не передається — organization-рівня чат
          }),
        });
      } catch (fetchErr) {
        console.error("[ChatTab] network error:", fetchErr);
        setError("Мережева помилка — перевірте з'єднання");
        return;
      }

      let data: { thread_id?: string; reply?: string; error?: string; message?: string };
      try {
        data = (await resp.json()) as typeof data;
      } catch {
        setError(`Помилка сервера (${resp.status})`);
        return;
      }

      if (data.thread_id) threadIdRef.current = data.thread_id;

      if (!resp.ok || data.error) {
        if (data.error === "upgrade_required") {
          setError("upgrade");
        } else {
          setError(data.error ?? data.message ?? "Помилка з'єднання");
        }
        return;
      }

      setMessages((prev) => [...prev, { role: "model", content: data.reply ?? "" }]);
    } catch (err) {
      console.error("[ChatTab] unexpected error:", err);
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

  const isEmpty = messages.length === 0 && !historyLoading;

  return (
    <div
      className="flex flex-col rounded-xl overflow-hidden"
      style={{ height: 560, background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}
    >
      {/* Messages */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {historyLoading && (
          <div className="flex justify-center py-6">
            <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          </div>
        )}

        {isEmpty && (
          <div className="space-y-3">
            <div
              className="rounded-xl px-3.5 py-3 text-sm"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}
            >
              <p className="font-medium mb-1" style={{ color: "var(--lime)" }}>
                Привіт! Я Qorax AI
              </p>
              <p style={{ color: "var(--text-secondary)" }}>
                Запитай про будь-який сайт з твого портфоліо або про стан справ в цілому.
              </p>
            </div>

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
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className="max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed"
              style={
                msg.role === "user"
                  ? { background: "rgba(214,255,63,0.12)", border: "1px solid rgba(214,255,63,0.2)", color: "var(--text-primary)" }
                  : { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-secondary)" }
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
                Аналізую портфоліо...
              </span>
            </div>
          </div>
        )}

        {error && error !== "upgrade" && (
          <div
            className="rounded-xl px-3.5 py-2.5 text-sm"
            style={{ background: "rgba(245,103,90,0.08)", border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A" }}
          >
            {error}
          </div>
        )}

        {error === "upgrade" && (
          <div
            className="rounded-xl px-3.5 py-3 text-sm"
            style={{ background: "rgba(140,246,255,0.06)", border: "1px solid rgba(140,246,255,0.2)" }}
          >
            <p className="font-medium mb-1" style={{ color: "var(--cyan)" }}>Growth план потрібен</p>
            <p style={{ color: "var(--text-secondary)" }}>AI-асистент доступний з Growth $99/міс.</p>
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
            placeholder="Запитай про портфоліо сайтів..."
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
      </div>
    </div>
  );
}
