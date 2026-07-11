"use client";

import { useState, useEffect, useCallback } from "react";
import { ListChecks, Loader2, Plus, Trash2, Clock, CheckCircle2, XCircle, PlayCircle, X } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Task {
  id: string;
  agent_id: string | null;
  description: string;
  status: string;
  agent_run_id: string | null;
  created_at: string;
}

type StatusFilter = "all" | "pending" | "in_progress" | "done" | "failed";

const STATUS_META: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Очікує", color: "var(--text-tertiary)", icon: Clock },
  in_progress: { label: "В роботі", color: "var(--cyan)", icon: PlayCircle },
  done: { label: "Готово", color: "var(--lime)", icon: CheckCircle2 },
  failed: { label: "Помилка", color: "#F5675A", icon: XCircle },
};

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

// Tasks — вкладка Qorax AI хаба (roadmap: "список ai_tasks з фільтром
// за статусом"). MVP — ручна черга: створити/переглянути/змінити
// статус/видалити. Автоматичне заповнення з агентів (agent_id/
// agent_run_id) підключиться пізніше через Automations — ці поля вже
// в схемі й показуються тут, якщо задача створена не вручну.
export function TasksTab() {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [error, setError] = useState<string | null>(null);

  const [showNewTask, setShowNewTask] = useState(false);
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);

  const loadTasks = useCallback(async (statusFilter: StatusFilter) => {
    try {
      const token = await getFreshToken();
      if (!token) return;

      const qs = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const resp = await fetch(`${API_BASE_URL}/api/tasks${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return;

      const data = (await resp.json()) as { tasks: Task[] };
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error("[TasksTab] failed to load tasks:", err);
    }
  }, []);

  useEffect(() => {
    loadTasks(filter);
  }, [filter, loadTasks]);

  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newDescription.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const token = await getFreshToken();
      if (!token) { setError("Сесія закінчилась — оновіть сторінку"); return; }

      const resp = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ description: newDescription.trim() }),
      });
      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) { setError(data.error ?? "Не вдалося створити задачу"); return; }

      setNewDescription("");
      setShowNewTask(false);
      await loadTasks(filter);
    } catch {
      setError("Мережева помилка — перевірте з'єднання");
    } finally {
      setCreating(false);
    }
  }

  async function changeStatus(taskId: string, status: string) {
    try {
      const token = await getFreshToken();
      if (!token) return;

      await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      await loadTasks(filter);
    } catch (err) {
      console.error("[TasksTab] status change error:", err);
    }
  }

  async function deleteTask(taskId: string) {
    if (!confirm("Видалити цю задачу?")) return;
    try {
      const token = await getFreshToken();
      if (!token) return;

      await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await loadTasks(filter);
    } catch (err) {
      console.error("[TasksTab] delete error:", err);
    }
  }

  const FILTERS: Array<{ id: StatusFilter; label: string }> = [
    { id: "all", label: "Усі" },
    { id: "pending", label: "Очікує" },
    { id: "in_progress", label: "В роботі" },
    { id: "done", label: "Готово" },
    { id: "failed", label: "Помилка" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1 overflow-x-auto">
          {FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className="px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors shrink-0"
              style={{
                background: filter === f.id ? "rgba(214,255,63,0.1)" : "transparent",
                color: filter === f.id ? "var(--lime)" : "var(--text-secondary)",
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {!showNewTask && (
          <button
            onClick={() => setShowNewTask(true)}
            className="flex items-center gap-1.5 shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            <Plus size={14} /> Нова задача
          </button>
        )}
      </div>

      {showNewTask && (
        <form onSubmit={createTask} className="rounded-xl p-4 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}>
          <textarea
            value={newDescription}
            onChange={e => setNewDescription(e.target.value)}
            placeholder="Опишіть задачу (напр. 'Написати статтю про переваги SEO для малого бізнесу')"
            rows={3}
            className="w-full rounded-lg px-3 py-2 text-sm resize-none bg-transparent outline-none"
            style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
            autoFocus
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              disabled={creating || !newDescription.trim()}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
              style={{ background: "var(--lime)", color: "#0c111d" }}
            >
              {creating ? <Loader2 size={14} className="animate-spin" /> : "Створити"}
            </button>
            <button type="button" onClick={() => setShowNewTask(false)} className="text-sm" style={{ color: "var(--text-tertiary)" }}>
              Скасувати
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3" style={{ background: "rgba(245,103,90,0.08)", border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {tasks === null ? (
        <div className="flex justify-center py-10">
          <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : tasks.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <ListChecks size={20} className="mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} />
          <p className="text-sm text-[var(--text-secondary)]">
            {filter === "all" ? "Ще немає задач — створіть першу." : "Немає задач з цим статусом."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {tasks.map(task => {
            const meta = STATUS_META[task.status] ?? STATUS_META.pending;
            const StatusIcon = meta.icon;
            return (
              <div key={task.id} className="rounded-xl p-3.5 space-y-2" style={{ background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}>
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm flex-1" style={{ color: "var(--text-primary)" }}>{task.description}</p>
                  <button onClick={() => deleteTask(task.id)} className="shrink-0 transition-colors" style={{ color: "var(--text-tertiary)" }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="flex items-center gap-1 text-xs" style={{ color: meta.color }}>
                    <StatusIcon size={12} /> {meta.label}
                  </span>
                  <div className="flex items-center gap-1">
                    {task.status !== "pending" && (
                      <button onClick={() => changeStatus(task.id, "pending")} className="text-xs px-2 py-1 rounded" style={{ color: "var(--text-tertiary)" }}>Очікує</button>
                    )}
                    {task.status !== "in_progress" && (
                      <button onClick={() => changeStatus(task.id, "in_progress")} className="text-xs px-2 py-1 rounded" style={{ color: "var(--cyan)" }}>В роботі</button>
                    )}
                    {task.status !== "done" && (
                      <button onClick={() => changeStatus(task.id, "done")} className="text-xs px-2 py-1 rounded" style={{ color: "var(--lime)" }}>Готово</button>
                    )}
                    {task.status !== "failed" && (
                      <button onClick={() => changeStatus(task.id, "failed")} className="text-xs px-2 py-1 rounded" style={{ color: "#F5675A" }}>Помилка</button>
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
