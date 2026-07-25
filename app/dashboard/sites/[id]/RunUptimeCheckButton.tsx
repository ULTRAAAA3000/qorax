"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

interface Props {
  siteId: string;
  accessToken: string;
  workerUrl: string;
}

export function RunUptimeCheckButton({ siteId, accessToken, workerUrl }: Props) {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [resultStatus, setResultStatus] = useState<"up" | "down" | null>(null);

  async function handleClick() {
    setState("loading");
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/run-uptime-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { ok: boolean; status?: "up" | "down" };
      setResultStatus(data.status ?? null);
      setState("done");
      // Через 3 секунди перезавантажуємо сторінку щоб показати нові дані
      setTimeout(() => window.location.reload(), 3000);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  const labels = {
    idle: "Перевірити зараз",
    loading: "Перевіряємо...",
    done: resultStatus === "down" ? "Сайт недоступний" : "Сайт доступний ✓",
    error: "Помилка — спробуй ще",
  };

  return (
    <button
      onClick={handleClick}
      disabled={state === "loading" || state === "done"}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 enabled:hover:brightness-125"
      style={{
        background: state === "done"
          ? resultStatus === "down" ? "rgba(245,103,90,0.08)" : "rgba(214,255,63,0.08)"
          : state === "error"
          ? "rgba(245,103,90,0.08)"
          : "rgba(255,255,255,0.05)",
        border: `1px solid ${
          state === "done"
            ? resultStatus === "down" ? "rgba(245,103,90,0.2)" : "rgba(214,255,63,0.2)"
            : state === "error" ? "rgba(245,103,90,0.2)" : "rgba(255,255,255,0.1)"
        }`,
        color: state === "done"
          ? resultStatus === "down" ? "#F5675A" : "var(--lime)"
          : state === "error" ? "#F5675A" : "var(--text-secondary)",
      }}
    >
      <RefreshCw
        size={11}
        className={state === "loading" ? "animate-spin" : ""}
      />
      {labels[state]}
    </button>
  );
}
