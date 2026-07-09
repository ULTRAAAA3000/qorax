import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { AppsGrid } from "./AppsGrid";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Grid2x2 } from "lucide-react";

export const metadata = { title: "Усі додатки — Qorax" };

// /dashboard/apps — DESIGN_SYSTEM.md, розділ "Apps": повна сітка карток
// усіх продуктів платформи (не тільки скорочений список у сайдбарі).
// Джерело даних те саме, що для PlatformSidebar — platform_modules
// + organization_module_access (getPlatformModules), тому статус
// live/coming_soon завжди узгоджений між сайдбаром і цією сторінкою.

export default async function AppsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const platformModules = await getPlatformModules(membership?.organization_id ?? null);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> До Dashboard
          </Link>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Grid2x2 size={20} style={{ color: "var(--cyan)" }} />
              <h1 className="font-display text-2xl font-semibold">Усі додатки</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Кожен інструмент Qorax — окремий модуль. Live-модулі відкриваються одразу, решта ще в розробці.
            </p>
          </div>

          <AppsGrid modules={platformModules} />
        </main>
      </div>
    </div>
  );
}
