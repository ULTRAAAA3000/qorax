"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, BarChart3, TrendingUp, TrendingDown, Minus, Unplug, Plug } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface DailySnapshot {
  date: string;
  sessions: number | null;
  conversions: number | null;
  bounce_rate: number | null;
  source: string;
}

interface Summary {
  connected: boolean;
  last_synced_at: string | null;
  totals: { sessions: number; conversions: number; bounce_rate: number };
  daily: DailySnapshot[];
}

interface Ga4Property {
  property_id: string;
  display_name: string;
  account_name: string;
}

interface Props {
  siteId: string;
  accessToken: string;
}

// SVG line-chart сесій по датах — той самий патерн, що PositionChart у
// app/dashboard/rank/[siteId]/RankDetailUI.tsx (viewBox 600x140,
// path+circle, тренд-індикатор знизу), тільки вісь Y не інвертована
// (більше сесій — вище, на відміну від позиції в пошуку).

function SessionsChart({ daily }: { daily: DailySnapshot[] }) {
  const points = daily.filter(d => d.sessions !== null);
  if (points.length < 2) {
    return (
      <div className="rounded-xl px-4 py-6 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="text-xs text-[var(--text-tertiary)]">Недостатньо даних для графіка — з&apos;являться протягом кількох днів після підключення</p>
      </div>
    );
  }

  const width = 600;
  const height = 140;
  const padding = 24;
  const sessions = points.map(p => p.sessions as number);
  const minSessions = Math.min(...sessions, 0);
  const maxSessions = Math.max(...sessions, minSessions + 1);

  const x = (i: number) => padding + (i / (points.length - 1)) * (width - padding * 2);
  const y = (val: number) => height - padding - ((val - minSessions) / (maxSessions - minSessions)) * (height - padding * 2);

  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.sessions as number)}`).join(" ");

  const first = sessions[0];
  const last = sessions[sessions.length - 1];
  const trend = last - first;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: 160 }}>
        <path d={path} fill="none" stroke="var(--lime)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.sessions as number)} r={2.5} fill="var(--lime)" opacity={i === points.length - 1 ? 1 : 0.4} />
        ))}
      </svg>
      <div className="flex items-center justify-between mt-2 text-xs">
        <span className="text-[var(--text-tertiary)]">{points[0].date}</span>
        <span className="flex items-center gap-1 font-medium" style={{ color: trend > 0 ? "var(--lime)" : trend < 0 ? "#F5675A" : "var(--text-tertiary)" }}>
          {trend > 0 ? <TrendingUp size={12} /> : trend < 0 ? <TrendingDown size={12} /> : <Minus size={12} />}
          {trend === 0 ? "без змін" : `${trend > 0 ? "зростання" : "спад"} на ${Math.abs(trend)}`}
        </span>
        <span className="text-[var(--text-tertiary)]">{points[points.length - 1].date}</span>
      </div>
    </div>
  );
}

export function AnalyticsDetailUI({ siteId, accessToken }: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [disconnecting, setDisconnecting] = useState(false);

  // ── Проміжний стан вибору property після OAuth callback ────────────
  // handleGa4Callback (worker) редіректить сюди з #token=...&access_token=...
  // у fragment (не query — не потрапляє в server logs). Читається один
  // раз через lazy useState initializer (не в effect — уникає
  // react-hooks/set-state-in-effect: тут це не "синхронізація з
  // зовнішньою системою", а one-time парсинг URL при монтуванні).
  const [pendingToken, setPendingToken] = useState<{ encryptedRefreshToken: string; googleAccessToken: string } | null>(() => {
    if (typeof window === "undefined") return null;
    const hash = window.location.hash;
    if (!hash.startsWith("#token=")) return null;
    const params = new URLSearchParams(hash.slice(1));
    const token = params.get("token");
    const googleAccessToken = params.get("access_token");
    if (!token || !googleAccessToken) return null;
    return { encryptedRefreshToken: token, googleAccessToken };
  });
  const [properties, setProperties] = useState<Ga4Property[] | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState("");
  const [connectingProperty, setConnectingProperty] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/analytics?days=30`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    setSummary(data);
    setLoading(false);
  }, [siteId, accessToken]);

  useEffect(() => {
    // Одноразовий Google access_token з fragment вже прочитаний у
    // useState вище — тут лише чистимо URL, щоб оновлення сторінки не
    // намагалось повторно використати той самий одноразовий токен.
    if (pendingToken) {
      window.history.replaceState(null, "", window.location.pathname);
    }
    (async () => {
      await loadSummary();
    })();
    // pendingToken навмисно не в deps — це one-time перевірка URL fragment
    // при монтуванні (читання уже сталося в useState-ініціалізаторі вище),
    // не потрібно перезапускати цей ефект коли pendingToken зміниться
    // після вибору property.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSummary]);

  useEffect(() => {
    if (!pendingToken) return;
    (async () => {
      const res = await fetch(`${API_BASE_URL}/api/ga4/properties?access_token=${encodeURIComponent(pendingToken.googleAccessToken)}`);
      const data = await res.json();
      setProperties(data.properties ?? []);
    })();
  }, [pendingToken]);

  async function confirmPropertySelection() {
    if (!pendingToken || !selectedPropertyId) return;
    setConnectingProperty(true);
    setConnectError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/sites/${siteId}/ga4/connect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ property_id: selectedPropertyId, encrypted_refresh_token: pendingToken.encryptedRefreshToken }),
      });
      const data = await res.json();
      if (!res.ok) { setConnectError(data.error ?? "Помилка підключення"); return; }
      setPendingToken(null);
      setProperties(null);
      setLoading(true);
      await loadSummary();
    } finally {
      setConnectingProperty(false);
    }
  }

  function handleConnect() {
    window.location.href = `${API_BASE_URL}/api/sites/${siteId}/ga4/authorize`;
  }

  async function handleDisconnect() {
    if (!confirm("Відключити Google Analytics 4? Історичні дані залишаться, але новий синк зупиниться.")) return;
    setDisconnecting(true);
    try {
      await fetch(`${API_BASE_URL}/api/sites/${siteId}/ga4/disconnect`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      await loadSummary();
    } finally {
      setDisconnecting(false);
    }
  }

  // ── Проміжний UI: вибір GA4 property після OAuth ────────────────────

  if (pendingToken) {
    return (
      <div className="glow-card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <Plug size={18} style={{ color: "var(--lime)" }} />
          <h2 className="text-base font-medium">Оберіть властивість Google Analytics 4</h2>
        </div>
        {properties === null && (
          <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-6 justify-center">
            <Loader2 size={16} className="animate-spin" /> Завантаження списку властивостей...
          </div>
        )}
        {properties?.length === 0 && (
          <p className="text-sm text-[var(--text-secondary)]">
            У цього Google-акаунту немає доступних GA4-властивостей. Переконайтесь, що ви авторизувались акаунтом з доступом до потрібної властивості.
          </p>
        )}
        {properties && properties.length > 0 && (
          <>
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {properties.map(prop => (
                <label
                  key={prop.property_id}
                  className="flex items-center gap-3 p-3 rounded-xl cursor-pointer"
                  style={{
                    background: selectedPropertyId === prop.property_id ? "rgba(198,255,84,0.08)" : "rgba(255,255,255,0.02)",
                    border: `1px solid ${selectedPropertyId === prop.property_id ? "rgba(198,255,84,0.3)" : "rgba(255,255,255,0.06)"}`,
                  }}
                >
                  <input
                    type="radio"
                    name="ga4-property"
                    checked={selectedPropertyId === prop.property_id}
                    onChange={() => setSelectedPropertyId(prop.property_id)}
                    className="accent-[var(--lime)]"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{prop.display_name}</p>
                    <p className="text-xs text-[var(--text-tertiary)] truncate">{prop.account_name}</p>
                  </div>
                </label>
              ))}
            </div>
            {connectError && (
              <div className="px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
                {connectError}
              </div>
            )}
            <button
              onClick={confirmPropertySelection}
              disabled={!selectedPropertyId || connectingProperty}
              className="glow-button text-sm !py-2 !px-4 disabled:opacity-50"
            >
              {connectingProperty ? <Loader2 size={14} className="animate-spin" /> : "Підключити"}
            </button>
          </>
        )}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-12 justify-center">
        <Loader2 size={16} className="animate-spin" /> Завантаження...
      </div>
    );
  }

  // ── Не підключено ─────────────────────────────────────────────────

  if (!summary?.connected) {
    return (
      <div className="glow-card p-8 text-center space-y-3">
        <BarChart3 size={28} className="mx-auto" style={{ color: "var(--text-tertiary)" }} />
        <p className="text-sm text-[var(--text-secondary)]">
          Підключіть Google Analytics 4, щоб бачити трафік і конверсії цього сайту.
        </p>
        <button onClick={handleConnect} className="glow-button text-sm !py-2 !px-4 inline-flex items-center gap-1.5">
          <Plug size={14} /> Підключити GA4
        </button>
      </div>
    );
  }

  // ── Підключено — зведення + графік ──────────────────────────────────

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--text-tertiary)]">
          {summary.last_synced_at ? `Останній синк: ${new Date(summary.last_synced_at).toLocaleString("uk-UA")}` : "Ще не синхронізовано — дані з'являться протягом доби"}
        </p>
        <button
          onClick={handleDisconnect}
          disabled={disconnecting}
          className="text-xs flex items-center gap-1.5 text-[var(--text-tertiary)] hover:text-[#F5675A] transition-colors disabled:opacity-50"
        >
          {disconnecting ? <Loader2 size={12} className="animate-spin" /> : <Unplug size={12} />} Відключити
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="glow-card p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">Сесії (30 днів)</p>
          <p className="text-xl font-display font-semibold">{summary.totals.sessions.toLocaleString("uk-UA")}</p>
        </div>
        <div className="glow-card p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">Конверсії (30 днів)</p>
          <p className="text-xl font-display font-semibold">{summary.totals.conversions.toLocaleString("uk-UA")}</p>
        </div>
        <div className="glow-card p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">Показник відмов</p>
          <p className="text-xl font-display font-semibold">{(summary.totals.bounce_rate * 100).toFixed(1)}%</p>
        </div>
      </div>

      <div className="glow-card p-4">
        <p className="text-sm font-medium mb-3">Сесії за днями</p>
        <SessionsChart daily={summary.daily} />
      </div>
    </div>
  );
}
