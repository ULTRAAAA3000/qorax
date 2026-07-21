"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Globe, Sparkles, Loader2, ArrowRight, Clock, X, ScanSearch, Zap, Palette, Type, Code2, Layers, FileText, BookOpen, Search } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";
import { CollectionsPanel } from "./CollectionsPanel";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { ReadingModeView } from "./ReadingModeView";
import { DeepSearchPanel } from "./DeepSearchPanel";

interface HistoryItem {
  id: string;
  url: string;
  title: string | null;
  visited_at: string;
}

interface InspectResult {
  title: string | null;
  metaDescription: string | null;
  h1: string | null;
  technologies: string[];
  analytics: string[];
  colors: string[];
  fonts: string[];
  responseTimeMs: number;
  pageSizeKb: number;
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
  const [sidebarTab, setSidebarTab] = useState<"ai" | "inspect" | "collections" | "deep-search">("ai");
  const [summary, setSummary] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[] | null>(null);
  const [inspectResult, setInspectResult] = useState<InspectResult | null>(null);
  const [inspecting, setInspecting] = useState(false);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const [capturedText, setCapturedText] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureSuccess, setCaptureSuccess] = useState(false);
  const [readingMode, setReadingMode] = useState(false);
  const [proxyToken, setProxyToken] = useState<string | null>(null);
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

  // Smart Capture: слухаємо postMessage від скрипта, інжектованого
  // сервером у проксовану сторінку (browserHandler.ts,
  // injectSelectionScript) — прямий доступ до iframe.contentWindow
  // заблоковано cross-origin policy (фронтенд і API_BASE_URL — різні
  // origin у продакшені), postMessage єдиний надійний міст.
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.source !== "qorax-browser" || event.data?.type !== "selection") return;
      const text = typeof event.data.text === "string" ? event.data.text : "";
      if (text) {
        setCapturedText(text);
        setCaptureError(null);
        setCaptureSuccess(false);
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const navigate = useCallback(async (rawUrl: string) => {
    const normalized = normalizeUrl(rawUrl);
    if (!normalized) {
      setLoadError("Введіть коректну адресу сайту");
      return;
    }
    setLoadError(null);
    setSummary(null);
    setAnalyzeError(null);
    setInspectResult(null);
    setInspectError(null);
    setCapturedText(null);
    setCaptureError(null);
    setCaptureSuccess(false);
    setReadingMode(false);
    setAddressInput(normalized);
    setIframeLoading(true);

    // <iframe src="..."> — звичайна браузерна навігація, вона фізично
    // не може надіслати заголовок Authorization. Тому перед показом
    // сайту спершу отримуємо короткоживущий одноразовий токен
    // (authenticated fetch з JWT), і саме його підставляємо в src
    // iframe нижче (proxySrc) — не сам organization_id напряму.
    try {
      const jwt = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/proxy-token`, {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error ?? "Не вдалося авторизувати перегляд сайту");
        setIframeLoading(false);
        return;
      }
      setProxyToken(data.token);
      setCurrentUrl(normalized);
    } catch {
      setLoadError("Помилка з'єднання");
      setIframeLoading(false);
    }
  }, [organizationId]);

  async function handleAddressSubmit(e: React.FormEvent) {
    e.preventDefault();
    await navigate(addressInput);
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

  async function inspectSite() {
    if (!currentUrl) return;
    setInspecting(true);
    setInspectError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/inspect?url=${encodeURIComponent(currentUrl)}&organization_id=${organizationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setInspectError(data.error ?? "Не вдалося перевірити сайт");
        return;
      }
      setInspectResult(data);
    } catch {
      setInspectError("Помилка з'єднання");
    } finally {
      setInspecting(false);
    }
  }

  async function captureToOffice() {
    if (!capturedText) return;
    setCapturing(true);
    setCaptureError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/capture/office`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          text: capturedText,
          source_url: currentUrl ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCaptureError(data.error ?? "Не вдалося зберегти в Office");
        return;
      }
      setCaptureSuccess(true);
    } catch {
      setCaptureError("Помилка з'єднання");
    } finally {
      setCapturing(false);
    }
  }

  const proxySrc = currentUrl && proxyToken
    ? `${API_BASE_URL}/api/browser/proxy?url=${encodeURIComponent(currentUrl)}&token=${encodeURIComponent(proxyToken)}`
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
          {currentUrl && (
            <QuickActionsMenu
              organizationId={organizationId}
              currentUrl={currentUrl}
              getFreshToken={getFreshToken}
              onAnalyze={() => { setSidebarOpen(true); setSidebarTab("ai"); }}
              onSaveToCollection={() => { setSidebarOpen(true); setSidebarTab("collections"); }}
            />
          )}
          {currentUrl && (
            <button
              type="button"
              onClick={() => setReadingMode(v => !v)}
              className="text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5"
              style={{ background: readingMode ? "rgba(198,255,84,0.1)" : "rgba(255,255,255,0.04)", color: readingMode ? "var(--lime)" : "var(--text-tertiary)" }}
            >
              <BookOpen size={12} /> Читання
            </button>
          )}
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

          {readingMode && currentUrl && (
            <ReadingModeView
              organizationId={organizationId}
              url={currentUrl}
              getFreshToken={getFreshToken}
              onClose={() => setReadingMode(false)}
            />
          )}

          {/* Smart Capture: спливає, коли користувач виділив текст
              усередині проксованої сторінки (postMessage від
              injectSelectionScript, browserHandler.ts) */}
          {capturedText && (
            <div
              className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl px-4 py-3 flex flex-col gap-2 max-w-lg shadow-2xl"
              style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
            >
              <div className="flex items-center gap-3">
                <p className="text-xs text-[var(--text-secondary)] truncate max-w-[220px]">&ldquo;{capturedText}&rdquo;</p>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={captureToOffice}
                    disabled={capturing || captureSuccess}
                    className="glow-button text-xs !py-1.5 !px-3 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {capturing ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
                    {captureSuccess ? "Збережено ✓" : capturing ? "Зберігаю..." : "В Office"}
                  </button>
                  <span className="text-[10px] px-2 py-1 rounded-md text-[var(--text-tertiary)]" style={{ background: "rgba(255,255,255,0.04)" }}>
                    Creator/Mail — скоро
                  </span>
                  <button onClick={() => setCapturedText(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                    <X size={13} />
                  </button>
                </div>
              </div>
              {captureError && <p className="text-[11px]" style={{ color: "#F5675A" }}>{captureError}</p>}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar: AI + Site Inspector + Collections */}
      {sidebarOpen && (
        <aside className="w-80 flex-shrink-0 flex flex-col" style={{ borderLeft: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}>
          <div className="flex items-center justify-between px-2 py-2" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "rgba(255,255,255,0.04)" }}>
              <button
                onClick={() => setSidebarTab("ai")}
                className="px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ background: sidebarTab === "ai" ? "rgba(140,246,255,0.1)" : "transparent", color: sidebarTab === "ai" ? "var(--cyan)" : "var(--text-tertiary)" }}
              >
                <Sparkles size={12} /> AI
              </button>
              <button
                onClick={() => setSidebarTab("inspect")}
                className="px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ background: sidebarTab === "inspect" ? "rgba(198,255,84,0.1)" : "transparent", color: sidebarTab === "inspect" ? "var(--lime)" : "var(--text-tertiary)" }}
              >
                <ScanSearch size={12} /> Inspector
              </button>
              <button
                onClick={() => setSidebarTab("collections")}
                className="px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ background: sidebarTab === "collections" ? "rgba(185,140,247,0.12)" : "transparent", color: sidebarTab === "collections" ? "#B98CF7" : "var(--text-tertiary)" }}
              >
                <Layers size={12} /> Колекції
              </button>
              <button
                onClick={() => setSidebarTab("deep-search")}
                className="px-2 py-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-colors"
                style={{ background: sidebarTab === "deep-search" ? "rgba(245,103,90,0.1)" : "transparent", color: sidebarTab === "deep-search" ? "#F5675A" : "var(--text-tertiary)" }}
              >
                <Search size={12} /> Пошук
              </button>
            </div>
            <button onClick={() => setSidebarOpen(false)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              <X size={14} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {sidebarTab === "ai" && (
              <>
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
              </>
            )}

            {sidebarTab === "inspect" && (
              <>
                {!currentUrl && (
                  <p className="text-xs text-[var(--text-tertiary)]">Відкрийте сайт, щоб побачити технічний профіль.</p>
                )}

                {currentUrl && !inspectResult && (
                  <button
                    onClick={inspectSite}
                    disabled={inspecting}
                    className="w-full glow-button text-xs !py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
                  >
                    {inspecting ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
                    {inspecting ? "Перевіряю..." : "Перевірити сайт"}
                  </button>
                )}

                {inspectError && <p className="text-xs" style={{ color: "#F5675A" }}>{inspectError}</p>}

                {inspectResult && (
                  <div className="space-y-3.5">
                    <button onClick={inspectSite} disabled={inspecting} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)] flex items-center gap-1.5">
                      {inspecting ? <Loader2 size={11} className="animate-spin" /> : <ScanSearch size={11} />} Перевірити ще раз
                    </button>

                    <InspectSection icon={Zap} label="Швидкість" color="var(--lime)">
                      <p className="text-xs text-[var(--text-secondary)]">{inspectResult.responseTimeMs} мс · {inspectResult.pageSizeKb} КБ HTML</p>
                    </InspectSection>

                    <InspectSection icon={ScanSearch} label="SEO" color="var(--cyan)">
                      <dl className="space-y-1.5 text-xs">
                        <InspectField label="Title" value={inspectResult.title} />
                        <InspectField label="Meta description" value={inspectResult.metaDescription} />
                        <InspectField label="H1" value={inspectResult.h1} />
                      </dl>
                    </InspectSection>

                    {inspectResult.technologies.length > 0 && (
                      <InspectSection icon={Code2} label="Технології" color="#B98CF7">
                        <div className="flex flex-wrap gap-1.5">
                          {inspectResult.technologies.map(tech => <TagPill key={tech}>{tech}</TagPill>)}
                        </div>
                      </InspectSection>
                    )}

                    {inspectResult.analytics.length > 0 && (
                      <InspectSection icon={Code2} label="Аналітика" color="#B98CF7">
                        <div className="flex flex-wrap gap-1.5">
                          {inspectResult.analytics.map(tool => <TagPill key={tool}>{tool}</TagPill>)}
                        </div>
                      </InspectSection>
                    )}

                    {inspectResult.colors.length > 0 && (
                      <InspectSection icon={Palette} label="Кольори" color="#F4A6A0">
                        <div className="flex flex-wrap gap-1.5">
                          {inspectResult.colors.map(color => (
                            <div key={color} className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono" style={{ background: "rgba(255,255,255,0.04)" }}>
                              <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: color, border: "1px solid rgba(255,255,255,0.15)" }} />
                              {color}
                            </div>
                          ))}
                        </div>
                      </InspectSection>
                    )}

                    {inspectResult.fonts.length > 0 && (
                      <InspectSection icon={Type} label="Шрифти" color="var(--text-secondary)">
                        <div className="flex flex-wrap gap-1.5">
                          {inspectResult.fonts.map(font => <TagPill key={font}>{font}</TagPill>)}
                        </div>
                      </InspectSection>
                    )}
                  </div>
                )}
              </>
            )}

            {sidebarTab === "collections" && (
              <CollectionsPanel
                organizationId={organizationId}
                currentUrl={currentUrl}
                getFreshToken={getFreshToken}
                onNavigate={navigate}
              />
            )}

            {sidebarTab === "deep-search" && (
              <DeepSearchPanel
                organizationId={organizationId}
                getFreshToken={getFreshToken}
                onNavigate={navigate}
              />
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function InspectSection({ icon: Icon, label, color, children }: { icon: typeof Zap; label: string; color: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium flex items-center gap-1.5 mb-2" style={{ color }}>
        <Icon size={12} /> {label}
      </p>
      {children}
    </div>
  );
}

function InspectField({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="text-[var(--text-secondary)] truncate">{value || "—"}</dd>
    </div>
  );
}

function TagPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="px-2 py-1 rounded-md text-[11px]" style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)" }}>
      {children}
    </span>
  );
}
