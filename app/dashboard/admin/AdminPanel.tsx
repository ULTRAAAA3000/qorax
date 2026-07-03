"use client";

import { useState, useEffect } from "react";
import { Play, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

interface CronJob {
  id: string;
  label: string;
  description: string;
  endpoint: string;
  schedule: string;
  danger?: boolean;
}

const CRON_JOBS: CronJob[] = [
  {
    id: "uptime",
    label: "Uptime перевірка",
    description: "Перевіряє доступність всіх сайтів, оновлює SSL статус, відправляє алерти",
    endpoint: "/api/admin/run-uptime",
    schedule: "Кожні 5 хвилин",
  },
  {
    id: "speed",
    label: "Speed + PageSpeed + AI інсайти",
    description: "Запускає PageSpeed Insights (mobile + desktop), Core Web Vitals, генерує AI рекомендації",
    endpoint: "/api/admin/run-speed",
    schedule: "Щодня о 3:00",
  },
  {
    id: "seo",
    label: "SEO аудит",
    description: "Перевіряє meta теги, schema.org, sitemap.xml, robots.txt для всіх сайтів",
    endpoint: "/api/admin/run-seo",
    schedule: "Щодня о 3:00",
  },
  {
    id: "competitors",
    label: "Моніторинг конкурентів",
    description: "Знімає snapshot конкурентів, порівнює hash контенту, шле алерт при змінах",
    endpoint: "/api/admin/run-competitors",
    schedule: "Щодня о 3:00",
  },
  {
    id: "weekly-digest",
    label: "Weekly Digest Email",
    description: "Надсилає тижневий звіт всім активним клієнтам (uptime, швидкість, SEO)",
    endpoint: "/api/admin/run-weekly-digest",
    schedule: "Щопонеділка о 8:00 UTC",
  },
  {
    id: "url-speeds",
    label: "Multi-URL speed check",
    description: "Перевіряє швидкість усіх tracked URL (checkout, contact, тощо)",
    endpoint: "/api/admin/run-url-speeds",
    schedule: "Щодня о 3:00",
  },
  {
    id: "forms",
    label: "Перевірка форм",
    description: "Перевіряє наявність та стан форм на сайтах клієнтів",
    endpoint: "/api/admin/run-forms",
    schedule: "Щодня о 3:00",
  },
  {
    id: "broken-links",
    label: "Перевірка битих посилань",
    description: "Краулить сайти (до 100 посилань), перевіряє HEAD запитами, зберігає результат",
    endpoint: "/api/admin/run-broken-links",
    schedule: "Щонеділі о 4:30",
  },
  {
    id: "ssl-expiry",
    label: "SSL expiry алерти",
    description: "Відправляє email/Telegram при SSL < 30 днів і < 7 днів",
    endpoint: "/api/admin/run-ssl-expiry",
    schedule: "Кожні 5 хвилин (разом з uptime)",
  },
  {
    id: "expire-trials",
    label: "Expire trials",
    description: "Переводить протерміновані trial акаунти на free план",
    endpoint: "/api/admin/expire-trials",
    schedule: "Щодня о 5:00",
    danger: true,
  },
];

type JobStatus = "idle" | "loading" | "success" | "error";

export function AdminPanel() {
  const [adminToken, setAdminToken] = useState("");
  const [tokenSaved, setTokenSaved] = useState(false);
  const [jobStatuses, setJobStatuses] = useState<Record<string, JobStatus>>({});
  const [jobMessages, setJobMessages] = useState<Record<string, string>>({});

  // Завантажуємо токен з localStorage при монтуванні
  useEffect(() => {
    const saved = localStorage.getItem("qorax_admin_token");
    if (saved) setAdminToken(saved);
  }, []);

  function saveToken() {
    localStorage.setItem("qorax_admin_token", adminToken);
    setTokenSaved(true);
    setTimeout(() => setTokenSaved(false), 2000);
  }

  function getToken(): string {
    return adminToken || localStorage.getItem("qorax_admin_token") || "";
  }

  async function runJob(job: CronJob) {
    const token = getToken();
    if (!token) {
      setJobMessages(prev => ({ ...prev, [job.id]: "Введіть ADMIN_TOKEN спочатку" }));
      setJobStatuses(prev => ({ ...prev, [job.id]: "error" }));
      return;
    }

    setJobStatuses(prev => ({ ...prev, [job.id]: "loading" }));
    setJobMessages(prev => ({ ...prev, [job.id]: "" }));

    try {
      const resp = await fetch(`${API_URL}${job.endpoint}`, {
        method: "POST",
        headers: { "x-admin-token": token },
      });
      const data = await resp.json() as { ok?: boolean; message?: string; error?: string };

      if (resp.ok && data.ok) {
        setJobStatuses(prev => ({ ...prev, [job.id]: "success" }));
        setJobMessages(prev => ({ ...prev, [job.id]: data.message ?? "Запущено" }));
        setTimeout(() => setJobStatuses(prev => ({ ...prev, [job.id]: "idle" })), 5000);
      } else {
        setJobStatuses(prev => ({ ...prev, [job.id]: "error" }));
        setJobMessages(prev => ({ ...prev, [job.id]: data.error ?? "Помилка" }));
      }
    } catch (e) {
      setJobStatuses(prev => ({ ...prev, [job.id]: "error" }));
      setJobMessages(prev => ({ ...prev, [job.id]: "Мережева помилка" }));
    }
  }

  return (
    <div className="space-y-4">
      {/* Admin token input */}
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
          ADMIN_TOKEN
        </h2>
        <div className="flex gap-2">
          <input
            type="password"
            value={adminToken}
            onChange={e => setAdminToken(e.target.value)}
            placeholder="Вставте ADMIN_TOKEN з Cloudflare secrets"
            className="flex-1 text-sm font-mono px-3 py-2 rounded-xl outline-none"
            style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }}
            onFocus={e => e.target.style.borderColor = "var(--lime)"}
            onBlur={e => e.target.style.borderColor = "var(--border-hairline)"}
            onKeyDown={e => e.key === "Enter" && saveToken()}
          />
          <button
            onClick={saveToken}
            className="text-sm font-medium px-4 py-2 rounded-xl transition-opacity hover:opacity-80"
            style={{ background: "var(--lime)", color: "#0C111D" }}
          >
            {tokenSaved ? "✓" : "Зберегти"}
          </button>
        </div>
        <p className="text-xs text-[var(--text-tertiary)] mt-2">
          Токен зберігається тільки в localStorage цього браузера, не передається на сервер крім запитів до API.
        </p>
      </div>

      {/* Cron jobs */}
      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-5">
        <h2 className="text-sm font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-4">
          Ручний запуск задач
        </h2>
        <div className="space-y-2">
          {CRON_JOBS.map(job => {
            const status = jobStatuses[job.id] ?? "idle";
            const message = jobMessages[job.id] ?? "";
            return (
              <div key={job.id}
                className="flex items-center justify-between gap-4 py-3 px-4 rounded-xl"
                style={{ background: "var(--bg)", border: `1px solid ${job.danger ? "rgba(245,103,90,0.2)" : "var(--border-hairline)"}` }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-medium">{job.label}</p>
                    <span className="text-xs text-[var(--text-tertiary)] font-mono">{job.schedule}</span>
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)]">{job.description}</p>
                  {message && (
                    <p className="text-xs mt-1 font-mono"
                      style={{ color: status === "success" ? "var(--lime)" : "#F5675A" }}>
                      {message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => runJob(job)}
                  disabled={status === "loading"}
                  className="shrink-0 flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-opacity hover:opacity-80 disabled:opacity-50"
                  style={{
                    background: status === "success" ? "rgba(214,255,63,0.1)" :
                                status === "error" ? "rgba(245,103,90,0.1)" :
                                job.danger ? "rgba(245,103,90,0.15)" : "rgba(255,255,255,0.06)",
                    border: `1px solid ${status === "success" ? "rgba(214,255,63,0.3)" :
                                         status === "error" ? "rgba(245,103,90,0.3)" :
                                         job.danger ? "rgba(245,103,90,0.3)" : "var(--border-hairline)"}`,
                    color: status === "success" ? "var(--lime)" :
                           status === "error" ? "#F5675A" :
                           job.danger ? "#F5675A" : "var(--text-primary)",
                  }}
                >
                  {status === "loading" ? <Loader2 size={12} className="animate-spin" /> :
                   status === "success" ? <CheckCircle size={12} /> :
                   status === "error" ? <AlertCircle size={12} /> :
                   <Play size={12} />}
                  {status === "loading" ? "Запуск..." : "Запустити"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Logs note */}
      <div className="rounded-xl px-4 py-3 text-xs text-[var(--text-tertiary)]"
        style={{ background: "var(--bg)", border: "1px solid var(--border-hairline)" }}>
        Всі задачі запускаються у фоні (background worker). Результат дивись у{" "}
        <a href="https://dash.cloudflare.com" target="_blank" rel="noopener noreferrer"
          className="underline hover:text-[var(--text-primary)] transition-colors">
          Cloudflare → Workers → qorax-api → Observability → Logs
        </a>
      </div>
    </div>
  );
}
