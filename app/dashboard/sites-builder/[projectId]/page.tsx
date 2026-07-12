import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import { ProjectEditorUI } from "./ProjectEditorUI";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

export const metadata = { title: "Редактор — Qorax Sites" };

export default async function ProjectEditorPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="sticky top-0 z-40" style={{ background: "rgba(10,10,10,0.8)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="mx-auto max-w-5xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-3">
            <QoraxLogo size="sm" />
          </Link>
          <Link href="/dashboard/sites-builder" className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            <ArrowLeft size={14} /> До Sites
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 sm:px-8 py-8">
        <ProjectEditorUI projectId={projectId} />
      </main>
    </div>
  );
}
