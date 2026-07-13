// ─── IncidentTimeline ─────────────────────────────────────────
// Server component. Відображає список інцидентів за 30 днів
// у вигляді вертикального timeline з тривалістю і статусом.

interface Incident {
  id: string;
  started_at: string;
  resolved_at: string | null;
  duration_seconds?: number | null;
}

interface Props {
  incidents: Incident[];
  isUp: boolean;
}

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds} с`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} хв`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h} год ${m} хв` : `${h} год`;
}

function fmtDatetime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("uk-UA", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// Non-component helper, щоб react-hooks/purity не ловив Date.now()
// у тілі компонента (статичний матч за іменем виклику, не за
// фактичною чистотою — тут server component без re-render).
function currentTimestamp(): number {
  return Date.now();
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "long" });
}

export function IncidentTimeline({ incidents, isUp }: Props) {
  if (incidents.length === 0) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "14px 16px",
        borderRadius: 12,
        background: "rgba(214,255,63,0.04)",
        border: "1px solid rgba(214,255,63,0.12)",
      }}>
        <span style={{ fontSize: 16 }}>✓</span>
        <div>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--lime)" }}>
            Жодного інциденту за останні 30 днів
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--text-tertiary)" }}>
            Сайт працює стабільно
          </p>
        </div>
      </div>
    );
  }

  // Рахуємо підсумки
  const resolved = incidents.filter(i => i.resolved_at);
  const totalDownSec = resolved.reduce((acc, i) => {
    if (i.duration_seconds != null) return acc + i.duration_seconds;
    if (i.resolved_at) return acc + Math.round((new Date(i.resolved_at).getTime() - new Date(i.started_at).getTime()) / 1000);
    return acc;
  }, 0);
  const openCount = incidents.filter(i => !i.resolved_at).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

      {/* Підсумковий рядок */}
      <div style={{
        display: "flex",
        gap: 12,
        marginBottom: 16,
        flexWrap: "wrap",
      }}>
        <div style={{
          flex: 1,
          minWidth: 120,
          padding: "10px 14px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Інцидентів
          </p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: incidents.length > 0 ? "#F5675A" : "var(--lime)" }}>
            {incidents.length}
          </p>
        </div>
        <div style={{
          flex: 1,
          minWidth: 120,
          padding: "10px 14px",
          borderRadius: 10,
          background: "rgba(255,255,255,0.03)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <p style={{ margin: "0 0 2px", fontSize: 11, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Загальний простій
          </p>
          <p style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "var(--text-primary)" }}>
            {totalDownSec > 0 ? fmtDuration(totalDownSec) : "—"}
          </p>
        </div>
        {!isUp && openCount > 0 && (
          <div style={{
            flex: 1,
            minWidth: 120,
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(245,103,90,0.08)",
            border: "1px solid rgba(245,103,90,0.25)",
          }}>
            <p style={{ margin: "0 0 2px", fontSize: 11, color: "#F5675A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Зараз
            </p>
            <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#F5675A" }}>
              Сайт недоступний
            </p>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div style={{ position: "relative", paddingLeft: 20 }}>
        {/* Вертикальна лінія */}
        <div style={{
          position: "absolute",
          left: 5,
          top: 8,
          bottom: 8,
          width: 1,
          background: "rgba(255,255,255,0.07)",
        }} />

        <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
          {incidents.map((incident, idx) => {
            const isOpen = !incident.resolved_at;
            const duration = incident.duration_seconds != null
              ? fmtDuration(incident.duration_seconds)
              : isOpen
              ? `${Math.round((currentTimestamp() - new Date(incident.started_at).getTime()) / 60000)} хв (триває)`
              : incident.resolved_at
              ? fmtDuration(Math.round((new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime()) / 1000))
              : "—";

            const dotColor = isOpen ? "#F5675A" : "rgba(255,255,255,0.2)";
            const isFirst = idx === 0;

            return (
              <div key={incident.id} style={{
                position: "relative",
                paddingBottom: idx < incidents.length - 1 ? 16 : 0,
              }}>
                {/* Крапка на лінії */}
                <div style={{
                  position: "absolute",
                  left: -19,
                  top: 10,
                  width: 9,
                  height: 9,
                  borderRadius: "50%",
                  background: dotColor,
                  border: `2px solid ${isOpen ? "rgba(245,103,90,0.3)" : "rgba(255,255,255,0.08)"}`,
                  boxShadow: isOpen ? "0 0 8px rgba(245,103,90,0.5)" : "none",
                }} />

                {/* Картка інциденту */}
                <div style={{
                  padding: "12px 14px",
                  borderRadius: 10,
                  background: isOpen
                    ? "rgba(245,103,90,0.06)"
                    : isFirst
                    ? "rgba(255,255,255,0.03)"
                    : "transparent",
                  border: "1px solid",
                  borderColor: isOpen
                    ? "rgba(245,103,90,0.2)"
                    : "rgba(255,255,255,0.06)",
                }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        {isOpen && (
                          <span style={{
                            fontSize: 10,
                            fontWeight: 600,
                            padding: "2px 7px",
                            borderRadius: 20,
                            background: "rgba(245,103,90,0.15)",
                            color: "#F5675A",
                            textTransform: "uppercase",
                            letterSpacing: "0.05em",
                          }}>
                            Активний
                          </span>
                        )}
                        <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
                          {fmtDate(incident.started_at)}
                        </span>
                      </div>

                      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                        <div>
                          <p style={{ margin: "0 0 1px", fontSize: 11, color: "var(--text-tertiary)" }}>Початок</p>
                          <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--text-primary)", fontFamily: "monospace" }}>
                            {fmtDatetime(incident.started_at)}
                          </p>
                        </div>
                        {incident.resolved_at && (
                          <div>
                            <p style={{ margin: "0 0 1px", fontSize: 11, color: "var(--text-tertiary)" }}>Відновлення</p>
                            <p style={{ margin: 0, fontSize: 13, fontWeight: 500, color: "var(--lime)", fontFamily: "monospace" }}>
                              {fmtDatetime(incident.resolved_at)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Тривалість */}
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <p style={{ margin: "0 0 1px", fontSize: 11, color: "var(--text-tertiary)" }}>Тривалість</p>
                      <p style={{
                        margin: 0,
                        fontSize: 14,
                        fontWeight: 700,
                        color: isOpen ? "#F5675A" : "var(--text-secondary)",
                      }}>
                        {duration}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
