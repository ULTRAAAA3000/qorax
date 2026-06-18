import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Клиент для Server Components и Server Actions.
// Читает/пишет сессионные cookies через next/headers,
// что гарантирует корректную передачу сессии между запросами.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // setAll может бросить исключение в Server Components (read-only),
            // в этом случае просто игнорируем — middleware обновит куки.
          }
        },
      },
    }
  );
}
