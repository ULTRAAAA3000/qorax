import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Клієнт з service role key — обходить RLS.
// Використовувати ТІЛЬКИ в серверному коді адмін-сторінок,
// де вже перевірена роль platform_role === "admin".
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  // Fallback до anon key якщо service role не заданий
  // (щоб не ламати білд, але адмін отримає порожній список)
  if (!key) {
    console.warn("[service.ts] SUPABASE_SERVICE_ROLE_KEY not set — falling back to anon key");
    return createSupabaseClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }

  return createSupabaseClient(url, key, {
    auth: { persistSession: false },
  });
}
