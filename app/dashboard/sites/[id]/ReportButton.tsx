"use client";

import { useState } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { FileText } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

export function ReportButton({ siteId }: { siteId: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const resp = await fetch(`${API_URL}/api/report?site_id=${siteId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (!resp.ok) {
        alert("Не вдалося отримати звіт. Спробуйте пізніше.");
        return;
      }

      const html = await resp.text();
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
    } catch {
      alert("Помилка при завантаженні звіту.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="inline-flex items-center justify-center gap-2 text-sm font-medium h-8 w-8 sm:h-auto sm:w-auto sm:px-4 sm:py-2 rounded-lg sm:rounded-xl transition-opacity hover:opacity-80 disabled:opacity-50 shrink-0"
      style={{
        background: "var(--lime)",
        color: "#0C111D",
      }}
    >
      <FileText size={14} />
      <span className="hidden sm:inline">{loading ? "Генерується..." : "Отримати звіт PDF"}</span>
    </button>
  );
}
