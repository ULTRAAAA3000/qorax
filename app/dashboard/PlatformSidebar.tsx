"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3, Lock, Users, Send,
  GraduationCap, Target, ChevronDown, Grid2x2, ArrowUpRight, Languages, ShoppingCart, Users2,
} from "lucide-react";
import type { PlatformModule } from "@/app/lib/getPlatformModules";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3, Users, Send, GraduationCap, Target, Languages, ShoppingCart, Users2,
};

// Модуль 'ai' винесено окремим верхнім пунктом (DESIGN_SYSTEM.md, розділ
// "Sidebar" — "AI ... завжди залишається окремим верхнім пунктом").
// 'audit' — це поточний Dashboard (сторінка /dashboard), також не в Apps.
const TOP_LEVEL_KEYS = new Set(["audit", "ai"]);

/**
 * Sidebar верхнього рівня платформи (DESIGN_SYSTEM.md, розділ "Sidebar"):
 * Dashboard (audit) і AI — завжди окремі верхні пункти, решта модулів
 * (Rank/Analytics/Content/CRM/Social/Academy/...) згруповані під розділом
 * "Apps" — компактний список тут же в сайдбарі (не 15-20 пунктів нагорі),
 * плюс лінк на /dashboard/apps з повною сіткою карток.
 * "Audit" — поточний monitoring, вже робочий. Решта coming_soon-модулів
 * показуються заблокованими — клік відкриває легкий tooltip замість
 * переходу на неіснуючу сторінку.
 */
export function PlatformSidebar({ modules }: { modules: PlatformModule[] }) {
  const pathname = usePathname();
  const [comingSoonHint, setComingSoonHint] = useState<string | null>(null);
  const [appsOpen, setAppsOpen] = useState(true);

  const topLevel = modules.filter(m => TOP_LEVEL_KEYS.has(m.key));
  const apps = modules.filter(m => !TOP_LEVEL_KEYS.has(m.key));
  const liveAppsCount = apps.filter(m => m.status === "live").length;

  const renderItem = (m: PlatformModule) => {
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
  };

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
      <nav className="px-2 py-4 flex-1 overflow-y-auto">
        <p
          className="text-[10px] font-medium uppercase px-2 mb-2"
          style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}
        >
          Платформа
        </p>

        {topLevel.map(renderItem)}

        <button
          type="button"
          onClick={() => setAppsOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-2.5 py-2 mt-4 rounded-lg text-[10px] font-medium uppercase transition-colors"
          style={{ color: "rgba(255,255,255,0.2)", letterSpacing: "0.1em" }}
        >
          <Grid2x2 size={12} className="shrink-0" />
          <span className="flex-1 text-left">Apps</span>
          <span
            className="text-[9px] font-mono normal-case px-1.5 py-0.5 rounded"
            style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)" }}
          >
            {liveAppsCount}/{apps.length}
          </span>
          <ChevronDown
            size={12}
            className="shrink-0 transition-transform"
            style={{ transform: appsOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
          />
        </button>

        {appsOpen && (
          <div className="space-y-0.5">
            {apps.map(renderItem)}
          </div>
        )}

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

      <div className="px-2 py-3" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <Link
          href="/dashboard/apps"
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs transition-colors"
          style={{ color: "var(--text-tertiary)" }}
        >
          <span className="flex-1 truncate">Усі додатки</span>
          <ArrowUpRight size={13} className="shrink-0" />
        </Link>
      </div>
    </aside>
  );
}
