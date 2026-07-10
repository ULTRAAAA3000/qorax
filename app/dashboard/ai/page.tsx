import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { PlatformSidebar } from "@/app/dashboard/PlatformSidebar";
import { getPlatformModules } from "@/app/lib/getPlatformModules";
import { QoraxAiHub } from "./QoraxAiHub";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, ArrowLeft } from "lucide-react";

export const metadata = { title: "Qorax AI — Qorax" };

// Каркас майбутнього Qorax AI-хаба (MODULE_ROADMAP.md "Третя хвиля",
// EXECUTION_PLAN.md: Chat вже перенесено окремою сесією на
// ai_chat_threads/messages, наступний крок — Workspace). Ключ
// platform_modules 'ai' звільнено від AiContentUI попередньою сесією
// (перенесено на /dashboard/content) саме для цього хаба.
//
// Рішення Артема: Workspace розміщується одразу тут як перша реально
// робоча вкладка табової навігації, а не окремим /dashboard/workspace
// — решта вкладок (Chat/Agents/Memory/Tasks/Automations) поки
// заглушки "Скоро", наповнюються окремими майбутніми сесіями.
export default async function QoraxAiPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();
  if (!membership) redirect("/dashboard");

  const platformModules = await getPlatformModules(membership.organization_id);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> До Audit
          </Link>
        </div>
      </header>

      <div className="flex" style={{ minHeight: "calc(100vh - 56px)" }}>
        <PlatformSidebar modules={platformModules} />

        <main className="flex-1 min-w-0 mx-auto max-w-5xl px-6 sm:px-8 py-8 space-y-6">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Sparkles size={20} style={{ color: "var(--lime)" }} />
              <h1 className="font-display text-2xl font-semibold">Qorax AI</h1>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Єдиний AI-хаб платформи: чат, агенти, файли, пам&apos;ять, задачі й автоматизації.
            </p>
          </div>

          <QoraxAiHub />
        </main>
      </div>
    </div>
  );
}
