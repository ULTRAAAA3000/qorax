import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Lock } from "lucide-react";
import { createClient } from "@/app/lib/supabase/server";
import { getPlatformModules } from "@/app/lib/getPlatformModules";

/**
 * Catch-all для шляхів модулів платформи, які ще не мають власної сторінки
 * (наприклад /dashboard/sites-builder, /dashboard/ai, /dashboard/content...).
 * Джерело істини — таблиця platform_modules: якщо шлях відповідає відомому
 * модулю зі статусом coming_soon, показуємо консистентну заглушку замість
 * голого 404. Якщо шлях взагалі не відповідає жодному модулю — честний 404.
 *
 * Коли модуль реально будується, для нього створюється власна папка
 * (напр. app/dashboard/sites-builder/page.tsx), яка автоматично має
 * пріоритет над цим catch-all — прибирати нічого не потрібно.
 */
export default async function ModulePlaceholderPage({ params }: { params: Promise<{ module: string }> }) {
  const { module: moduleSlug } = await params;
  const href = `/dashboard/${moduleSlug}`;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const modules = await getPlatformModules(membership?.organization_id ?? null);
  const module_ = modules.find(m => m.href === href);

  // Шлях не відповідає жодному відомому модулю платформи — справжній 404
  if (!module_) notFound();

  // Якщо модуль раптом live (наприклад через organization_module_access
  // оверрайд для бета-тестера), а власної сторінки ще нема — теж чесний 404,
  // а не заглушка "в розробці"
  if (module_.status === "live") notFound();

  return (
    <main className="min-h-screen flex items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <div className="max-w-md text-center">
        <div
          className="mx-auto mb-6 h-14 w-14 rounded-2xl flex items-center justify-center"
          style={{ background: "rgba(140,246,255,0.06)", border: "1px solid rgba(140,246,255,0.15)" }}
        >
          <Lock size={22} style={{ color: "var(--cyan)" }} />
        </div>

        <h1 className="font-display text-2xl font-semibold mb-2">{module_.label} у розробці</h1>
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {module_.description ?? "Цей модуль платформи ще будується та з'явиться в дашборді, щойно буде готовий."}
        </p>

        <Link
          href="/dashboard"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
          style={{ background: "var(--lime)", color: "#0a0a0a" }}
        >
          <ArrowLeft size={15} />
          Повернутися до Audit
        </Link>
      </div>
    </main>
  );
}
