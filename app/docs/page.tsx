import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";
import { DocsContent, DocsCta } from "./DocsContent";

export const metadata = { title: "Документація — Qorax" };

export default async function DocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen" style={{ background: "var(--bg)" }}>
      <MarketingHeader isLoggedIn={!!user} activePath="/docs" />

      {/* Hero */}
      <section className="mx-auto max-w-6xl px-6 sm:px-8 pt-16 sm:pt-24 pb-10 sm:pb-14 w-full">
        <Reveal>
          <span
            className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-6"
            style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.08)",
              color: "var(--text-tertiary)",
            }}
          >
            ✦ ДОКУМЕНТАЦІЯ
          </span>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-tight max-w-2xl">
            Відповіді на{" "}
            <span className="gradient-text">всі питання</span>
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 text-[var(--text-secondary)] max-w-md leading-relaxed">
            Все, що потрібно знати про модуль Audit — моніторинг, SEO та AI-аналіз, який вже працює.
            Документацію інших модулів платформи додамо по мірі їх запуску.
          </p>
        </Reveal>
      </section>

      <div className="gradient-divider" />

      <DocsContent />
      <DocsCta />

      <SiteFooterExpanded />
    </main>
  );
}
