"use client";

/**
 * MailInboxPreview — glassmorphism inbox mockup for Qorax Mail
 * showcase on the landing page. Same visual language as
 * LiveMonitorPanel (Business) — window-dot header, rows, footer.
 */

type MailRow = {
  id: string;
  from: string;
  subject: string;
  time: string;
  unread: boolean;
};

const ROWS: MailRow[] = [
  { id: "1", from: "Олена Ковальчук", subject: "Комерційна пропозиція — оновлення", time: "09:14", unread: true },
  { id: "2", from: "Партнер · Nova Design", subject: "Рахунок за березень оплачено", time: "08:41", unread: true },
  { id: "3", from: "AI-агент Qorax", subject: "3 листи чекають на пріоритетну відповідь", time: "вчора", unread: false },
  { id: "4", from: "Клієнт · Т.О.В. Стимул", subject: "Дякую, все влаштовує!", time: "вчора", unread: false },
];

export function MailInboxPreview() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 0 60px rgba(140, 246, 255, 0.05), 0 20px 60px rgba(0, 0, 0, 0.3)",
      }}
    >
      <div
        className="flex items-center justify-between px-5 py-3.5"
        style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="flex items-center gap-2.5">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: "rgba(255, 255, 255, 0.1)" }} />
          </div>
          <span className="font-mono text-xs text-[var(--text-tertiary)]">Вхідні · Qorax Mail</span>
        </div>
        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(140,246,255,0.1)", color: "var(--cyan)" }}>
          2 нові
        </span>
      </div>

      <div>
        {ROWS.map((row, i) => (
          <div
            key={row.id}
            className="flex items-center gap-3 px-5 py-3.5"
            style={{ borderBottom: i < ROWS.length - 1 ? "1px solid rgba(255, 255, 255, 0.04)" : "none" }}
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ background: row.unread ? "var(--cyan)" : "rgba(255,255,255,0.15)" }}
            />
            <div className="flex-1 min-w-0">
              <div className={`text-sm leading-tight truncate ${row.unread ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]"}`}>
                {row.from}
              </div>
              <div className="text-xs text-[var(--text-tertiary)] leading-tight mt-0.5 truncate">
                {row.subject}
              </div>
            </div>
            <span className="font-mono text-[10px] text-[var(--text-tertiary)] shrink-0">{row.time}</span>
          </div>
        ))}
      </div>

      <div
        className="px-5 py-3 flex items-center justify-between"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)", background: "rgba(255, 255, 255, 0.02)" }}
      >
        <span className="text-xs text-[var(--text-secondary)]">Пошта + AI-агенти в одному вікні</span>
        <span className="font-mono text-xs" style={{ color: "var(--cyan)" }}>●&nbsp;онлайн</span>
      </div>
    </div>
  );
}
