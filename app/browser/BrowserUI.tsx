"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Globe, Sparkles, Loader2, ArrowRight, Clock, X } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface HistoryItem {
  id: string;
  url: string;
  title: string | null;
  visited_at: string;
}

interface Props {
  organizationId: string;
}

// Той самий фікс, що OfficeDocsListUI.tsx/CreatorBoardsListUI.tsx —
// не кешувати JWT на весь час життя компонента, брати свіжий перед
// кожним запитом.
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

function normalizeUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[\w-]+(\.[\w-]+)+/.test(trimmed)) return `https://${trimmed}`;
  return null;
}

export function BrowserUI({ organizationId }: Props) {
  const [addressInput, setAddressInput] = useState("");
  const [currentUrl, setCurrentUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [iframeLoading, setIframeLoading] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [summary, setSummary] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const loadHistory = useCallback(async () => {
    const token = await getFreshToken();
    const res = await fetch(`${API_BASE_URL}/api/browser/history?organization_id=${organizationId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setHistory(data.history ?? []);
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      await loadHistory();
    })();
  }, [loadHistory]);

  const navigate = useCallback((rawUrl: string) => {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      setLoadError("Введіть коректну адресу сайту");
      return;
    }
    setLoadError(null);
    setSummary(null);
    setAnalyzeError(null);
    setAddressInput(normalized);
    setCurrentUrl(normalized);
    setIframeLoading(true);
  }, []);

  async function handleAddressSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate(addressInput);
  }

  async function analyzeSite() {
    if (!currentUrl) return;
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/analyze`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ url: currentUrl, organization_id: organizationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAnalyzeError(data.error ?? "Не вдалося проаналізувати сайт");
        return;
      }
      setSummary(data.summary);
      loadHistory();
    } catch {
      setAnalyzeError("Помилка з'єднання");
    } finally {
      setAnalyzing(false);
    }
  }

  const proxySrc = currentUrl
    ? `${API_BASE_URL}/api/browser/proxy?url=${encodeURIComponent(currentUrl)}&organization_id=${organizationId}`
    : null;

  return (
    <div className="flex-1 flex min-h-0">
      <div className="flex-1 flex flex-col min-w-0">
        {/* URL bar */}
        <form onSubmit={handleAddressSubmit} className="flex items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
          <Globe size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
          <input
            type="text"
            value={addressInput}
            onChange={e => setAddressInput(e.target.value)}
            placeholder="Введіть адресу сайту, наприклад example.com"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-[var(--text-tertiary)]"
          />
          <button type="submit" className="glow-button text-xs !py-1.5 !px-3 flex items-center gap-1.5">
            Перейти <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
            style={{ background: sidebarOpen ? "rgba(140,246,255,0.1)" : "rgba(255,255,255,0.04)", color: sidebarOpen ? "var(--cyan)" : "var(--text-tertiary)" }}
          >
            <Sparkles size={12} /> AI
          </button>
        </form>

        {loadError && (
          <div className="px-4 py-2 text-xs" style={{ color: "#F5675A" }}>{loadError}</div>
        )}

        {/* Viewport */}
        <div className="flex-1 relative min-h-0" style={{ background: "#fff" }}>
          {!currentUrl && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8" style={{ background: "var(--bg)" }}>
              <Globe size={32} style={{ color: "var(--text-tertiary)" }} />
              <p className="text-sm text-[var(--text-secondary)]">Введіть адресу сайту вище, щоб почати</p>
              {history && history.length > 0 && (
                <div className="w-full max-w-md space-y-1.5 mt-2">
                  <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                    <Clock size={11} /> Недавні сайти
                  </p>
                  {history.slice(0, 6).map(item => (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.url)}
                      className="w-full text-left px-3 py-2 rounded-lg text-xs truncate hover:bg-white/5 transition-colors"
                      style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "var(--text-secondary)" }}
                    >
                      {item.title || item.url}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {currentUrl && iframeLoading && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-sm" style={{ background: "var(--bg)", color: "var(--text-secondary)" }}>
              <Loader2 size={16} className="animate-spin" /> Завантаження сайту...
            </div>
          )}
          {proxySrc && (
            <iframe
              ref={iframeRef}
              src={proxySrc}
              className="w-full h-full border-0"
              style={{ display: iframeLoading ? "none" : "block" }}
              onLoad={() => setIframeLoading(false)}
              onError={() => { setIframeLoading(false); setLoadError("Не вдалося відобразити сайт"); }}
              sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
            />
          )}
        </div>
      </div>

      {/* AI Sidebar */}
      {sidebarOpen && (
        <aside className="w-80 flex-shrink-0 flex flex-col" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-2">
              <Sparkles size={14} style={{ color: "var(--cyan)" }} />
              <h2 className="text-sm font-medium">AI Sidebar</h2>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!currentUrl && (
              <p className="text-xs text-[var(--text-tertiary)]">Відкрийте сайт, щоб отримати AI-аналіз.</p>
            )}

            {currentUrl && (
              <>
                <button
                  onClick={analyzeSite}
                  disabled={analyzing}
                  className="w-full glow-button text-xs !py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {analyzing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {analyzing ? "Аналізую..." : "Що це за сайт?"}
                </button>

                {analyzeError && <p className="text-xs" style={{ color: "#F5675A" }}>{analyzeError}</p>}

                {summary && (
                  <div className="rounded-xl p-3.5 text-xs leading-relaxed text-[var(--text-secondary)]" style={{ background: "rgba(140,246,255,0.05)", border: "1px solid rgba(140,246,255,0.15)" }}>
                    {summary}
                  </div>
                )}
              </>
            )}

            {history && history.length > 0 && (
              <div className="pt-2">
                <p className="text-xs text-[var(--text-tertiary)] flex items-center gap-1.5 mb-2">
                  <Clock size={11} /> Історія
                </p>
                <div className="space-y-1">
                  {history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => navigate(item.url)}
                      className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs truncate hover:bg-white/5 transition-colors text-[var(--text-secondary)]"
                    >
                      {item.title || item.url}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
