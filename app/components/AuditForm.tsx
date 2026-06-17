"use client";

import { useState } from "react";
import { motion } from "motion/react";

/**
 * AuditForm — the page's primary conversion object.
 * Button press feedback follows the 100-160ms rule (scale, not color flash).
 * No page navigation/jump on submit in this static placeholder — wired to the
 * real audit endpoint in a later pass.
 */

export function AuditForm() {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setState("loading");
    // Placeholder: real audit pipeline will be wired in a later step.
    setTimeout(() => setState("done"), 1400);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col sm:flex-row gap-3 w-full max-w-xl"
    >
      <input
        type="text"
        required
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="вашсайт.com.ua"
        className="flex-1 rounded-xl border hairline bg-[var(--bg-raised)] px-5 py-3.5 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
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
        {state === "loading"
          ? "Перевіряємо…"
          : state === "done"
            ? "Готово, дивіться нижче ✓"
            : "Перевірити безкоштовно"}
      </motion.button>
    </form>
  );
}
