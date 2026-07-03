"use client";

export function SidebarNavLink({ href, label, icon, badge, badgeRed }: {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: string;
  badgeRed?: boolean;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-2.5 px-2 py-2 rounded-lg text-xs transition-all hover:bg-white/5 hover:text-[var(--text-primary)]"
      style={{ color: "var(--text-tertiary)" }}
    >
      <span className="shrink-0 opacity-60">{icon}</span>
      <span className="flex-1 truncate">{label}</span>
      {badge && (
        <span
          className="shrink-0 text-[10px] font-mono px-1.5 py-0.5 rounded-md"
          style={{
            background: badgeRed ? "rgba(245,103,90,0.15)" : "rgba(214,255,63,0.08)",
            color: badgeRed ? "#F5675A" : "var(--lime)",
          }}
        >
          {badge}
        </span>
      )}
    </a>
  );
}
