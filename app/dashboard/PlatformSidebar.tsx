"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3, Lock,
} from "lucide-react";
import type { PlatformModule } from "@/app/lib/getPlatformModules";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3,
};

/**
 * Sidebar верхнього рівня платформи — перелік продуктів (модулів), а не
 * розділів усередині одного продукту (для цього є окремий SidebarNavLink
 * на сторінці сайту). "Audit" — це поточний monitoring, вже робочий.
 * Решта модулів показуються з бейджем "Скоро" і не ведуть нікуди —
 * клік відкриває легкий tooltip замість переходу на неіснуючу сторінку.
 */
export function PlatformSidebar({ modules }: { modules: PlatformModule[] }) {
  const pathname = usePathname();
  const [comingSoonHint, setComingSoonHint] = useState<string | null>(null);

  return (
    <aside
      className="hidden lg:flex flex-col shrink-0 sticky top-14"
      style={{
        width: 216,
        height: "calc(100vh - 56px)",
        background: "rgba(255,255,255,0.015)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <nav className="px-2 py-4 flex-1">
        <p
          className="text-[10px] font-medium uppercase px-2 mb-2"
          style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}
        >
          Продукти
        </p>

        {modules.map(m => {
          const Icon = (m.icon && ICONS[m.icon]) || ShieldCheck;
          const isLive = m.status === "live";
          const isActive = isLive && (pathname === m.href || (m.href !== "/dashboard" && pathname.startsWith(m.href)));

          if (!isLive) {
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => setComingSoonHint(prev => (prev === m.key ? null : m.key))}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors text-left cursor-default"
                style={{ color: "var(--text-tertiary)" }}
              >
                <span className="shrink-0 opacity-40"><Icon size={15} /></span>
                <span className="flex-1 truncate opacity-50">{m.label}</span>
                <Lock size={11} className="shrink-0 opacity-30" />
              </button>
            );
          }

          return (
            <Link
              key={m.key}
              href={m.href}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors"
              style={{
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                background: isActive ? "rgba(255,255,255,0.05)" : "transparent",
              }}
            >
              <span className="shrink-0" style={{ color: isActive ? "var(--lime)" : "inherit", opacity: isActive ? 1 : 0.7 }}>
                <Icon size={15} />
              </span>
              <span className="flex-1 truncate">{m.label}</span>
            </Link>
          );
        })}

        {comingSoonHint && (
          <div
            className="mt-2 mx-1 px-3 py-2.5 rounded-lg text-xs leading-relaxed"
            style={{ background: "rgba(140,246,255,0.06)", border: "1px solid rgba(140,246,255,0.15)", color: "var(--text-secondary)" }}
          >
            {modules.find(m => m.key === comingSoonHint)?.description ?? "Цей модуль ще в розробці."}
            <span className="block mt-1 font-mono text-[10px]" style={{ color: "var(--cyan)" }}>Скоро</span>
          </div>
        )}
      </nav>
    </aside>
  );
}
