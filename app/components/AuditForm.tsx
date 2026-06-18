"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { API_BASE_URL } from "../lib/config";
import { isAuditError, type AuditResult } from "../lib/audit";
import { AuditResultPanel } from "./AuditResultPanel";

/**
 * AuditForm — the page's primary conversion object, wired to the real
 * Qorax API Worker. Button press feedback follows the 100-160ms rule
 * (scale, not color flash).
 */

type RequestState = "idle" | "loading" | "error";

export function AuditForm() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<RequestState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || state === "loading") return;

    setState("loading");
    setErrorMessage(null);
    setResult(null);

    try {
      const response = await fetch(`${API_BASE_URL}/api/audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = (await response.json()) as AuditResult;

      if (!response.ok || isAuditError(data)) {
        setErrorMessage(isAuditError(data) ? data.error : "Щось пішло не так. Спробуйте ще раз.");
        setState("error");
        return;
      }

      setResult(data);
      setState("idle");
    } catch {
      setErrorMessage("Не вдалося з'єднатись із сервером. Перевірте підключення.");
      setState("error");
    }
  }

  return (
    <div className="w-full max-w-xl">
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="вашсайт.com.ua"
          disabled={state === "loading"}
          className="flex-1 rounded-xl border hairline bg-[var(--bg-raised)] px-5 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors disabled:opacity-60"
          style={{ transitionDuration: "180ms" }}
        />
        <motion.button
          type="submit"
          disabled={state === "loading"}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-xl px-6 py-3.5 font-medium whitespace-nowrap disabled:opacity-60"
          style={{ background: "var(--lime)", color: "#0c111d" }}
        >
          {state === "loading" ? "Перевіряємо…" : "Перевірити безкоштовно"}
        </motion.button>
      </form>

      {errorMessage && (
        <p className="mt-3 text-sm" style={{ color: "#F5675A" }}>
          {errorMessage}
        </p>
      )}

      {result && !isAuditError(result) && <AuditResultPanel result={result} />}
    </div>
  );
}
