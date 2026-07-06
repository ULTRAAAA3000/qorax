"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { SiteCard } from "./SiteCard";
import { ExportSitesButton } from "./ExportSitesButton";

interface SiteRow {
  id: string;
  url: string;
  display_name: string;
  monitoring_enabled: boolean;
  created_at: string;
  isDown: boolean;
  inMaintenance: boolean;
}

type SortKey = "status" | "name" | "date";

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "status", label: "За статусом" },
  { key: "name", label: "За назвою" },
  { key: "date", label: "За датою" },
];

export function SitesListControls({ sites }: { sites: SiteRow[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("status");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Клавіатурний шорткат "/" — фокусує пошук, як у GitHub/Linear.
  // Не спрацьовує якщо юзер вже пише в іншому полі (input/textarea),
  // щоб не заважати вводу символу "/" в звичайному тексті.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "/") return;
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if (isTyping) return;
      e.preventDefault();
      searchInputRef.current?.focus();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = sites;
    if (q) {
      list = list.filter(s =>
        s.display_name.toLowerCase().includes(q) ||
        s.url.toLowerCase().includes(q)
      );
    }

    const sorted = [...list];
    if (sortKey === "status") {
      // Down йде першими, потім у обслуговуванні, потім up. Всередині
      // кожної групи — за датою додавання (найновіші зверху), як і раніше.
      sorted.sort((a, b) => {
        const rank = (s: SiteRow) => (s.isDown ? 0 : s.inMaintenance ? 1 : 2);
        const r = rank(a) - rank(b);
        if (r !== 0) return r;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    } else if (sortKey === "name") {
      sorted.sort((a, b) => a.display_name.localeCompare(b.display_name, "uk"));
    } else {
      sorted.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }

    return sorted;
  }, [sites, query, sortKey]);

  return (
    <div className="space-y-3">
      {/* Пошук + сортування — показуємо тільки якщо є що фільтрувати */}
      {sites.length > 1 && (
        <div className="flex items-center gap-2.5 flex-wrap">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--text-tertiary)" }} />
            <input
              ref={searchInputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук за назвою або URL..."
              className="w-full text-sm rounded-xl pl-8 pr-9 py-2 bg-transparent outline-none transition-colors"
              style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            />
            {!query && (
              <kbd
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono px-1.5 py-0.5 rounded-md pointer-events-none"
                style={{ background: "rgba(255,255,255,0.05)", color: "var(--text-tertiary)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                /
              </kbd>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-xl p-1" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {SORT_OPTIONS.map(opt => (
              <button
                key={opt.key}
                onClick={() => setSortKey(opt.key)}
                className="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
                style={{
                  background: sortKey === opt.key ? "rgba(214,255,63,0.1)" : "transparent",
                  color: sortKey === opt.key ? "var(--lime)" : "var(--text-tertiary)",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <ExportSitesButton sites={filtered} />
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>
          Нічого не знайдено за запитом «{query}»
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((site, i) => <SiteCard key={site.id} site={site} index={i} />)}
        </div>
      )}
    </div>
  );
}
