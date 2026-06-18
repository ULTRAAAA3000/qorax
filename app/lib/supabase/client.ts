import { createBrowserClient } from "@supabase/ssr";

// Клиент для использования в Client Components ("use client").
// Использует publishable (anon) ключ — это нормально, т.к. у нас
// настроен Row Level Security на всех таблицах.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
