// SpeedHeatmap — показує середній час відповіді по годинам та дням тижня
// Дані агрегуються client-side з existing speed_checks

"use client";

interface Check {
  load_time_ms: number;
  checked_at: string;
}

const DAYS = ["Нд", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

function getColor(ms: number | null): string {
  if (ms === null) return "rgba(255,255,255,0.04)";
  if (ms < 500)  return "rgba(214,255,63,0.85)";
  if (ms < 1000) return "rgba(214,255,63,0.45)";
  if (ms < 2000) return "rgba(245,166,35,0.6)";
  if (ms < 4000) return "rgba(245,103,90,0.5)";
  return "rgba(245,103,90,0.9)";
}

function fmtMs(ms: number | null) {
  if (ms === null) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}с` : `${ms}мс`;
}

export function SpeedHeatmap({ checks }: { checks: Check[] }) {
  if (checks.length < 4) {
    return (
      <div className="rounded-xl px-4 py-4 flex items-center gap-2.5"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Потрібно більше даних — heatmap з'явиться після кількох тижнів моніторингу
        </p>
      </div>
    );
  }

  // Агрегуємо: [dayOfWeek][hourBucket] = avg ms
  const buckets: Record<string, number[]> = {};
  for (const c of checks) {
    const d = new Date(c.checked_at);
    const day = d.getDay(); // 0=Sun
    const hourBucket = HOURS.reduce((prev, h) => d.getHours() >= h ? h : prev, 0);
    const key = `${day}-${hourBucket}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(c.load_time_ms);
  }

  const avgs: Record<string, number | null> = {};
  for (const key of Object.keys(buckets)) {
    const arr = buckets[key];
    avgs[key] = Math.round(arr.reduce((s, v) => s + v, 0) / arr.length);
  }

  // Find slowest cell
  let slowestKey = "";
  let slowestMs = 0;
  for (const [k, v] of Object.entries(avgs)) {
    if (v !== null && v > slowestMs) { slowestMs = v; slowestKey = k; }
  }
  const [slowDay, slowHour] = slowestKey ? slowestKey.split("-").map(Number) : [null, null];
  const slowLabel = slowDay !== null && slowHour !== null
    ? `${DAYS[slowDay]} о ${String(slowHour).padStart(2, "0")}:00 — ${fmtMs(slowestMs)}`
    : null;

  return (
    <div>
      {slowLabel && (
        <div className="mb-4 rounded-xl px-4 py-3 flex items-center gap-2.5"
          style={{ background: "rgba(245,166,35,0.05)", border: "1px solid rgba(245,166,35,0.15)" }}>
          <span className="text-sm" style={{ color: "#F5A623" }}>⚠</span>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Найповільніше: <strong style={{ color: "var(--text-primary)" }}>{slowLabel}</strong>
          </p>
        </div>
      )}

      {/* Grid */}
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 360 }}>
          {/* Hour labels */}
          <div className="flex mb-1.5" style={{ paddingLeft: 28 }}>
            {HOURS.map(h => (
              <div key={h} className="flex-1 text-center text-[10px]"
                style={{ color: "var(--text-tertiary)", fontVariantNumeric: "tabular-nums" }}>
                {String(h).padStart(2, "0")}
              </div>
            ))}
          </div>

          {/* Rows = days */}
          {DAYS.map((day, di) => (
            <div key={di} className="flex items-center gap-1 mb-1">
              <span className="text-[10px] w-6 shrink-0 text-right"
                style={{ color: "var(--text-tertiary)" }}>{day}</span>
              <div className="flex flex-1 gap-1">
                {HOURS.map(h => {
                  const key = `${di}-${h}`;
                  const ms = avgs[key] ?? null;
                  return (
                    <div key={h}
                      title={ms !== null ? `${day} ${String(h).padStart(2,"0")}:00 — ${fmtMs(ms)}` : "Немає даних"}
                      className="flex-1 rounded-md cursor-default transition-opacity hover:opacity-80"
                      style={{
                        height: 22,
                        background: getColor(ms),
                        outline: slowDay === di && slowHour === h ? "1.5px solid #F5A623" : "none",
                      }}
                    />
                  );
                })}
              </div>
            </div>
          ))}

          {/* Legend */}
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Швидше</span>
            {["rgba(214,255,63,0.85)", "rgba(214,255,63,0.45)", "rgba(245,166,35,0.6)", "rgba(245,103,90,0.5)", "rgba(245,103,90,0.9)"].map((c, i) => (
              <div key={i} className="w-5 h-3 rounded-sm" style={{ background: c }} />
            ))}
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Повільніше</span>
            <div className="w-5 h-3 rounded-sm ml-2"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }} />
            <span className="text-[10px]" style={{ color: "var(--text-tertiary)" }}>Немає даних</span>
          </div>
        </div>
      </div>
    </div>
  );
}
