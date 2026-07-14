"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Loader2, CheckCircle2, Circle, Sparkles, Send, Award, Lock } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_premium: boolean;
}

interface Lesson {
  id: string;
  title: string;
  slug: string;
  content: unknown;
  order_index: number;
  completed: boolean;
}

interface MentorMessage {
  role: "user" | "model";
  content: string;
}

interface Props {
  courseSlug: string;
  accessToken: string;
}

function renderLessonContent(content: unknown): React.ReactNode {
  // content jsonb — блоки довільного формату (roadmap: текст/відео/чек-лист).
  // MVP: підтримуємо { blocks: [{ type: 'text', text }, { type: 'video', url }, { type: 'checklist', items }] }
  if (!content || typeof content !== "object") return null;
  const blocks = (content as { blocks?: Array<{ type: string; text?: string; url?: string; items?: string[] }> }).blocks ?? [];

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === "text") return <p key={i} className="text-sm leading-relaxed whitespace-pre-wrap">{block.text}</p>;
        if (block.type === "video" && block.url) return (
          <a key={i} href={block.url} target="_blank" rel="noopener noreferrer" className="text-sm block" style={{ color: "var(--cyan)" }}>
            ▶ Переглянути відео
          </a>
        );
        if (block.type === "checklist" && block.items) return (
          <ul key={i} className="space-y-1">
            {block.items.map((item, j) => (
              <li key={j} className="text-sm flex items-start gap-2">
                <Circle size={12} className="mt-1 shrink-0" style={{ color: "var(--text-tertiary)" }} /> {item}
              </li>
            ))}
          </ul>
        );
        return null;
      })}
    </div>
  );
}

export function CourseDetailUI({ courseSlug, accessToken }: Props) {
  const [course, setCourse] = useState<Course | null>(null);
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [locked, setLocked] = useState(false);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [certificateIssued, setCertificateIssued] = useState(false);
  const [notFound, setNotFound] = useState(false);

  // ── AI-наставник ──
  const [showMentor, setShowMentor] = useState(false);
  const [mentorMessages, setMentorMessages] = useState<MentorMessage[]>([]);
  const [mentorInput, setMentorInput] = useState("");
  const [mentorLoading, setMentorLoading] = useState(false);

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const loadCourse = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/academy/courses/${courseSlug}`, { headers: authHeaders });
      if (!res.ok) { setNotFound(true); return; }
      const data = await res.json();
      setCourse(data.course);
      setLessons(data.lessons ?? []);
      setLocked(!!data.locked);
      if (data.lessons?.length && !activeLessonId) setActiveLessonId(data.lessons[0].id);
    } catch {
      setNotFound(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseSlug, accessToken]);

  useEffect(() => { loadCourse(); }, [loadCourse]);

  async function markLessonComplete(lessonId: string) {
    setMarking(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/academy/progress`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ lesson_id: lessonId }),
      });
      const data = await res.json();
      if (data.certificate_issued) setCertificateIssued(true);
      await loadCourse();
    } finally {
      setMarking(false);
    }
  }

  async function sendMentorMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!mentorInput.trim()) return;
    const newMessages: MentorMessage[] = [...mentorMessages, { role: "user", content: mentorInput.trim() }];
    setMentorMessages(newMessages);
    setMentorInput("");
    setMentorLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/academy/mentor`, {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ messages: newMessages }),
      });
      const data = await res.json();
      if (data.reply) setMentorMessages([...newMessages, { role: "model", content: data.reply }]);
    } finally {
      setMentorLoading(false);
    }
  }

  if (notFound) {
    return <div className="glow-card p-10 text-center"><p className="text-sm text-[var(--text-secondary)]">Курс не знайдено.</p></div>;
  }

  if (!course || lessons === null) {
    return <div className="glow-card p-10 text-center"><Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} /></div>;
  }

  const activeLesson = lessons.find(l => l.id === activeLessonId) ?? lessons[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold mb-1">{course.title}</h1>
        {course.description && <p className="text-sm text-[var(--text-secondary)]">{course.description}</p>}
      </div>

      {certificateIssued && (
        <div className="glow-card p-4 flex items-center gap-2" style={{ border: "1px solid rgba(140,246,255,0.3)" }}>
          <Award size={18} style={{ color: "var(--cyan)" }} />
          <span className="text-sm">Вітаємо! Курс пройдено, сертифікат видано.</span>
        </div>
      )}

      {locked ? (
        <div className="glow-card p-8 text-center space-y-3">
          <Lock size={24} className="mx-auto" style={{ color: "var(--text-tertiary)" }} />
          <p className="text-sm text-[var(--text-secondary)]">
            Цей курс доступний на тарифі Growth і вище.
          </p>
          <Link href="/dashboard/upgrade" className="glow-button text-sm !py-2 !px-4 inline-flex">
            Переглянути тарифи
          </Link>
        </div>
      ) : (
      <>
      <div className="grid gap-4 sm:grid-cols-[220px_1fr]">
        <div className="space-y-1">
          {lessons.map(lesson => (
            <button
              key={lesson.id}
              onClick={() => setActiveLessonId(lesson.id)}
              className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors"
              style={{
                background: activeLessonId === lesson.id ? "rgba(140,246,255,0.08)" : "transparent",
                color: activeLessonId === lesson.id ? "var(--cyan)" : "var(--text-secondary)",
              }}
            >
              {lesson.completed ? <CheckCircle2 size={14} style={{ color: "var(--lime)" }} className="shrink-0" /> : <Circle size={14} className="shrink-0" style={{ color: "var(--text-tertiary)" }} />}
              <span className="truncate">{lesson.title}</span>
            </button>
          ))}
        </div>

        {activeLesson && (
          <div className="glow-card p-4 space-y-4">
            <h2 className="text-base font-semibold">{activeLesson.title}</h2>
            {renderLessonContent(activeLesson.content)}
            <button
              onClick={() => markLessonComplete(activeLesson.id)}
              disabled={activeLesson.completed || marking}
              className="glow-button text-sm !py-2 !px-4 flex items-center gap-1.5"
            >
              {marking ? <Loader2 size={14} className="animate-spin" /> : activeLesson.completed ? <><CheckCircle2 size={14} /> Пройдено</> : "Позначити пройденим"}
            </button>
          </div>
        )}
      </div>
      </>
      )}

      {/* ── AI-наставник ── */}
      <div className="glow-card p-4 space-y-3">
        <button onClick={() => setShowMentor(!showMentor)} className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--cyan)" }}>
          <Sparkles size={15} /> Запитати наставника
        </button>

        {showMentor && (
          <div className="space-y-3">
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {mentorMessages.map((m, i) => (
                <div key={i} className={`text-sm px-3 py-2 rounded-lg max-w-[85%] ${m.role === "user" ? "ml-auto" : ""}`} style={{ background: m.role === "user" ? "rgba(140,246,255,0.08)" : "rgba(255,255,255,0.03)" }}>
                  {m.content}
                </div>
              ))}
              {mentorLoading && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-tertiary)" }} />}
            </div>
            <form onSubmit={sendMentorMessage} className="flex items-center gap-2">
              <input
                value={mentorInput}
                onChange={e => setMentorInput(e.target.value)}
                placeholder="Запитайте про SEO чи платформу..."
                className="flex-1 rounded-lg px-3 py-2 text-sm"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-primary)" }}
              />
              <button type="submit" disabled={mentorLoading} className="glow-button !py-2 !px-3">
                <Send size={14} />
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
