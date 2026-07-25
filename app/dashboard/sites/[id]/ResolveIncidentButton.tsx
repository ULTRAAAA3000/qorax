"use client";

import { useState } from "react";
import { CheckCircle } from "lucide-react";

interface Props {
  siteId: string;
  incidentId: string;
  accessToken: string;
  workerUrl: string;
}

export function ResolveIncidentButton({ siteId, incidentId, accessToken, workerUrl }: Props) {
  const [state, setState] = useState<"idle" | "confirm" | "loading" | "done" | "error">("idle");

  async function handleResolve() {
    setState("loading");
    try {
      const res = await fetch(`${workerUrl}/api/sites/${siteId}/incidents/${incidentId}/resolve`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setState("done");
      setTimeout(() => window.location.reload(), 1200);
    } catch {
      setState("error");
      setTimeout(() => setState("idle"), 3000);
    }
  }

  if (state === "confirm") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-tertiary)]">Закрити без сповіщення?</span>
        <button
          onClick={handleResolve}
          className="text-xs font-semibold px-2.5 py-1 rounded-lg"
          style={{ background: "var(--lime)", color: "#0a0a0a" }}
        >
          Так, резолвнути
        </button>
        <button
          onClick={() => setState("idle")}
          className="text-xs px-2.5 py-1 rounded-lg text-[var(--text-tertiary)]"
        >
          Скасувати
        </button>
      </div>
    );
  }

  const labels = {
    idle: "Резолвнути вручну",
    loading: "Закриваємо...",
    done: "Закрито ✓",
    error: "Помилка — спробуй ще",
  };

  return (
    <button
      onClick={() => setState("confirm")}
      disabled={state === "loading" || state === "done"}
      className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-all disabled:opacity-50 enabled:hover:brightness-125"
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
      title="Закриває інцидент вручну без відправки recovered-алерту — для false-positive випадків"
    >
      <CheckCircle size={11} />
      {labels[state]}
    </button>
  );
}
