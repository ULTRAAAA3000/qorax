import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Локаль сторінки визначається шляхом (/en/... = англійська, все
  // решта — українська за замовчуванням). Записується в ЗАПИТ (не
  // просто в response) — інакше headers() у Server Component
  // (root layout.tsx) її не побачить, там читаються заголовки
  // вхідного запиту, а не вихідної відповіді. Next.js App Router має
  // лише ОДИН кореневий layout на весь застосунок (не можна мати два
  // різних <html> для /uk і /en без переписування всього дерева
  // маршрутів на [locale]-сегмент), тому обрано менш інвазивний
  // підхід через заголовок замість реструктуризації.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", pathname.startsWith("/en") ? "en" : "uk");
  const requestWithLocale = { headers: requestHeaders };

  let supabaseResponse = NextResponse.next({ request: requestWithLocale });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request: requestWithLocale });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
