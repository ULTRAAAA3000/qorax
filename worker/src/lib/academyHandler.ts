// ============================================================
// academyHandler.ts — Academy-модуль (MODULE_ROADMAP.md розділ 10;
// EXECUTION_PLAN.md Фаза 2.5).
//
// На відміну від crmHandler.ts/socialHandler.ts, курси й уроки —
// профіль-рівня доступ (не organization-рівня): requireOrgAccess()
// тут НЕ підходить, бо каталог курсів не належить organization.
// Замість цього — простіша перевірка "auth.uid() існує" (JWT валідний),
// сама фільтрація вже на рівні RLS-політик з 0046_academy_module.sql.
//
// AI-наставник переюзовує Gemini fetch-патерн з chatHandler.ts (retry
// на 429/503, timeout), але НЕ сам handleChatRequest — той жорстко
// прив'язаний до site_id і Growth+ плану з зовсім іншим system-prompt
// (метрики конкретного сайту). Тут — окремий system-prompt "наставник
// по SEO/платформі", контекст з academy_progress, без site_id.
// ============================================================

import type { Env } from "../types";
import { selectRows, insertRow } from "./supabase";
import { json } from "./httpUtils";

// ── Аутентифікація: тільки перевірка валідного JWT, без org-контексту ──
// (каталог курсів не organization-рівня — RLS сама відфільтрує
// premium/progress по profile_id = auth.uid())

async function requireAuthenticatedUser(request: Request, env: Env): Promise<{ ok: true; userId: string } | { ok: false; status: number }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401 };

  const resp = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!resp.ok) return { ok: false, status: 401 };
  const data = (await resp.json()) as { id?: string };
  if (!data.id) return { ok: false, status: 401 };
  return { ok: true, userId: data.id };
}

interface CourseRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  is_premium: boolean;
  order_index: number;
}

interface LessonRow {
  id: string;
  course_id: string;
  title: string;
  slug: string;
  content: unknown;
  order_index: number;
}

// ── GET /api/academy/courses ── каталог + прогрес юзера (кількість пройдених уроків на курс)

