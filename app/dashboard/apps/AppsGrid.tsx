"use client";

import Link from "next/link";
import {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3, Users, Send,
  GraduationCap, Target, Languages, ArrowRight, Clock,
} from "lucide-react";
import type { PlatformModule } from "@/app/lib/getPlatformModules";

const ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3, Users, Send, GraduationCap, Target, Languages,
};

/**
 * Сітка карток модулів (DESIGN_SYSTEM.md, розділ "Apps"): іконка, назва,
 * короткий опис, статус (live/coming soon), кнопка відкриття. Той самий
 * статус, що і в PlatformSidebar — обидва читають getPlatformModules().
 */
export function AppsGrid({ modules }: { modules: PlatformModule[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {modules.map(m => {
        const Icon = (m.icon && ICONS[m.icon]) || ShieldCheck;
        const isLive = m.status === "live";

        const card = (
          <div
            className="group relative flex flex-col gap-3 rounded-2xl p-5 h-full transition-colors"
            style={{
              background: "var(--bg-card)",
              border: `1px solid ${isLive ? "var(--border-hairline)" : "rgba(255,255,255,0.05)"}`,
            }}
          >
            <div className="flex items-start justify-between">
              <span
                className="flex items-center justify-center w-9 h-9 rounded-xl shrink-0"
                style={{
                  background: isLive ? "rgba(214,255,63,0.08)" : "rgba(255,255,255,0.04)",
                  color: isLive ? "var(--lime)" : "var(--text-tertiary)",
                }}
              >
                <Icon size={17} />
              </span>

              {isLive ? (
                <span
                  className="text-[10px] font-mono px-2 py-1 rounded-full"
                  style={{ background: "rgba(214,255,63,0.08)", color: "var(--lime)" }}
                >
                  Live
                </span>
              ) : (
                <span
                  className="flex items-center gap-1 text-[10px] font-mono px-2 py-1 rounded-full"
                  style={{ background: "rgba(140,246,255,0.06)", color: "var(--cyan)" }}
                >
                  <Clock size={10} /> Скоро
                </span>
              )}
            </div>

            <div className="flex-1">
              <h3
                className="font-display text-base font-semibold mb-1"
                style={{ color: isLive ? "var(--text-primary)" : "var(--text-secondary)" }}
              >
                {m.label}
              </h3>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-tertiary)" }}>
                {m.description ?? "Опис незабаром."}
              </p>
            </div>

            {isLive ? (
              <span
                className="flex items-center gap-1 text-xs font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Відкрити
                <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            ) : (
              <span className="text-xs" style={{ color: "var(--text-tertiary)", opacity: 0.6 }}>
                У розробці
              </span>
            )}
          </div>
        );

        if (isLive) {
          return (
            <Link key={m.key} href={m.href} className="block h-full">
              {card}
            </Link>
          );
        }

        return (
          <div key={m.key} className="h-full cursor-default">
            {card}
          </div>
        );
      })}
    </div>
  );
}
