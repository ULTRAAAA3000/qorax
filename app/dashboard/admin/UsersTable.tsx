"use client";

import { useState, useEffect } from "react";
import { ChevronDown, Loader2, CheckCircle, Users } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

interface Plan {
  id: string;
  code: string;
  name: string;
}

interface Org {
  id: string;
  name: string;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  organization_members: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  subscriptions: any[];
}

const PLAN_COLORS: Record<string, string> = {
  free:    "var(--text-tertiary)",
  trial:   "var(--cyan)",
  starter: "var(--lime)",
  growth:  "var(--lime)",
  agency:  "var(--lime)",
  admin:   "#F5A623",
};

const STATUS_COLORS: Record<string, string> = {
  trialing: "var(--cyan)",
  active:   "var(--lime)",
  canceled: "var(--text-tertiary)",
  past_due: "#F5675A",
};

export function UsersTable({ orgs, plans }: { orgs: Org[]; plans: Plan[] }) {
  const [changingOrg, setChangingOrg] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});
  const [loadingOrg, setLoadingOrg] = useState<string | null>(null);
  const [successOrg, setSuccessOrg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});
  const [accessToken, setAccessToken] = useState<string>("");

  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? "");
    });
  }, []);

  const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

  async function changePlan(orgId: string) {
    const planId = selectedPlan[orgId];
    if (!planId) return;

    setLoadingOrg(orgId);
    setErrorMsg(prev => ({ ...prev, [orgId]: "" }));

    try {
      const resp = await fetch(`${workerUrl}/api/admin/change-plan`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ org_id: orgId, plan_id: planId }),
      });
      const data = await resp.json() as { ok?: boolean; error?: string };

      if (resp.ok && data.ok) {
        setSuccessOrg(orgId);
        setChangingOrg(null);
        setTimeout(() => setSuccessOrg(null), 3000);
        setTimeout(() => window.location.reload(), 500);
      } else {
        setErrorMsg(prev => ({ ...prev, [orgId]: data.error ?? "Помилка" }));
      }
    } catch {
      setErrorMsg(prev => ({ ...prev, [orgId]: "Мережева помилка" }));
    } finally {
      setLoadingOrg(null);
    }
  }

  function fmtDate(iso: string) {
    return new Date(iso).toLocaleDateString("uk-UA", {
      day: "numeric", month: "short", year: "numeric",
    });
  }

  function trialDaysLeft(endsAt: string | null): number | null {
    if (!endsAt) return null;
    const ms = new Date(endsAt).getTime() - Date.now();
    return Math.ceil(ms / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)]">
      <div className="flex items-center gap-2 p-5 border-b hairline">
        <Users size={15} className="text-[var(--text-tertiary)]" />
        <h2 className="text-sm font-medium">Організації ({orgs.length})</h2>
      </div>

      <div className="divide-y hairline">
        {orgs.length === 0 && (
          <p className="text-sm text-[var(--text-tertiary)] p-5">Немає організацій</p>
        )}
        {orgs.map((org) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const subs = (org.subscriptions ?? []) as any[];
          // Беремо активну підписку, або першу якщо немає активної
          const sub = subs.find((s: any) => s.status === "active" || s.status === "trialing") ?? subs[0] ?? null;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const planCode = (sub?.plans as any)?.code as string ?? "free";
          const planName = (sub?.plans as { name?: string })?.name ?? "Free";
          const subStatus = sub?.status as string ?? "—";
          const daysLeft = trialDaysLeft(sub?.trial_ends_at);
          const memberCount = org.organization_members?.length ?? 0;
          const isChanging = changingOrg === org.id;
          const isLoading = loadingOrg === org.id;
          const isSuccess = successOrg === org.id;

          return (
            <div key={org.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                {/* Left: org info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-sm font-medium truncate">{org.name}</p>
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded-md shrink-0"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        color: PLAN_COLORS[planCode] ?? "var(--text-tertiary)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {planName}
                    </span>
                    <span
                      className="text-xs font-mono px-2 py-0.5 rounded-md shrink-0"
                      style={{
                        background: "rgba(255,255,255,0.05)",
                        color: STATUS_COLORS[subStatus] ?? "var(--text-tertiary)",
                        border: "1px solid rgba(255,255,255,0.08)",
                      }}
                    >
                      {subStatus}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">
                    {memberCount} {memberCount === 1 ? "член" : "члени"} · Зареєстровано {fmtDate(org.created_at)}
                    {daysLeft !== null && (
                      <span style={{ color: daysLeft <= 3 ? "#F5A623" : "var(--text-tertiary)" }}>
                        {" · "}{daysLeft > 0 ? `тріал: ${daysLeft}д` : "тріал закінчився"}
                      </span>
                    )}
                  </p>
                  {errorMsg[org.id] && (
                    <p className="text-xs mt-1" style={{ color: "#F5675A" }}>{errorMsg[org.id]}</p>
                  )}
                </div>

                {/* Right: actions */}
                <div className="shrink-0 flex items-center gap-2">
                  {isSuccess ? (
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--lime)" }}>
                      <CheckCircle size={12} /> Змінено
                    </div>
                  ) : isChanging ? (
                    <div className="flex items-center gap-2">
                      <div className="relative">
                        <select
                          value={selectedPlan[org.id] ?? ""}
                          onChange={e => setSelectedPlan(prev => ({ ...prev, [org.id]: e.target.value }))}
                          className="text-xs font-mono rounded-lg px-2.5 py-2 pr-7 appearance-none outline-none"
                          style={{
                            background: "var(--bg)",
                            border: "1px solid var(--border-hairline)",
                            color: "var(--text-primary)",
                          }}
                        >
                          <option value="">— обрати план —</option>
                          {plans.map(p => (
                            <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                          ))}
                        </select>
                        <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--text-tertiary)]" />
                      </div>
                      <button
                        onClick={() => changePlan(org.id)}
                        disabled={isLoading || !selectedPlan[org.id]}
                        className="text-xs font-medium px-3 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-40 flex items-center gap-1.5"
                        style={{ background: "var(--lime)", color: "#0C111D" }}
                      >
                        {isLoading ? <Loader2 size={11} className="animate-spin" /> : null}
                        Зберегти
                      </button>
                      <button
                        onClick={() => setChangingOrg(null)}
                        className="text-xs px-2 py-2 rounded-lg transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setChangingOrg(org.id);
                        setSelectedPlan(prev => ({ ...prev, [org.id]: "" }));
                      }}
                      className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                      style={{
                        border: "1px solid var(--border-hairline)",
                        color: "var(--text-secondary)",
                      }}
                    >
                      Змінити план
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
