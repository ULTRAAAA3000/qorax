"use client";
import { useState, useEffect } from "react";

interface Stats {
  users: number; sites: number; checks: number; trials: number; paid: number;
}

interface Props { accessToken: string; workerUrl: string; }

export function AdminStats({ accessToken, workerUrl }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`${workerUrl}/api/admin/stats`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d as Stats); })
      .catch(() => {});
  }, [accessToken, workerUrl]);

  const items = [
    { label: "Користувачів", value: stats?.users, accent: false },
    { label: "Сайтів", value: stats?.sites, accent: false },
    { label: "Тріалів", value: stats?.trials, accent: false },
    { label: "Платних", value: stats?.paid, accent: true },
    { label: "Uptime-перевірок", value: stats?.checks != null ? stats.checks.toLocaleString() : undefined, accent: false },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
      {items.map(s => (
        <div key={s.label} className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <p className="text-xs text-[var(--text-tertiary)] mb-1">{s.label}</p>
          <p className="font-display text-2xl font-bold tabular-nums"
            style={{ color: s.accent ? "var(--lime)" : "var(--text-primary)" }}>
            {s.value ?? <span className="text-[var(--text-tertiary)] text-lg">…</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
