import { TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";

interface Props {
  uptimePct: number | null;
  incidentsCount: number;
  avgSpeedMs: number | null;
  prevAvgSpeedMs: number | null;
  bestSite: { name: string; uptimePct: number } | null;
  worstSite: { name: string; uptimePct: number } | null;
}

function fmtMs(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
}

export function PortfolioHealthCard({
  uptimePct, incidentsCount, avgSpeedMs, prevAvgSpeedMs, bestSite, worstSite,
}: Props) {
  const uptimeColor = uptimePct === null ? "var(--text-tertiary)"
    : uptimePct >= 99.5 ? "var(--lime)"
    : uptimePct >= 98 ? "#F5A623" : "#F5675A";

  const speedDelta = avgSpeedMs !== null && prevAvgSpeedMs !== null ? avgSpeedMs - prevAvgSpeedMs : null;
  // Швидкість покращилась якщо стала меншою (менше мс = швидше)
  const speedImproved = speedDelta !== null && speedDelta < -50;
  const speedWorsened = speedDelta !== null && speedDelta > 50;

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)" }}>
      <div className="flex items-center gap-2 mb-4">
        <Activity size={14} className="text-[var(--text-tertiary)]" />
        <h2 className="text-sm font-semibold">Здоров&apos;я портфоліо за 7 днів</h2>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {/* Uptime */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Середній uptime</p>
          <p className="text-2xl font-display font-bold" style={{ color: uptimeColor }}>
            {uptimePct !== null ? `${uptimePct.toFixed(2)}%` : "—"}
          </p>
        </div>

        {/* Incidents */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Інцидентів за тиждень</p>
          <p className="text-2xl font-display font-bold" style={{ color: incidentsCount === 0 ? "var(--lime)" : "#F5675A" }}>
            {incidentsCount}
          </p>
        </div>

        {/* Speed trend */}
        <div className="rounded-xl p-4" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>Середня швидкість</p>
          <div className="flex items-baseline gap-1.5">
            <p className="text-2xl font-display font-bold" style={{ color: "var(--text-primary)" }}>
              {avgSpeedMs !== null ? fmtMs(avgSpeedMs) : "—"}
            </p>
            {speedDelta !== null && (speedImproved || speedWorsened) && (
              <span className="flex items-center gap-0.5 text-xs font-medium"
                style={{ color: speedImproved ? "var(--lime)" : "#F5675A" }}>
                {speedImproved ? <TrendingDown size={12} /> : <TrendingUp size={12} />}
                {fmtMs(Math.abs(speedDelta))}
              </span>
            )}
            {speedDelta !== null && !speedImproved && !speedWorsened && (
              <Minus size={12} className="text-[var(--text-tertiary)]" />
            )}
          </div>
        </div>
      </div>

      {bestSite && worstSite && (
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "rgba(214,255,63,0.06)", border: "1px solid rgba(214,255,63,0.15)", color: "var(--text-secondary)" }}>
            Найкращий: <span style={{ color: "var(--lime)" }}>{bestSite.name}</span> ({bestSite.uptimePct.toFixed(1)}%)
          </span>
          <span className="text-xs px-2.5 py-1 rounded-lg" style={{ background: "rgba(245,103,90,0.06)", border: "1px solid rgba(245,103,90,0.15)", color: "var(--text-secondary)" }}>
            Потребує уваги: <span style={{ color: "#F5675A" }}>{worstSite.name}</span> ({worstSite.uptimePct.toFixed(1)}%)
          </span>
        </div>
      )}
    </div>
  );
}
