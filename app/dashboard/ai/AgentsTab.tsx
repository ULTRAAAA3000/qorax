"use client";

import { useState, useEffect, useCallback } from "react";
import { Bot, Loader2, Play, CheckCircle2, XCircle, Clock } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface SiteOption {
  id: string;
  url: string;
  display_name: string;
}

interface Agent {
  id: string;
  name: string;
  description: string;
  credit_cost_per_run: number;
  is_active: boolean;
}

interface AgentRun {
  id: string;
  status: string;
  credits_spent: number;
  summary: string | null;
  started_at: string;
  finished_at: string | null;
}

async function getFreshToken(): Promise<string> {
  try {
    const { createClient } = await import("@/app/lib/supabase/client");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  } catch {
    return "";
  }
}

const KIND_LABELS: Record<string, string> = {
  title: "Заголовок",
  meta_description: "Meta description",
};

/**
 * Результат запуску різний за структурою для кожного агента:
 * Content -> generated[] (готовий текст), SEO -> insights[] (активні
 * проблеми з estimated_monthly_loss_usd), Rank -> changes[] (дельта
 * позиції). Не намагаємось звести до одного спільного формату на
 * бекенді — кожен агент повертає те, що природно для його даних,
 * рендер тут просто розгалужується по наявному полю.
 */
interface AgentRunResult {
  summary: string;
  generated?: Array<{ page_url: string; kind: string; output: string }>;
  insights?: Array<{ severity: string; problem_summary: string; estimated_monthly_loss_usd: number | null }>;
  changes?: Array<{ query: string; current: number | null; previous: number | null; delta: number | null }>;
}

