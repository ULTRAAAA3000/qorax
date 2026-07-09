"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Loader2, Lock, CheckCircle2, BookOpen } from "lucide-react";
import { API_BASE_URL } from "@/app/lib/config";

interface Course {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_premium: boolean;
  lessons_total: number;
  lessons_completed: number;
}

interface Props {
  accessToken: string;
}

export function AcademyCatalogUI({ accessToken }: Props) {
  const [courses, setCourses] = useState<Course[] | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/academy/courses`, { headers: { Authorization: `Bearer ${accessToken}` } })
      .then(res => res.json())
      .then(data => setCourses(data.courses ?? []))
      .catch(() => setCourses([]));
  }, [accessToken]);

  if (courses === null) {
    return (
      <div className="glow-card p-10 text-center">
        <Loader2 size={20} className="animate-spin mx-auto" style={{ color: "var(--text-tertiary)" }} />
      </div>
    );
  }

  if (courses.length === 0) {
    return (
      <div className="glow-card p-10 text-center">
        <p className="text-sm text-[var(--text-secondary)]">Курсів ще немає — незабаром з&apos;являться.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {courses.map(course => {
        const progressPct = course.lessons_total > 0 ? Math.round((course.lessons_completed / course.lessons_total) * 100) : 0;
        const isDone = course.lessons_total > 0 && course.lessons_completed === course.lessons_total;

        return (
          <Link key={course.id} href={`/dashboard/academy/${course.slug}`} className="glow-card p-4 space-y-3 hover:!border-[var(--cyan)] transition-colors block">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen size={16} style={{ color: "var(--cyan)" }} />
                <h3 className="text-sm font-semibold">{course.title}</h3>
              </div>
              {course.is_premium && <Lock size={13} style={{ color: "var(--text-tertiary)" }} />}
              {isDone && <CheckCircle2 size={16} style={{ color: "var(--lime)" }} />}
            </div>
            {course.description && <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{course.description}</p>}
            <div className="space-y-1">
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: "var(--cyan)" }} />
              </div>
              <p className="text-xs text-[var(--text-tertiary)]">{course.lessons_completed}/{course.lessons_total} уроків</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
