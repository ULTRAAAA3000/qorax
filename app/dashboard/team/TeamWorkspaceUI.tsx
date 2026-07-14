"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, X, Loader2, ChevronRight, Activity } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface TeamTask {
  id: string;
  title: string;
  description: string | null;
  status: string;
  assignee_id: string | null;
  due_date: string | null;
  created_at: string;
}

interface TeamMember {
  id: string;
  user_id: string;
  role: string;
  profiles: { full_name: string | null } | null;
}

interface ActivityItem {
  id: string;
  actor_id: string | null;
  actor_label: string | null;
  summary: string;
  created_at: string;
}

interface Props {
  organizationId: string;
  currentUserId: string;
}

// Той самий фікс, що вже застосований у Sites-конструкторі
// (ProjectEditorUI.tsx) — не кешувати заголовки одним об'єктом на
// весь час життя компонента, Supabase JWT живе ~1 годину.
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

const STAGES: { key: string; label: string }[] = [
  { key: "todo", label: "До виконання" },
  { key: "in_progress", label: "У роботі" },
  { key: "done", label: "Завершено" },
];

export function TeamWorkspaceUI({ organizationId }: Props) {
  const [tasks, setTasks] = useState<TeamTask[] | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [activity, setActivity] = useState<ActivityItem[] | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newAssigneeId, setNewAssigneeId] = useState("");
  const [creating, setCreating] = useState(false);

  async function getAuthHeaders(): Promise<Record<string, string>> {
    const token = await getFreshToken();
    return { Authorization: `Bearer ${token}` };
  }

  const loadTasks = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/team/tasks?organization_id=${organizationId}`, { headers });
      const data = await res.json();
      setTasks(data.tasks ?? []);
    } catch {
      setTasks([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const loadMembers = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/team`, { headers });
      const data = await res.json();
      setMembers(data.members ?? []);
    } catch {
      setMembers([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/team/activity?organization_id=${organizationId}`, { headers });
      const data = await res.json();
      setActivity(data.activity ?? []);
    } catch {
      setActivity([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  useEffect(() => {
    loadTasks();
    loadMembers();
    loadActivity();
  }, [loadTasks, loadMembers, loadActivity]);

  function memberName(userId: string | null): string {
    if (!userId) return "Не призначено";
    const member = members.find(m => m.user_id === userId);
    return member?.profiles?.full_name || "Учасник команди";
  }

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/team/tasks`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, title: newTitle.trim(), assignee_id: newAssigneeId || undefined }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewTitle("");
      setNewAssigneeId("");
      setShowNewTask(false);
      await Promise.all([loadTasks(), loadActivity()]);
    } finally {
      setCreating(false);
    }
  }

  async function moveTask(taskId: string, nextStatus: string) {
    setMovingTaskId(taskId);
    // Оптимістичне оновлення — не чекати мережу для миттєвого відгуку
    setTasks(prev => prev?.map(t => (t.id === taskId ? { ...t, status: nextStatus } : t)) ?? prev);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${API_BASE_URL}/api/team/tasks/${taskId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, status: nextStatus }),
      });
      if (!res.ok) { await loadTasks(); return; } // відкат при помилці
      if (nextStatus === "done") await loadActivity();
    } finally {
      setMovingTaskId(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 space-y-4">
        {error && (
          <div className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
            {error}
          </div>
        )}

        <div className="flex justify-end">
          {!showNewTask ? (
            <button onClick={() => setShowNewTask(true)} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
              <Plus size={14} /> Нова задача
            </button>
          ) : (
            <form onSubmit={createTask} className="flex flex-wrap items-center gap-2 justify-end">
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                placeholder="Назва задачі"
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
              />
              <select
                value={newAssigneeId}
                onChange={e => setNewAssigneeId(e.target.value)}
                className="rounded-lg px-3 py-2 text-sm"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
              >
                <option value="">Без виконавця</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>{m.profiles?.full_name || "Учасник команди"}</option>
                ))}
              </select>
              <button type="submit" disabled={creating} className="glow-button text-sm !py-2 !px-4">
                {creating ? <Loader2 size={14} className="animate-spin" /> : "Додати"}
              </button>
              <button type="button" onClick={() => setShowNewTask(false)} className="text-[var(--text-tertiary)]">
                <X size={16} />
              </button>
            </form>
          )}
        </div>

        {tasks === null ? (
          <div className="glow-card p-10 text-center">
            <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {STAGES.map((stage, stageIndex) => {
              const stageTasks = tasks.filter(t => t.status === stage.key);
              return (
                <div key={stage.key} className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{stage.label}</span>
                    <span className="text-xs text-[var(--text-tertiary)]">{stageTasks.length}</span>
                  </div>
                  <div className="space-y-2 min-h-[80px]">
                    {stageTasks.map(task => {
                      const nextStatus = STAGES[stageIndex + 1]?.key;
                      return (
                        <div key={task.id} className="glow-card p-3 space-y-2">
                          <p className="text-sm font-medium">{task.title}</p>
                          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{memberName(task.assignee_id)}</p>
                          {nextStatus && (
                            <button
                              onClick={() => moveTask(task.id, nextStatus)}
                              disabled={movingTaskId === task.id}
                              className="w-full flex items-center justify-center gap-1 text-xs py-1.5 rounded-lg transition-colors"
                              style={{ background: "rgba(255,255,255,0.03)", color: "var(--text-secondary)" }}
                            >
                              {movingTaskId === task.id ? <Loader2 size={12} className="animate-spin" /> : (<>Далі <ChevronRight size={12} /></>)}
                            </button>
                          )}
                        </div>
                      );
                    })}
                    {stageTasks.length === 0 && (
                      <div className="rounded-xl px-3 py-4 text-center" style={{ border: "1px dashed rgba(255,255,255,0.06)" }}>
                        <span className="text-xs text-[var(--text-tertiary)]">—</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <Activity size={14} style={{ color: "var(--text-tertiary)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Стрічка дій</span>
        </div>
        {activity === null ? (
          <div className="glow-card p-6 text-center">
            <Loader2 size={16} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
          </div>
        ) : activity.length === 0 ? (
          <div className="glow-card p-6 text-center">
            <p className="text-xs text-[var(--text-tertiary)]">Ще немає дій.</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {activity.map(item => (
              <div key={item.id} className="glow-card p-2.5">
                <p className="text-xs">
                  <span className="font-medium">{item.actor_label || memberName(item.actor_id)}</span>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>{item.summary}</span>
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {new Date(item.created_at).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
