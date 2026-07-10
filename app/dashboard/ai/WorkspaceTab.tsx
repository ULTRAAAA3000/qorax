"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Upload, FileText, FileSpreadsheet, Image as ImageIcon, File as FileIcon,
  Loader2, Trash2, X,
} from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface WorkspaceFile {
  id: string;
  file_name: string;
  file_type: "pdf" | "csv" | "docx" | "image";
  extracted_summary: string | null;
  created_at: string;
}

const FILE_ICONS: Record<WorkspaceFile["file_type"], typeof FileText> = {
  pdf: FileText,
  csv: FileSpreadsheet,
  docx: FileIcon,
  image: ImageIcon,
};

const ACCEPTED_TYPES = [
  "application/pdf",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
].join(",");

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

// Workspace — вкладка Qorax AI хаба (EXECUTION_PLAN.md, крок після
// Chat). Upload + авто-екстракція тексту + AI-сумаризація через
// Gemini (рішення Артема) для PDF/CSV/DOCX/зображень.
export function WorkspaceTab() {
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getFreshToken();
      if (!token) { setLoading(false); return; }

      const resp = await fetch(`${API_BASE_URL}/api/workspace/files`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) { setLoading(false); return; }

      const data = (await resp.json()) as { files: WorkspaceFile[] };
      setFiles(data.files ?? []);
    } catch (err) {
      console.error("[WorkspaceTab] failed to load files:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadFiles(); }, [loadFiles]);

  async function uploadFile(file: globalThis.File) {
    setError(null);
    setUploading(true);

    try {
      const token = await getFreshToken();
      if (!token) {
        setError("Сесія закінчилась — оновіть сторінку");
        return;
      }

      const formData = new FormData();
      formData.append("file", file);

      const resp = await fetch(`${API_BASE_URL}/api/workspace/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      const data = (await resp.json()) as { error?: string };

      if (!resp.ok) {
        setError(data.error ?? "Не вдалося завантажити файл");
        return;
      }

      await loadFiles();
    } catch (err) {
      console.error("[WorkspaceTab] upload error:", err);
      setError("Мережева помилка — перевірте з'єднання");
    } finally {
      setUploading(false);
    }
  }

  async function deleteFile(id: string) {
    const token = await getFreshToken();
    if (!token) return;

    // Оптимістично прибираємо з UI одразу
    setFiles((prev) => prev.filter((f) => f.id !== id));

    try {
      await fetch(`${API_BASE_URL}/api/workspace/files/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch (err) {
      console.error("[WorkspaceTab] delete error:", err);
      await loadFiles(); // якщо не вдалось — повертаємо реальний стан
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = ""; // дозволяє завантажити той самий файл повторно
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  return (
    <div className="space-y-5">
      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="rounded-xl p-8 text-center cursor-pointer transition-colors"
        style={{
          background: dragOver ? "rgba(214,255,63,0.06)" : "rgba(255,255,255,0.02)",
          border: `1px dashed ${dragOver ? "var(--lime)" : "rgba(255,255,255,0.12)"}`,
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          onChange={handleFileInputChange}
          className="hidden"
        />

        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 size={22} className="animate-spin" style={{ color: "var(--lime)" }} />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Завантажуємо і аналізуємо файл...
            </p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload size={22} style={{ color: "var(--text-tertiary)" }} />
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Перетягніть файл сюди або натисніть, щоб обрати
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              PDF, CSV, DOCX, PNG/JPEG/WebP — до 5 МБ
            </p>
          </div>
        )}
      </div>

      {error && (
        <div
          className="rounded-xl px-4 py-3 text-sm flex items-center justify-between gap-3"
          style={{
            background: "rgba(245,103,90,0.08)",
            border: "1px solid rgba(245,103,90,0.2)",
            color: "#F5675A",
          }}
        >
          <span>{error}</span>
          <button onClick={() => setError(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Files list */}
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 size={18} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />
        </div>
      ) : files.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>
          Ще немає завантажених файлів
        </p>
      ) : (
        <div className="space-y-2.5">
          {files.map((file) => {
            const Icon = FILE_ICONS[file.file_type];
            return (
              <div
                key={file.id}
                className="rounded-xl p-4 flex gap-3"
                style={{ background: "var(--bg-card)", border: "1px solid var(--border-hairline)" }}
              >
                <span
                  className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0"
                  style={{ background: "rgba(255,255,255,0.04)", color: "var(--text-tertiary)" }}
                >
                  <Icon size={16} />
                </span>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                      {file.file_name}
                    </p>
                    <button
                      onClick={() => deleteFile(file.id)}
                      className="shrink-0 p-1 rounded-lg hover:opacity-60 transition-opacity"
                    >
                      <Trash2 size={13} style={{ color: "var(--text-tertiary)" }} />
                    </button>
                  </div>
                  <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                    {file.extracted_summary ?? "Аналіз недоступний"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
