"use client";

import { useState, useEffect } from "react";
import { Copy, Check, Loader2, Users, DollarSign, Clock } from "lucide-react";

interface Commission {
  id: string;
  referred_org_id: string;
  payment_amount_usd: number;
  commission_amount_usd: number;
  status: string;
  created_at: string;
  paid_at: string | null;
}
interface ReferralStats {
  referralCode: string | null;
  referredCount: number;
  totalEarned: number;
  totalPaid: number;
  totalPending: number;
  commissions: Commission[];
}

interface Props { accessToken: string; workerUrl: string; }

const STATUS_LABELS: Record<string, string> = {
  pending: "В очікуванні",
  eligible: "Готово до виплати",
  paid: "Виплачено",
  voided: "Скасовано",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#8CF6FF",
  eligible: "#FFC24B",
  paid: "#D6FF3F",
  voided: "#6E6E73",
};

export function ReferralDashboard({ accessToken, workerUrl }: Props) {
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`${workerUrl}/api/referrals`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStats(d as ReferralStats); })
      .catch(() => {});
  }, [accessToken, workerUrl]);

  const referralUrl = stats?.referralCode
    ? `${typeof window !== "undefined" ? window.location.origin : "https://qorax.app"}/r/${stats.referralCode}`
    : null;

  function handleCopy() {
    if (!referralUrl) return;
    navigator.clipboard.writeText(referralUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!stats) {
    return (
      <div className="flex justify-center py-12 text-[var(--text-tertiary)]">
        <Loader2 size={18} className="animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Referral link */}
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
          Ваше реферальне посилання
        </p>
        <div className="flex items-center gap-2">
          <div className="flex-1 min-w-0 rounded-xl px-4 py-3 font-mono text-sm truncate"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            {referralUrl ?? "—"}
          </div>
          <button
            onClick={handleCopy}
            disabled={!referralUrl}
            className="shrink-0 h-11 w-11 flex items-center justify-center rounded-xl transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1.5">
            <Users size={12} /> <span className="text-xs">Приведено</span>
          </div>
          <p className="font-display text-xl font-bold">{stats.referredCount}</p>
        </div>
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1.5">
            <DollarSign size={12} /> <span className="text-xs">Всього зароблено</span>
          </div>
          <p className="font-display text-xl font-bold" style={{ color: "var(--lime)" }}>${stats.totalEarned}</p>
        </div>
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1.5">
            <Check size={12} /> <span className="text-xs">Виплачено</span>
          </div>
          <p className="font-display text-xl font-bold">${stats.totalPaid}</p>
        </div>
        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-4">
          <div className="flex items-center gap-1.5 text-[var(--text-tertiary)] mb-1.5">
            <Clock size={12} /> <span className="text-xs">Очікує виплати</span>
          </div>
          <p className="font-display text-xl font-bold" style={{ color: "#FFC24B" }}>${stats.totalPending}</p>
        </div>
      </div>

      {/* Commissions list */}
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
          Історія нарахувань
        </p>
        {stats.commissions.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)] py-4 text-center">
            Поки що немає нарахувань — поділіться посиланням вище
          </p>
        ) : (
          <div className="space-y-0 divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            {stats.commissions.map(c => (
              <div key={c.id} className="flex items-center justify-between py-3 first:pt-0">
                <div>
                  <p className="text-sm font-mono font-medium">${c.commission_amount_usd}</p>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {new Date(c.created_at).toLocaleDateString("uk-UA")} · з платежу ${c.payment_amount_usd}
                  </p>
                </div>
                <span className="text-xs px-2 py-1 rounded-md font-medium"
                  style={{ background: `${STATUS_COLORS[c.status]}1a`, color: STATUS_COLORS[c.status] }}>
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
