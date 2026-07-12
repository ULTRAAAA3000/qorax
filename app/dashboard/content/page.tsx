import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { AiContentUI } from "./AiContentUI";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, ArrowLeft } from "lucide-react";

export const metadata = { title: "AI Content — Qorax" };

// Перенесено з /dashboard/ai (EXECUTION_PLAN.md, розділ "Хвиля 3
// почата: Qorax AI — схема БД"): platform_modules з 0039_platform_
// foundation.sql з самого початку мала ключ 'content' саме під цю
// сторінку (генерація текстів), а ключ 'ai' — під майбутній
// повноцінний Qorax AI-хаб (0049_qorax_ai_hub.sql). Раніше цей код
// помилково жив на /dashboard/ai; тепер шлях відповідає задуму.
export default async function ContentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token ?? "";

  const [{ data: sites }, platformModules] = await Promise.all([
    supabase
      .from("sites")
      .select("id, url, display_name")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    getPlatformModules(membership.organization_id),
  ]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard/home" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> До Audit
          </Link>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-3xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Sparkles size={20} style={{ color: "var(--lime)" }} />
              <h1 className="font-display text-2xl font-semibold">AI Content</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Генерація заголовків, meta-описів, FAQ та вступних абзаців — під ваш бізнес.
            </p>
          </div>

          <AiContentUI accessToken={accessToken} sites={sites ?? []} />
        </main>
      </div>
    </div>
  );
}
