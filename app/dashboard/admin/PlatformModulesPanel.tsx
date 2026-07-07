"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/app/lib/supabase/client";
import { Loader2, ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3, ChevronDown } from "lucide-react";

type ModuleStatus = "live" | "coming_soon" | "hidden";

interface Module {
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  href: string;
  status: ModuleStatus;
  sort_order: number;
}

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  ShieldCheck, Layout, Sparkles, FileText, TrendingUp, BarChart3,
};

const STATUS_COLORS: Record<ModuleStatus, string> = {
  live: "#D6FF3F",
  coming_soon: "#8CF6FF",
  hidden: "#6E6E73",
};

/**
 * Admin-панель управління platform_modules — дозволяє змінювати статус
 * модуля (live/coming_soon/hidden) прямо з дашборду, без прямого SQL
 * в Supabase SQL Editor. Пише напряму через browser Supabase client —
 * RLS-політики з міграції 0040 (is_platform_admin()) захищають запис,
 * тому окремий worker-ендпоінт чи Next.js API route не потрібні.
 */
export function PlatformModulesPanel() {
  const supabase = createClient();
  const [modules, setModules] = useState<Module[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    supabase
      .from("platform_modules")
      .select("key, label, description, icon, href, status, sort_order")
      .order("sort_order", { ascending: true })
      .then(({ data, error }) => {
        if (error) { setError(error.message); return; }
        setModules(data as Module[]);
      });
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function updateStatus(key: string, status: ModuleStatus) {
    setUpdating(key);
    setError(null);
    const { error } = await supabase
      .from("platform_modules")
      .update({ status })
      .eq("key", key);
    setUpdating(null);
    if (error) { setError(error.message); return; }
    setModules(prev => prev?.map(m => (m.key === key ? { ...m, status } : m)) ?? null);
  }

  return (
    <div className="glow-card p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="font-display text-lg font-semibold">Модулі платформи</h2>
      </div>
      <p className="text-sm text-[var(--text-secondary)] mb-5">
        Статус визначає видимість у sidebar дашборду та на лендингу — без деплою.
      </p>

      {error && (
        <div className="mb-4 px-3 py-2 rounded-lg text-xs" style={{ background: "rgba(245,103,90,0.1)", color: "#F5675A", border: "1px solid rgba(245,103,90,0.2)" }}>
          {error}
        </div>
      )}

      {!modules && (
        <div className="flex items-center gap-2 text-sm text-[var(--text-tertiary)] py-8 justify-center">
          <Loader2 size={16} className="animate-spin" /> Завантаження...
        </div>
      )}

      {modules && (
        <div className="space-y-2">
          {modules.map(m => {
            const Icon = m.icon ? ICONS[m.icon] : undefined;
            return (
              <div
                key={m.key}
                className="flex items-center gap-3 px-3 py-3 rounded-xl"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              >
                {Icon && <Icon size={16} />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{m.label}</span>
                    <span className="text-[10px] font-mono text-[var(--text-tertiary)]">{m.href}</span>
                  </div>
                  {m.description && (
                    <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{m.description}</p>
                  )}
                </div>

                <div className="relative shrink-0">
                  <select
                    value={m.status}
                    disabled={updating === m.key}
                    onChange={e => updateStatus(m.key, e.target.value as ModuleStatus)}
                    className="appearance-none text-xs font-mono pl-3 pr-7 py-1.5 rounded-lg cursor-pointer"
                    style={{
                      background: "rgba(255,255,255,0.04)",
                      border: `1px solid ${STATUS_COLORS[m.status]}33`,
                      color: STATUS_COLORS[m.status],
                    }}
                  >
                    <option value="live">Live</option>
                    <option value="coming_soon">Скоро</option>
                    <option value="hidden">Приховано</option>
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: STATUS_COLORS[m.status] }} />
                </div>

                {updating === m.key && <Loader2 size={14} className="animate-spin shrink-0" style={{ color: "var(--text-tertiary)" }} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