// Agents — вкладка Qorax AI хаба (EXECUTION_PLAN.md, п'ятий крок
// хвилі 3). Три агенти з реальними діями: Content (генерує текст —
// платить credits), SEO і Rank (агрегують вже наявні дані платформи —
// без AI-виклику, без списання кредитів). Qorax не має доступу до
// хостингу клієнта, тому жоден агент не змінює живий сайт сам —
// результат завжди пропозиція/зведення для власника.
export function AgentsTab({ sites }: { sites: SiteOption[] }) {
  const [selectedSiteId, setSelectedSiteId] = useState(sites[0]?.id ?? "");
  const [agents, setAgents] = useState<Agent[] | null>(null);
  const [runningAgentId, setRunningAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<{ agentId: string; result: AgentRunResult } | null>(null);
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(false);

  const loadAgents = useCallback(async () => {
    const token = await getFreshToken();
    if (!token) return;
    try {
      const resp = await fetch(`${API_BASE_URL}/api/agents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;
      const data = (await resp.json()) as { agents: Agent[] };
      setAgents(data.agents ?? []);
    } catch (err) {
      console.error("[AgentsTab] failed to load agents:", err);
    }
  }, []);

  const loadRuns = useCallback(async (siteId: string) => {
    if (!siteId) return;
    setLoadingRuns(true);
    try {
      const token = await getFreshToken();
      if (!token) { setLoadingRuns(false); return; }

      const resp = await fetch(`${API_BASE_URL}/api/agents/runs?site_id=${encodeURIComponent(siteId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { setLoadingRuns(false); return; }

      const data = (await resp.json()) as { runs: AgentRun[] };
      setRuns(data.runs ?? []);
    } catch (err) {
      console.error("[AgentsTab] failed to load runs:", err);
    } finally {
      setLoadingRuns(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadAgents();
    })();
  }, [loadAgents]);

  useEffect(() => {
    if (selectedSiteId) {
      (async () => {
        await loadRuns(selectedSiteId);
      })();
    }
  }, [selectedSiteId, loadRuns]);

  async function runAgent(agentId: string) {
    if (!selectedSiteId || runningAgentId) return;
    setRunningAgentId(agentId);
    setError(null);
    setLastResult(null);

    try {
      const token = await getFreshToken();
      if (!token) {
        setError("Сесія закінчилась — оновіть сторінку");
        return;
      }

      const resp = await fetch(`${API_BASE_URL}/api/agents/${agentId}/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ site_id: selectedSiteId }),
      });

      const data = (await resp.json()) as AgentRunResult & { error?: string; message?: string };

      if (!resp.ok) {
        setError(data.error ?? "Не вдалося запустити агента");
        return;
      }

      setLastResult({
        agentId,
        result: { summary: data.message ?? data.summary ?? "", generated: data.generated, insights: data.insights, changes: data.changes },
      });

      await loadRuns(selectedSiteId);
    } catch (err) {
      console.error("[AgentsTab] run error:", err);
      setError("Мережева помилка — перевірте з'єднання");
    } finally {
      setRunningAgentId(null);
    }
  }

  if (sites.length === 0) {
    return (
      <div
        className="rounded-xl p-8 text-center"
        style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
      >
        <p className="text-sm text-[var(--text-secondary)]">
          Додайте сайт на моніторинг, щоб запускати агентів.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Site picker — спільний для всіх агентів */}
      <select
        value={selectedSiteId}
        onChange={(e) => setSelectedSiteId(e.target.value)}
        className="w-full text-sm rounded-lg px-3 py-2 bg-transparent outline-none"
        style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
      >
        {sites.map((s) => (
          <option key={s.id} value={s.id} style={{ background: "#0F1420" }}>
            {s.display_name}
          </option>
        ))}
      </select>

      {!agents && (
        <div className="flex justify-center py-6">
          <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      )}

      {/* Agent cards */}
      {agents?.map((agent) => (
        <div
          key={agent.id}
          className="rounded-xl p-5"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
              style={{ background: "rgba(214,255,63,0.08)", color: "var(--lime)" }}
            >
              <Bot size={16} />
            </span>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {agent.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                {agent.description}
              </p>
            </div>
            {agent.credit_cost_per_run > 0 && (
              <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-tertiary)" }}>
                {agent.credit_cost_per_run} credit
              </span>
            )}
          </div>

          <button
            onClick={() => runAgent(agent.id)}
            disabled={runningAgentId !== null || !selectedSiteId}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            {runningAgentId === agent.id ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
            Запустити
          </button>

          {lastResult?.agentId === agent.id && (
            <div
              className="mt-4 rounded-xl p-4 space-y-3"
              style={{ background: "rgba(214,255,63,0.04)", border: "1px solid rgba(214,255,63,0.15)" }}
            >
              <p className="text-sm font-medium" style={{ color: "var(--lime)" }}>
                {lastResult.result.summary}
              </p>

              {lastResult.result.generated?.map((item, i) => (
                <div key={i} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono" style={{ color: "var(--cyan)" }}>{KIND_LABELS[item.kind] ?? item.kind}</span>
                    <span className="text-xs truncate max-w-[50%]" style={{ color: "var(--text-tertiary)" }}>{item.page_url}</span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{item.output}</p>
                </div>
              ))}

              {lastResult.result.insights?.map((item, i) => (
                <div key={i} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-sm min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>{item.problem_summary}</p>
                  {item.estimated_monthly_loss_usd != null && (
                    <span className="text-xs font-mono shrink-0" style={{ color: "#F5675A" }}>${item.estimated_monthly_loss_usd.toFixed(0)}/міс</span>
                  )}
                </div>
              ))}

              {lastResult.result.changes?.map((item, i) => (
                <div key={i} className="rounded-lg p-3 flex items-center justify-between gap-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <p className="text-sm min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>{item.query}</p>
                  <span className="text-xs font-mono shrink-0" style={{ color: item.delta && item.delta > 0 ? "var(--lime)" : item.delta && item.delta < 0 ? "#F5675A" : "var(--text-tertiary)" }}>
                    {item.current != null ? `#${item.current.toFixed(1)}` : "—"}
                    {item.delta != null && item.delta !== 0 ? ` (${item.delta > 0 ? "+" : ""}${item.delta})` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{ background: "rgba(245,103,90,0.08)", border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A" }}
        >
          {error}
        </div>
      )}

      {/* Run history */}
      <div>
        <p className="text-xs font-medium uppercase mb-2" style={{ color: "var(--text-tertiary)", letterSpacing: "0.05em" }}>
          Історія запусків
        </p>

        {loadingRuns ? (
          <div className="flex justify-center py-6">
            <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : runs.length === 0 ? (
          <p className="text-sm text-center py-6" style={{ color: "var(--text-tertiary)" }}>
            Ще немає запусків для цього сайту
          </p>
        ) : (
          <div className="space-y-2">
            {runs.map((run) => (
              <div
                key={run.id}
                className="flex items-center gap-3 rounded-lg px-3.5 py-2.5"
                style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}
              >
                {run.status === "done" && <CheckCircle2 size={14} style={{ color: "var(--lime)" }} />}
                {run.status === "failed" && <XCircle size={14} style={{ color: "#F5675A" }} />}
                {run.status === "running" && <Clock size={14} style={{ color: "var(--cyan)" }} />}

                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate" style={{ color: "var(--text-secondary)" }}>
                    {run.summary ?? "Без опису"}
                  </p>
                </div>

                <span className="text-xs shrink-0" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(run.started_at).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
