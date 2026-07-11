"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, Plus, Trash2, CheckCircle2, XCircle, Clock, Circle, X } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Task {
  id: string;
  agent_id: string | null;
  description: string;
  status: "pending" | "in_progress" | "done" | "failed";
  agent_run_id: string | null;
  created_at: string;
}

type StatusFilter = "all" | Task["status"];

const STATUS_CONFIG: Record<Task["status"], { label: string; icon: typeof Circle; color: string }> = {
  pending: { label: "Очікує", icon: Circle, color: "var(--text-tertiary)" },
  in_progress: { label: "Виконується", icon: Clock, color: "var(--cyan)" },
  done: { label: "Готово", icon: CheckCircle2, color: "var(--lime)" },
  failed: { label: "Помилка", icon: XCircle, color: "#F5675A" },
};

const FILTERS: Array<{ id: StatusFilter; label: string }> = [
  { id: "all", label: "Усі" },
  { id: "pending", label: "Очікують" },
  { id: "in_progress", label: "Виконуються" },
  { id: "done", label: "Готові" },
  { id: "failed", label: "Помилки" },
];

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

// Tasks — вкладка Qorax AI хаба (EXECUTION_PLAN.md, шостий крок
// хвилі 3). MODULE_ROADMAP.md: "список ai_tasks з фільтром за
// статусом" — навмисно проста реалізація. Задачі бувають ручні
// (створені тут) і агентські (agent_id заповнений — створюються
// автоматично при запуску Content-агента, taskHandler.ts
// createAgentTask/finishAgentTask).
export function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [newTaskText, setNewTaskText] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (statusFilter: StatusFilter) => {
    setLoading(true);
    try {
      const token = await getFreshToken();
      if (!token) { setLoading(false); return; }

      const query = statusFilter === "all" ? "" : `?status=${statusFilter}`;
      const resp = await fetch(`${API_BASE_URL}/api/tasks${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { setLoading(false); return; }

      const data = (await resp.json()) as { tasks: Task[] };
      setTasks(data.tasks ?? []);
    } catch (err) {
      console.error("[TasksTab] failed to load:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  async function createTask() {
    const description = newTaskText.trim();
    if (!description || creating) return;
    setCreating(true);
    setError(null);

    try {
      const token = await getFreshToken();
      if (!token) {
        setError("Сесія закінчилась — оновіть сторінку");
        return;
      }

      const resp = await fetch(`${API_BASE_URL}/api/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description }),
      });

      const data = (await resp.json()) as { error?: string };
      if (!resp.ok) {
        setError(data.error ?? "Не вдалося створити задачу");
        return;
      }

      setNewTaskText("");
      await load(filter);
    } catch (err) {
      console.error("[TasksTab] create error:", err);
      setError("Мережева помилка — перевірте з'єднання");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(taskId: string, status: Task["status"]) {
    // Оптимістично оновлюємо UI одразу
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));

    try {
      const token = await getFreshToken();
      if (!token) return;

      await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
    } catch (err) {
      console.error("[TasksTab] update status error:", err);
      await load(filter); // якщо не вдалось — повертаємо реальний стан
    }
  }

  async function deleteTask(taskId: string) {
    setTasks((prev) => prev.filter((t) => t.id !== taskId));

    try {
      const token = await getFreshToken();
      if (!token) return;

      await fetch(`${API_BASE_URL}/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("[TasksTab] delete error:", err);
      await load(filter);
    }
  }

  return (
    <div className="space-y-5">
      {/* New task input */}
      <div className="flex gap-2">
        <input
          value={newTaskText}
          onChange={(e) => setNewTaskText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createTask(); } }}
          placeholder="Додати нову задачу..."
          className="flex-1 min-w-0 text-sm rounded-lg px-3.5 py-2.5 bg-transparent outline-none placeholder:text-[var(--text-tertiary)]"
          style={{ border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
        />
        <button
          onClick={createTask}
          disabled={!newTaskText.trim() || creating}
          className="shrink-0 flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
          style={{ background: "var(--lime)", color: "#0c111d" }}
        >
          {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
        </button>
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
          style={{ background: "rgba(245,103,90,0.08)", border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A" }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-1.5 overflow-x-auto">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
            style={{
              background: filter === f.id ? "rgba(214,255,63,0.1)" : "rgba(255,255,255,0.03)",
              color: filter === f.id ? "var(--lime)" : "var(--text-secondary)",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tasks list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>
          Немає задач {filter !== "all" ? "з цим статусом" : ""}
        </p>
      ) : (
        <div className="space-y-2">
          {tasks.map((task) => {
            const config = STATUS_CONFIG[task.status];
            const StatusIcon = config.icon;

            return (
              <div
                key={task.id}
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}
              >
                <StatusIcon size={15} style={{ color: config.color }} className="shrink-0" />

                <div className="flex-1 min-w-0">
                  <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                    {task.description}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.agent_id && (
                      <span className="text-xs font-mono" style={{ color: "var(--cyan)" }}>
                        агент: {task.agent_id}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      {new Date(task.created_at).toLocaleDateString("uk-UA", { day: "numeric", month: "short" })}
                    </span>
                  </div>
                </div>

                {/* Ручна зміна статусу — лише для задач без agent_id
                    (агентські задачі змінюються тільки самим агентом) */}
                {!task.agent_id && task.status !== "done" && (
                  <button
                    onClick={() => updateStatus(task.id, "done")}
                    className="shrink-0 text-xs px-2.5 py-1.5 rounded-lg transition-opacity hover:opacity-80"
                    style={{ background: "rgba(214,255,63,0.08)", color: "var(--lime)" }}
                  >
                    Готово
                  </button>
                )}

                <button
                  onClick={() => deleteTask(task.id)}
                  className="shrink-0 p-1 rounded-lg hover:opacity-60 transition-opacity"
                >
                  <Trash2 size={13} style={{ color: "var(--text-tertiary)" }} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
