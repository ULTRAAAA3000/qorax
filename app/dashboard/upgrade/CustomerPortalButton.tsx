"use client";

import { useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

export function CustomerPortalButton({
  orgId,
  accessToken,
}: {
  orgId: string;
  accessToken: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPortal() {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `${API_BASE}/api/ls/portal?org_id=${encodeURIComponent(orgId)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );
      const data = (await resp.json()) as { url?: string; error?: string };
      if (data.url) {
        window.open(data.url, "_blank", "noopener,noreferrer");
      } else {
        setError("Не вдалося отримати посилання — зверніться на hello@qorax.app");
      }
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="text-center mt-4">
      <button
        onClick={openPortal}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-sm transition-opacity hover:opacity-80 disabled:opacity-50"
        style={{ color: "var(--cyan)" }}
      >
        {loading ? (
          <Loader2 size={13} className="animate-spin" />
        ) : (
          <ExternalLink size={13} />
        )}
        Управляти підпискою
      </button>
      {error && (
        <p className="text-xs mt-2" style={{ color: "#F5675A" }}>{error}</p>
      )}
    </div>
  );
}