export async function handleAcademyCoursesList(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const access = await requireAuthenticatedUser(request, env);
  if (!access.ok) return json({ error: "Unauthorized" }, access.status, corsHeaders);

  const coursesRes = await selectRows<CourseRow>(
    "academy_courses",
    `select=id,title,slug,description,is_premium,order_index&order=order_index.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  if (!coursesRes.ok) return json({ error: coursesRes.error }, 500, corsHeaders);

  const lessonsRes = await selectRows<{ id: string; course_id: string }>(
    "academy_lessons",
    `select=id,course_id`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const progressRes = await selectRows<{ lesson_id: string }>(
    "academy_progress",
    `select=lesson_id&profile_id=eq.${access.userId}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const completedLessonIds = new Set((progressRes.data ?? []).map(p => p.lesson_id));
  const lessonsByCourse = new Map<string, number>();
  const completedByCourse = new Map<string, number>();
  for (const lesson of lessonsRes.data ?? []) {
    lessonsByCourse.set(lesson.course_id, (lessonsByCourse.get(lesson.course_id) ?? 0) + 1);
    if (completedLessonIds.has(lesson.id)) {
      completedByCourse.set(lesson.course_id, (completedByCourse.get(lesson.course_id) ?? 0) + 1);
    }
  }

  const courses = (coursesRes.data ?? []).map(c => ({
    ...c,
    lessons_total: lessonsByCourse.get(c.id) ?? 0,
    lessons_completed: completedByCourse.get(c.id) ?? 0,
  }));

  return json({ courses }, 200, corsHeaders);
}

// ── GET /api/academy/courses/:slug ── деталі курсу з уроками

export async function handleAcademyCourseDetail(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>,
  courseSlug: string
): Promise<Response> {
  const access = await requireAuthenticatedUser(request, env);
  if (!access.ok) return json({ error: "Unauthorized" }, access.status, corsHeaders);

  const courseRes = await selectRows<CourseRow>(
    "academy_courses",
    `select=id,title,slug,description,is_premium,order_index&slug=eq.${encodeURIComponent(courseSlug)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const course = courseRes.data?.[0];
  if (!course) return json({ error: "Курс не знайдено" }, 404, corsHeaders);

  const lessonsRes = await selectRows<LessonRow>(
    "academy_lessons",
    `select=id,course_id,title,slug,content,order_index&course_id=eq.${course.id}&order=order_index.asc`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const progressRes = await selectRows<{ lesson_id: string }>(
    "academy_progress",
    `select=lesson_id&profile_id=eq.${access.userId}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const completedLessonIds = new Set((progressRes.data ?? []).map(p => p.lesson_id));

  const lessons = (lessonsRes.data ?? []).map(l => ({ ...l, completed: completedLessonIds.has(l.id) }));

  return json({ course, lessons }, 200, corsHeaders);
}

// ── POST /api/academy/progress ── body: { lesson_id } — позначити урок пройденим,
// автоматично видає сертифікат якщо це останній урок курсу (roadmap Крок 2 —
// перевірка в тому ж ендпоінті, без окремого cron)

export async function handleAcademyProgress(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const access = await requireAuthenticatedUser(request, env);
  if (!access.ok) return json({ error: "Unauthorized" }, access.status, corsHeaders);

  let body: { lesson_id?: string; organization_id?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const lessonId = body.lesson_id;
  if (!lessonId) return json({ error: "lesson_id обов'язковий" }, 400, corsHeaders);

  const lessonRes = await selectRows<{ id: string; course_id: string }>(
    "academy_lessons",
    `select=id,course_id&id=eq.${encodeURIComponent(lessonId)}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const lesson = lessonRes.data?.[0];
  if (!lesson) return json({ error: "Урок не знайдено" }, 404, corsHeaders);

  // organization_id зберігається в academy_progress для RLS-фільтрації
  // (0046 коментар) — беремо першу організацію користувача, той самий
  // компроміс, що для профілю без активного org-контексту в цьому запиті
  let organizationId = body.organization_id;
  if (!organizationId) {
    const memberRes = await selectRows<{ organization_id: string }>(
      "organization_members",
      `select=organization_id&user_id=eq.${access.userId}&limit=1`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    organizationId = memberRes.data?.[0]?.organization_id;
  }
  if (!organizationId) return json({ error: "Не знайдено організацію користувача" }, 400, corsHeaders);

  const insertRes = await insertRow(
    "academy_progress",
    { organization_id: organizationId, profile_id: access.userId, lesson_id: lessonId },
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  // unique(profile_id, lesson_id) — повторне позначення того самого уроку
  // не помилка, а no-op (курс міг бути вже пройдений раніше)
  if (!insertRes.ok && !insertRes.error?.includes("duplicate")) {
    return json({ error: insertRes.error }, 500, corsHeaders);
  }

  // Перевіряємо чи це останній урок курсу → видаємо сертифікат
  const allLessonsRes = await selectRows<{ id: string }>(
    "academy_lessons",
    `select=id&course_id=eq.${lesson.course_id}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const allLessonIds = (allLessonsRes.data ?? []).map(l => l.id);

  const progressRes = await selectRows<{ lesson_id: string }>(
    "academy_progress",
    `select=lesson_id&profile_id=eq.${access.userId}&lesson_id=in.(${allLessonIds.join(",")})`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const completedCount = progressRes.data?.length ?? 0;

  let certificateIssued = false;
  if (allLessonIds.length > 0 && completedCount === allLessonIds.length) {
    const certRes = await insertRow(
      "academy_certificates",
      { profile_id: access.userId, course_id: lesson.course_id },
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    // unique(profile_id, course_id) — сертифікат вже виданий раніше, не помилка
    certificateIssued = certRes.ok;
  }

  return json({ ok: true, certificate_issued: certificateIssued }, 200, corsHeaders);
}

// ── POST /api/academy/mentor ── body: { messages: [{role, content}] } — AI-наставник
// Той самий Gemini fetch-патерн (retry, timeout), що chatHandler.ts, АЛЕ окремий
// system-prompt без site_id — загальний наставник по SEO й платформі Qorax.

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
const GEMINI_TIMEOUT_MS = 20_000;
const MAX_HISTORY_MESSAGES = 10;

interface MentorMessage { role: "user" | "model"; content: string }

function buildMentorSystemPrompt(completedLessonTitles: string[]): string {
  const progressLine = completedLessonTitles.length > 0
    ? `Користувач вже пройшов уроки: ${completedLessonTitles.join(", ")}.`
    : "Користувач ще не почав жоден курс.";

  return `Ти — наставник Academy платформи Qorax. Допомагаєш користувачам розібратись у SEO, технічному моніторингу сайтів і роботі з платформою Qorax.

${progressLine}

ТВІЙ СТИЛЬ:
- Відповідай коротко і по суті (2-5 речень, якщо не просять більше)
- Говори простою мовою, без зайвого жаргону
- Якщо питання виходить за межі SEO/Qorax — чесно скажи, що це не твоя область
- Мова відповідей: завжди українська

ЗАБОРОНЕНО:
- Вигадувати факти про SEO чи платформу
- Нагадувати що ти AI`;
}

export async function handleAcademyMentor(
  request: Request,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const access = await requireAuthenticatedUser(request, env);
  if (!access.ok) return json({ error: "Unauthorized" }, access.status, corsHeaders);

  let body: { messages?: MentorMessage[] };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, corsHeaders);
  }

  const messages = body.messages?.slice(-MAX_HISTORY_MESSAGES);
  if (!messages?.length) return json({ error: "messages обов'язкові" }, 400, corsHeaders);

  const progressRes = await selectRows<{ lesson_id: string }>(
    "academy_progress",
    `select=lesson_id&profile_id=eq.${access.userId}`,
    env.SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );
  const lessonIds = (progressRes.data ?? []).map(p => p.lesson_id);
  let completedTitles: string[] = [];
  if (lessonIds.length > 0) {
    const titlesRes = await selectRows<{ title: string }>(
      "academy_lessons",
      `select=title&id=in.(${lessonIds.join(",")})`,
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY
    );
    completedTitles = (titlesRes.data ?? []).map(l => l.title);
  }

  const systemPrompt = buildMentorSystemPrompt(completedTitles);
  const geminiBody = {
    contents: [
      { role: "user", parts: [{ text: systemPrompt }] },
      { role: "model", parts: [{ text: "Зрозуміло, я готовий допомогти." }] },
      ...messages.map(m => ({ role: m.role, parts: [{ text: m.content }] })),
    ],
    generationConfig: { temperature: 0.6, maxOutputTokens: 1200 },
  };

  const apiKey = env.GEMINI_CHAT_API_KEY ?? env.GEMINI_API_KEY;
  if (!apiKey) return json({ error: "AI не налаштований — зверніться до адміністратора" }, 503, corsHeaders);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    let resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify(geminiBody),
    });
    clearTimeout(timeout);

    if (resp.status === 429 || resp.status === 503) {
      await new Promise(r => setTimeout(r, resp.status === 503 ? 6000 : 4000));
      const controller2 = new AbortController();
      const timeout2 = setTimeout(() => controller2.abort(), GEMINI_TIMEOUT_MS);
      resp = await fetch(`${GEMINI_ENDPOINT}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller2.signal,
        body: JSON.stringify(geminiBody),
      });
      clearTimeout(timeout2);
    }

    if (!resp.ok) {
      console.error("[academy-mentor] Gemini error:", resp.status, (await resp.text()).slice(0, 300));
      return json({ error: resp.status === 429 ? "AI перевантажений — спробуйте через хвилину" : "AI тимчасово недоступний" }, 503, corsHeaders);
    }

    interface GeminiResponse { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> }
    const data = (await resp.json()) as GeminiResponse;
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";

    return json({ reply }, 200, corsHeaders);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") return json({ error: "AI не відповів вчасно, спробуйте ще раз" }, 504, corsHeaders);
    console.error("[academy-mentor] fetch error:", err);
    return json({ error: "Внутрішня помилка" }, 500, corsHeaders);
  }
}
