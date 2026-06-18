import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Middleware запускается на каждый запрос перед рендерингом.
// Две задачи:
// 1. Обновить сессионные куки Supabase (они expire и нужно их refresh-ить)
// 2. Перенаправить неавторизованных пользователей с /dashboard/* на /login
//    и авторизованных с /login и /register на /dashboard

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Получаем текущего пользователя.
  // ВАЖНО: используем getUser() а не getSession() — getUser() делает
  // запрос к Supabase Auth серверу и гарантирует что токен валиден,
  // а не просто читает куки (которые можно подделать).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Незалогиненный пользователь → редирект с /dashboard на /login
  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Залогиненный пользователь → редирект с /login и /register на /dashboard
  if (user && (pathname === "/login" || pathname === "/register")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    // Запускаем middleware только для нужных маршрутов,
    // исключаем статические файлы и API
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
