"use client";
import { useState, useEffect, useCallback } from "react";
import { Loader2 } from "lucide-react";

interface Commission {
  id: string;
  payment_amount_usd: number;
  commission_amount_usd: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  referrer: { name: string } | null;
  referred: { name: string } | null;
}

interface Props { accessToken: string; workerUrl: string; }

const STATUS_LABELS: Record<string, string> = {
  pending: "В очікуванні",
  eligible: "Готово",
  paid: "Виплачено",
  voided: "Скасовано",
};
const STATUS_COLORS: Record<string, string> = {
  pending: "#8CF6FF",
  eligible: "#FFC24B",
  paid: "#D6FF3F",
  voided: "#6E6E73",
};

export function ReferralCommissionsPanel({ accessToken, workerUrl }: Props) {
  const [commissions, setCommissions] = useState<Commission[] | null>(null);
  const [updating, setUpdating] = useState<string | null>(null);
  const [filter, setFilter] = useState<"unpaid" | "all">("unpaid");

  const load = useCallback(() => {
    fetch(`${workerUrl}/api/admin/referral-commissions`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setCommissions(d.commissions as Commission[]); })
      .catch(() => {});
  }, [accessToken, workerUrl]);

  useEffect(() => { load(); }, [load]);

  async function markPaid(id: string) {
    setUpdating(id);
    try {
      const resp = await fetch(`${workerUrl}/api/admin/referral-commissions/${id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ status: "paid" }),
      });
      if (resp.ok) load();
    } catch {
      // ignore
    } finally {
      setUpdating(null);
    }
  }

  const visible = commissions?.filter(c => filter === "all" ? true : c.status !== "paid" && c.status !== "voided") ?? null;
  const totalUnpaid = commissions?.filter(c => c.status !== "paid" && c.status !== "voided")
    .reduce((sum, c) => sum + c.commission_amount_usd, 0) ?? 0;

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide">
            Реферальні виплати
          </h2>
          {totalUnpaid > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-md font-mono"
              style={{ background: "rgba(255,194,75,0.1)", border: "1px solid rgba(255,194,75,0.3)", color: "#FFC24B" }}>
              ${totalUnpaid.toFixed(2)} до виплати
            </span>
          )}
        </div>
        <div className="flex gap-1">
          {(["unpaid", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className="text-xs px-2.5 py-1 rounded-lg transition-colors"
              style={{
                background: filter === f ? "rgba(255,255,255,0.08)" : "transparent",
                color: filter === f ? "var(--text-primary)" : "var(--text-tertiary)",
              }}
            >
              {f === "unpaid" ? "Не виплачено" : "Всі"}
            </button>
          ))}
        </div>
      </div>

      {visible === null ? (
        <div className="flex justify-center py-8 text-[var(--text-tertiary)]">
          <Loader2 size={16} className="animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">
          {filter === "unpaid" ? "Немає нарахувань до виплати" : "Нарахувань ще не було"}
        </p>
      ) : (
        <div className="space-y-2">
          {visible.map(c => (
            <div key={c.id} className="flex items-center justify-between rounded-xl p-4"
              style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
              <div>
                <p className="text-sm font-medium">
                  {c.referrer?.name ?? "—"} <span className="text-[var(--text-tertiary)]">← привів →</span> {c.referred?.name ?? "—"}
                </p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
                  {new Date(c.created_at).toLocaleDateString("uk-UA")} · платіж ${c.payment_amount_usd} → комісія{" "}
                  <span className="font-mono font-medium" style={{ color: "var(--lime)" }}>${c.commission_amount_usd}</span>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs px-2 py-1 rounded-md font-medium"
                  style={{ background: `${STATUS_COLORS[c.status]}1a`, color: STATUS_COLORS[c.status] }}>
                  {STATUS_LABELS[c.status] ?? c.status}
                </span>
                {c.status !== "paid" && c.status !== "voided" && (
                  <button
                    onClick={() => markPaid(c.id)}
                    disabled={updating === c.id}
                    className="text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                    style={{ background: "var(--lime)", color: "#0c111d" }}
                  >
                    {updating === c.id ? "..." : "Виплачено"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
