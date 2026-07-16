"use client";

import type { PresentUser } from "./usePresence";

const COLORS = ["#C6FF54", "#8CF6FF", "#B98CF7", "#FF9F6B", "#6BD4FF"];

function colorFor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return COLORS[hash % COLORS.length];
}

function initials(email: string): string {
  return (email.split("@")[0] || "?").slice(0, 2).toUpperCase();
}

// Показує, хто ще зараз дивиться цей документ — MVP "спільної
// роботи" (usePresence.ts). Порожньо, якщо нікого іншого немає —
// не займає місце в UI даремно.
export function PresenceAvatars({ users }: { users: PresentUser[] }) {
  if (users.length === 0) return null;

  return (
    <div className="flex items-center -space-x-1.5" title={users.map(u => u.email).join(", ")}>
      {users.slice(0, 4).map(u => (
        <div
          key={u.userId}
          className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0"
          style={{ background: colorFor(u.userId), color: "#0a0a0a", border: "2px solid var(--bg)" }}
          title={u.email}
        >
          {initials(u.email)}
        </div>
      ))}
      {users.length > 4 && (
        <div
          className="h-6 w-6 rounded-full flex items-center justify-center text-[9px] font-semibold shrink-0"
          style={{ background: "rgba(255,255,255,0.1)", color: "var(--text-secondary)", border: "2px solid var(--bg)" }}
        >
          +{users.length - 4}
        </div>
      )}
    </div>
  );
}
