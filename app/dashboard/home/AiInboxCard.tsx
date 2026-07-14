"use client";

import { useState, useEffect, useCallback } from "react";
import { Sparkles, X, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { API_BASE_URL } from "@/app/lib/config";

interface InboxItem {
  id: string;
  site_id: string | null;
  title: string;
  reason: string;
  source: "rank" | "audit" | "cro" | "ceo_agent";
  suggested_agent_id: string | null;
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

// Посилання по джерелу — куди веде "Перейти" (suggested_agent_id
// підказує, який модуль, але немає єдиного runAgent(agentId) —
// accept НЕ запускає агента автоматично, користувач переходить
// сам). MODULE_ROADMAP.md, хвиля 4, розділ 12.
function targetHref(item: InboxItem): string {
  if (item.source === "rank") return "/dashboard/rank";
  if (item.site_id) return `/dashboard/sites/${item.site_id}`;
  return "/dashboard/home";
}

// AI Inbox — MODULE_ROADMAP.md, хвиля 4, розділ 12 "AI Operating
// System". MVP: read-only список + dismiss, без accept-запуску
// агента (окрема ітерація — задокументовано в EXECUTION_PLAN.md).
export function AiInboxCard() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getFreshToken();
      if (!token) { setLoading(false); return; }

      const res = await fetch(`${API_BASE_URL}/api/ai/inbox?status=new`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json() as { items: InboxItem[] };
        setItems(data.items ?? []);
      }
    } catch {
      // тихо — інбокс необов'язковий для роботи головної сторінки
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const dismiss = async (id: string) => {
    setDismissing(id);
    try {
      const token = await getFreshToken();
      if (!token) return;
      const res = await fetch(`${API_BASE_URL}/api/ai/inbox/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (res.ok) setItems(prev => prev.filter(i => i.id !== id));
    } finally {
      setDismissing(null);
    }
  };

  // Порожньо або йде завантаження — картку взагалі не показуємо
  // (на відміну від інших карток головної сторінки, які завжди на
  // місці): порожній AI Inbox не несе користувачу інформації.
  if (loading || items.length === 0) return null;

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(214,255,63,0.03)", border: "1px solid rgba(214,255,63,0.15)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Sparkles size={14} style={{ color: "var(--lime)" }} />
        <h2 className="text-sm font-semibold">AI помітив кілька речей</h2>
      </div>

      <div className="flex flex-col gap-2">
        {items.slice(0, 5).map(item => (
          <div
            key={item.id}
            className="rounded-xl p-3 flex items-start justify-between gap-3"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{item.title}</p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{item.reason}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Link
                href={targetHref(item)}
                className="text-xs px-2 py-1 rounded-lg flex items-center gap-1"
                style={{ color: "var(--lime)" }}
              >
                Перейти <ArrowRight size={12} />
              </Link>
              <button
                onClick={() => dismiss(item.id)}
                disabled={dismissing === item.id}
                aria-label="Приховати"
                className="p-1 rounded-lg"
                style={{ color: "var(--text-tertiary)" }}
              >
                {dismissing === item.id ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
