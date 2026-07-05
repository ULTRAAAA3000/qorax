import { NextRequest, NextResponse } from "next/server";

/**
 * /r/:code — реферальне посилання партнера.
 *
 * Зберігає код у cookie на 30 днів (те саме вікно, що й атрибуція
 * комісії — після 30 днів код все одно вже не дасть комісії, тримати
 * cookie довше немає сенсу) і редіректить на реєстрацію.
 *
 * Валідність коду не перевіряється тут навмисно — зайвий похід у БД на
 * кожен клік не потрібен, оскільки handle_new_user() при реєстрації
 * просто не знайде організацію з невалідним кодом і атрибуція не
 * відбудеться. Гірше не стане, а зайвий DB round-trip на маркетинговому
 * посиланні, яке можуть розшарити тисячі разів, того не вартий.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const normalizedCode = code.toLowerCase().trim();

  const response = NextResponse.redirect(new URL("/register", request.url));

  if (normalizedCode) {
    response.cookies.set("qorax_ref", normalizedCode, {
      maxAge: 60 * 60 * 24 * 30, // 30 днів — вікно атрибуції
      path: "/",
      httpOnly: false, // читається на клієнті не потрібно, але не критично приховувати
      sameSite: "lax",
    });
  }

  return response;
}
