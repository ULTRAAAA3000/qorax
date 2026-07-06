"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  siteId: string;
  accessToken: string;
  workerUrl: string;
}

export function RefreshSeoButton({ siteId, accessToken, workerUrl }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/run-seo-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setState("done");
      setTimeout(() => window.location.reload(), 1500);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const labels = {
    idle: "Оновити зараз",
    loading: "Перевіряємо...",
    done: "Готово ✓",
    error: "Помилка — спробуй ще",
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading" || state === "done"}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50"
      style={{
        background: state === "done" ? "rgba(214,255,63,0.08)"
          : state === "error" ? "rgba(245,103,90,0.08)"
          : "rgba(255,255,255,0.05)",
        border: `1px solid ${
          state === "done" ? "rgba(214,255,63,0.2)"
          : state === "error" ? "rgba(245,103,90,0.2)" : "rgba(255,255,255,0.1)"
        }`,
        color: state === "done" ? "var(--lime)"
          : state === "error" ? "#F5675A" : "var(--text-secondary)",
      }}
    >
      <RefreshCw size={11} className={state === "loading" ? "animate-spin" : ""} />
      {labels[state]}
    </button>
  );
}
