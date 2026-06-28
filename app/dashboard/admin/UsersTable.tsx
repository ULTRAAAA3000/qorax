"use client";

import { useState, useEffect, useCallback } from "react";
import { ChevronDown, Loader2, CheckCircle, Users, RefreshCw, AlertCircle } from "lucide-react";

interface Plan {
  id: string;
  code: string;
  name: string;
}

interface OrgMember {
  user_id: string;
  role: string;
  profiles?: { email?: string } | null;
}

interface Sub {
  id: string;
  status: string;
  trial_ends_at: string | null;
  plan_id: string | null;
  created_at: string;
  plans?: Plan | null;
}

interface Org {
  id: string;
  name: string;
  created_at: string;
  organization_members: OrgMember[];
  subscriptions: Sub[];
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

interface Props {
  accessToken: string;
  workerUrl: string;
}

export function UsersTable({ accessToken, workerUrl }: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [changingOrg, setChangingOrg] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Record<string, string>>({});
  const [loadingOrg, setLoadingOrg] = useState<string | null>(null);
  const [successOrg, setSuccessOrg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({});

  const loadClients = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch(`${workerUrl}/api/admin/clients`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { orgs: Org[]; plans: Plan[] };
      setOrgs(data.orgs ?? []);
      setPlans(data.plans ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Помилка завантаження");
    } finally {
      setLoading(false);
    }
  }, [accessToken, workerUrl]);

  useEffect(() => { loadClients(); }, [loadClients]);

  async function changePlan(orgId: string) {
    const planId = selectedPlan[orgId];
    if (!planId) return;
    setLoadingOrg(orgId);
    setErrorMsg(prev => ({ ...prev, [orgId]: "" }));
    try {
      const resp = await fetch(`${workerUrl}/api/admin/change-plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ org_id: orgId, plan_id: planId }),
      });
      const data = await resp.json() as { ok?: boolean; error?: string };
      if (resp.ok && data.ok) {
        setSuccessOrg(orgId);
        setChangingOrg(null);
        setTimeout(() => setSuccessOrg(null), 3000);
        // Перезавантажуємо список
        setTimeout(() => loadClients(), 600);
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
    return new Date(iso).toLocaleDateString("uk-UA", { day: "numeric", month: "short", year: "numeric" });
  }

  function trialDaysLeft(endsAt: string | null): number | null {
    if (!endsAt) return null;
    return Math.ceil((new Date(endsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="rounded-2xl border hairline bg-[var(--bg-raised)]">
      <div className="flex items-center justify-between px-5 py-4 border-b hairline">
        <div className="flex items-center gap-2">
          <Users size={15} className="text-[var(--text-tertiary)]" />
          <h2 className="text-sm font-medium">
            Організації {!loading && `(${orgs.length})`}
          </h2>
        </div>
        <button
          onClick={loadClients}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-70 disabled:opacity-40"
          style={{ color: "var(--text-tertiary)", border: "1px solid var(--border-hairline)" }}
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
          Оновити
        </button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-[var(--text-tertiary)]">
          <Loader2 size={14} className="animate-spin" /> Завантаження...
        </div>
      )}

      {!loading && loadError && (
        <div className="flex items-center gap-2 p-5 text-sm" style={{ color: "#F5675A" }}>
          <AlertCircle size={14} />
          {loadError} — можливо потрібно додати <code className="mx-1 px-1 rounded" style={{ background: "rgba(245,103,90,0.1)" }}>SUPABASE_SERVICE_ROLE_KEY</code> в секрети frontend worker
        </div>
      )}

      {!loading && !loadError && (
        <div className="divide-y hairline">
          {orgs.length === 0 && (
            <p className="text-sm text-[var(--text-tertiary)] p-5">Немає організацій</p>
          )}
          {orgs.map((org) => {
            const subs = org.subscriptions ?? [];
            const sub = subs.find(s => s.status === "active" || s.status === "trialing") ?? subs[0] ?? null;
            const planCode = sub?.plans?.code ?? "free";
            const planName = sub?.plans?.name ?? "Free";
            const subStatus = sub?.status ?? "—";
            const daysLeft = trialDaysLeft(sub?.trial_ends_at ?? null);
            const members = org.organization_members ?? [];
            const ownerEmail = members.find(m => m.role === "owner")?.profiles?.email
              ?? members[0]?.profiles?.email
              ?? null;
            const isChanging = changingOrg === org.id;
            const isLoading = loadingOrg === org.id;
            const isSuccess = successOrg === org.id;

            return (
              <div key={org.id} className="p-4">
                <div className="flex items-start justify-between gap-4">
                  {/* Left */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-medium truncate">{org.name}</p>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(255,255,255,0.05)", color: PLAN_COLORS[planCode] ?? "var(--text-tertiary)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {planName}
                      </span>
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md"
                        style={{ background: "rgba(255,255,255,0.05)", color: STATUS_COLORS[subStatus] ?? "var(--text-tertiary)", border: "1px solid rgba(255,255,255,0.08)" }}>
                        {subStatus}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--text-tertiary)]">
                      {ownerEmail && <span className="font-mono">{ownerEmail} · </span>}
                      {members.length} {members.length === 1 ? "член" : "члени"} · {fmtDate(org.created_at)}
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

                  {/* Right */}
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
                            style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
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
                        >✕</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setChangingOrg(org.id); setSelectedPlan(prev => ({ ...prev, [org.id]: "" })); }}
                        className="text-xs px-3 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                        style={{ border: "1px solid var(--border-hairline)", color: "var(--text-secondary)" }}
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
      )}
    </div>
  );
}
