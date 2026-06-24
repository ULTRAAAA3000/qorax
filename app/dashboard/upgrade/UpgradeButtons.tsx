"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Loader2, ExternalLink } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

interface Props {
  planCode: string;
  planName: string;
  isCurrent: boolean;
  isHighlight: boolean;
  accessToken: string;
  hasStripeCustomer: boolean;
  isPortalButton?: boolean;
}

export function UpgradeButtons({
  planCode,
  planName,
  isCurrent,
  isHighlight,
  hasStripeCustomer,
  isPortalButton,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function getFreshToken(): Promise<string> {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  }

  async function handleCheckout() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const resp = await fetch(`${API_URL}/api/stripe/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan_code: planCode }),
      });

      const data = await resp.json() as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        setError(data.error ?? "Помилка створення сесії оплати");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Мережева помилка. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  async function handlePortal() {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const resp = await fetch(`${API_URL}/api/stripe/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await resp.json() as { url?: string; error?: string };
      if (!resp.ok || !data.url) {
        setError(data.error ?? "Помилка відкриття порталу");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Мережева помилка. Спробуйте ще раз.");
    } finally {
      setLoading(false);
    }
  }

  if (isPortalButton) {
    return (
      <div>
        <button
          onClick={handlePortal}
          disabled={loading}
          className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50"
          style={{ border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
          {loading ? "Відкриття..." : "Управляти підпискою"}
        </button>
        {error && <p className="text-xs mt-2" style={{ color: "#F5675A" }}>{error}</p>}
      </div>
    );
  }

  if (isCurrent) {
    return (
      <div className="text-center text-sm py-3 rounded-xl"
        style={{ border: "1px solid var(--border-hairline)", color: "var(--text-tertiary)" }}>
        Поточний план
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={handleCheckout}
        disabled={loading}
        className="w-full text-center text-sm font-medium rounded-xl py-3 transition-opacity hover:opacity-80 disabled:opacity-50 flex items-center justify-center gap-2"
        style={
          isHighlight
            ? { background: "var(--lime)", color: "#0c111d" }
            : { border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }
        }
      >
        {loading && <Loader2 size={14} className="animate-spin" />}
        {loading ? "Перенаправлення..." : `Обрати ${planName}`}
      </button>
      {error && <p className="text-xs mt-2 text-center" style={{ color: "#F5675A" }}>{error}</p>}
    </div>
  );
}
