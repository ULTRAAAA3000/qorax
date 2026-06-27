"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { API_BASE_URL } from "../lib/config";
import { isAuditError, type AuditResult } from "../lib/audit";
import { AuditResultPanel } from "./AuditResultPanel";

/**
 * AuditForm — glassmorphism input + gradient glow CTA button.
 * Raycast-style: clean input with subtle glass bg, prominent gradient
 * submit button with glow shadow.
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
      const fetchAudit = async () => {
        const response = await fetch(`${API_BASE_URL}/api/audit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        return { response, data: (await response.json()) as AuditResult };
      };

      let { response, data } = await fetchAudit();

      // Якщо PageSpeed не відповів (null scores) — автоматично ретраємо один раз
      // Google PageSpeed API часто холодно стартує і падає на першому запиті
      if (
        response.ok &&
        !isAuditError(data) &&
        data.performanceScoreMobile === null &&
        data.performanceScoreDesktop === null
      ) {
        await new Promise(r => setTimeout(r, 2000));
        ({ response, data } = await fetchAudit());
      }

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
          className="flex-1 rounded-xl px-5 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-all disabled:opacity-60"
          style={{
            background: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(12px)",
            transitionDuration: "220ms",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "rgba(140, 246, 255, 0.4)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(140, 246, 255, 0.1)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.1)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
        <motion.button
          type="submit"
          disabled={state === "loading"}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: [0.16, 1, 0.3, 1] }}
          className="glow-button whitespace-nowrap"
        >
          {state === "loading" ? (
            <>
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Перевіряємо…
            </>
          ) : (
            "Перевірити безкоштовно"
          )}
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
