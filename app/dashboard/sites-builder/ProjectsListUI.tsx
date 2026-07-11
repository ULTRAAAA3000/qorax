"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Plus, Loader2, Layout, ExternalLink, X, FileEdit, Globe } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Project {
  id: string;
  name: string;
  domain: string | null;
  status: string;
  created_at: string;
}

interface Template {
  id: string;
  name: string;
  description: string | null;
  preview_image_url: string | null;
  sort_order: number;
}

interface Props {
  organizationId: string;
  accessToken: string;
}

const STATUS_META: Record<string, { label: string; color: string; icon: typeof FileEdit }> = {
  draft: { label: "Чернетка", color: "var(--text-tertiary)", icon: FileEdit },
  published: { label: "Опубліковано", color: "var(--lime)", icon: Globe },
  archived: { label: "Архів", color: "var(--text-tertiary)", icon: FileEdit },
};

export function ProjectsListUI({ organizationId, accessToken }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [templates, setTemplates] = useState<Template[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [creating, setCreating] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects?organization_id=${organizationId}`, { headers: authHeaders });
      const data = await res.json();
      setProjects(data.projects ?? []);
    } catch {
      setProjects([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, accessToken]);

  const loadTemplates = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/project-templates`, { headers: authHeaders });
      const data = await res.json();
      setTemplates(data.templates ?? []);
    } catch {
      setTemplates([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  function openCreateModal() {
    setShowCreate(true);
    if (templates === null) loadTemplates();
  }

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/projects`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          organization_id: organizationId,
          name: newName.trim(),
          template_id: selectedTemplateId || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Помилка"); return; }
      setNewName("");
      setSelectedTemplateId("");
      setShowCreate(false);
      await loadProjects();
    } finally {
      setCreating(false);
    }
  }

  const inputStyle = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3" style={{ background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)", color: "#ff8080" }}>
          <span>{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Ваші проекти</h2>
        {!showCreate && (
          <button onClick={openCreateModal} className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5">
            <Plus size={14} /> Новий проект
          </button>
        )}
      </div>

      {showCreate && (
        <form onSubmit={createProject} className="glow-card p-4 space-y-4">
          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1.5">Назва проекту</label>
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="напр. 'Лендинг весняної акції'"
              className="w-full rounded-lg px-3 py-2 text-sm"
              style={inputStyle}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs text-[var(--text-tertiary)] block mb-1.5">Шаблон (необов&apos;язково)</label>
            {templates === null ? (
              <Loader2 size={16} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
            ) : (
              <div className="grid gap-2 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setSelectedTemplateId("")}
                  className="text-left p-3 rounded-lg text-xs transition-colors"
                  style={{
                    background: selectedTemplateId === "" ? "rgba(140,246,255,0.08)" : "rgba(255,255,255,0.02)",
                    border: selectedTemplateId === "" ? "1px solid var(--cyan)" : "1px solid rgba(255,255,255,0.06)",
                  }}
                >
                  <p className="font-medium mb-1">Порожній проект</p>
                  <p className="text-[var(--text-tertiary)]">Почати з нуля</p>
                </button>
                {templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setSelectedTemplateId(t.id)}
                    className="text-left p-3 rounded-lg text-xs transition-colors"
                    style={{
                      background: selectedTemplateId === t.id ? "rgba(140,246,255,0.08)" : "rgba(255,255,255,0.02)",
                      border: selectedTemplateId === t.id ? "1px solid var(--cyan)" : "1px solid rgba(255,255,255,0.06)",
                    }}
                  >
                    <p className="font-medium mb-1">{t.name}</p>
                    {t.description && <p className="text-[var(--text-tertiary)] line-clamp-2">{t.description}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button type="submit" disabled={creating || !newName.trim()} className="glow-button text-sm !py-2 !px-4">
              {creating ? <Loader2 size={14} className="animate-spin" /> : "Створити проект"}
            </button>
            <button type="button" onClick={() => setShowCreate(false)} className="text-sm text-[var(--text-tertiary)]">Скасувати</button>
          </div>
        </form>
      )}

      {projects === null ? (
        <div className="glow-card p-10 text-center">
          <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : projects.length === 0 ? (
        <div className="glow-card p-10 text-center">
          <Layout size={20} className="mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} />
          <p className="text-sm text-[var(--text-secondary)]">Ще немає проектів — створіть перший.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {projects.map(project => {
            const meta = STATUS_META[project.status] ?? STATUS_META.draft;
            const StatusIcon = meta.icon;
            return (
              <Link key={project.id} href={`/dashboard/sites-builder/${project.id}`} className="glow-card p-4 space-y-2 hover:!border-[var(--cyan)] transition-colors block">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold truncate">{project.name}</h3>
                  {project.status === "published" && (
                    <a
                      href={`/sites-builder/preview/${project.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="shrink-0"
                      style={{ color: "var(--cyan)" }}
                    >
                      <ExternalLink size={13} />
                    </a>
                  )}
                </div>
                <span className="flex items-center gap-1 text-xs" style={{ color: meta.color }}>
                  <StatusIcon size={12} /> {meta.label}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
