"use client";

import { useState, useEffect, useCallback } from "react";
import { Scale, Loader2, X, ChevronDown } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Props {
  organizationId: string;
  competitorUrl: string;
  getFreshToken: () => Promise<string>;
  onClose: () => void;
}

interface OwnSite {
  id: string;
  url: string;
  display_name: string;
}

interface InspectSnapshot {
  title: string | null;
  responseTimeMs: number;
  pageSizeKb: number;
  technologies: string[];
}

interface CompareResult {
  comparison: string;
  your_site: InspectSnapshot;
  competitor_site: InspectSnapshot;
}

// AiCompareModal — MODULE_ROADMAP.md, "Qorax Browser" AI Compare
// ("свій сайт vs конкурент → різниці → рекомендації"). "Свій сайт"
// пропонується зі списку sites організації (той самий, що
// dashboard/page.tsx читає напряму через Supabase client — тут той
// самий підхід, не новий worker-ендпоінт для простого списку) або
// вручну через URL — конкурент vs конкурент теж має сенс.
export function AiCompareModal({ organizationId, competitorUrl, getFreshToken, onClose }: Props) {
  const [ownSites, setOwnSites] = useState<OwnSite[] | null>(null);
  const [selectedSiteUrl, setSelectedSiteUrl] = useState<string>("");
  const [manualUrl, setManualUrl] = useState("");
  const [useManual, setUseManual] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);

  const loadOwnSites = useCallback(async () => {
    try {
      const { createClient } = await import("@/app/lib/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("sites")
        .select("id, url, display_name")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: false });
      setOwnSites(data ?? []);
      if (data && data.length > 0) setSelectedSiteUrl(data[0].url);
      else setUseManual(true);
    } catch {
      setOwnSites([]);
      setUseManual(true);
    }
  }, [organizationId]);

  useEffect(() => {
    (async () => {
      await loadOwnSites();
    })();
  }, [loadOwnSites]);

  async function runCompare() {
    const yourUrl = useManual ? manualUrl.trim() : selectedSiteUrl;
    if (!yourUrl) {
      setError("Вкажіть свій сайт для порівняння");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshToken();
      const res = await fetch(`${API_BASE_URL}/api/browser/compare`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, your_url: yourUrl, competitor_url: competitorUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Не вдалося порівняти сайти");
        return;
      }
      setResult(data);
    } catch {
      setError("Помилка з'єднання");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center p-6" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div
        className="w-full max-w-xl max-h-[75vh] overflow-y-auto rounded-2xl p-5"
        style={{ background: "#141414", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <Scale size={14} style={{ color: "#B98CF7" }} /> AI Compare
          </h3>
          <button onClick={onClose} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
            <X size={15} />
          </button>
        </div>

        {!result && (
          <div className="space-y-3">
            <p className="text-xs text-[var(--text-tertiary)]">Порівняти з конкурентом: <span className="text-[var(--text-secondary)]">{competitorUrl}</span></p>

            {!useManual && ownSites && ownSites.length > 0 ? (
              <div className="relative">
                <select
                  value={selectedSiteUrl}
                  onChange={e => setSelectedSiteUrl(e.target.value)}
                  className="w-full appearance-none text-xs px-3 py-2.5 rounded-lg outline-none"
                  style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)" }}
                >
                  {ownSites.map(site => (
                    <option key={site.id} value={site.url}>{site.display_name} — {site.url}</option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-tertiary)]" />
              </div>
            ) : (
              <input
                type="text"
                value={manualUrl}
                onChange={e => setManualUrl(e.target.value)}
                placeholder="URL вашого сайту, наприклад example.com"
                className="w-full text-xs px-3 py-2.5 rounded-lg outline-none placeholder:text-[var(--text-tertiary)]"
                style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-secondary)" }}
              />
            )}

            {!useManual && ownSites && ownSites.length > 0 && (
              <button onClick={() => setUseManual(true)} className="text-[11px] text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">
                Або введіть інший URL вручну
              </button>
            )}

            {error && <p className="text-xs" style={{ color: "#F5675A" }}>{error}</p>}

            <button
              onClick={runCompare}
              disabled={loading}
              className="w-full glow-button text-xs !py-2 flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Scale size={13} />}
              {loading ? "Порівнюю..." : "Порівняти"}
            </button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <SiteSummary label="Ваш сайт" site={result.your_site} color="var(--lime)" />
              <SiteSummary label="Конкурент" site={result.competitor_site} color="#F5675A" />
            </div>
            <div className="rounded-xl p-3.5 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap" style={{ background: "rgba(185,140,247,0.05)", border: "1px solid rgba(185,140,247,0.15)" }}>
              {result.comparison}
            </div>
            <button onClick={() => setResult(null)} className="text-xs text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
              ← Порівняти ще раз
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function SiteSummary({ label, site, color }: { label: string; site: InspectSnapshot; color: string }) {
  return (
    <div className="rounded-xl p-3 space-y-1" style={{ background: "rgba(255,255,255,0.03)" }}>
      <p className="font-medium" style={{ color }}>{label}</p>
      <p className="text-[var(--text-secondary)] truncate">{site.title || "—"}</p>
      <p className="text-[var(--text-tertiary)]">{site.responseTimeMs} мс · {site.pageSizeKb} КБ</p>
    </div>
  );
}
