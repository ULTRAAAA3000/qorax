import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";
import { getAllDocsArticles, DOCS_CATEGORIES } from "@/app/lib/docs";
import { DocsArticleBody } from "./DocsArticleBody";
import { DocsBrowser, DocsCta } from "./DocsContent";

export const metadata = { title: "Документація — Qorax" };

// Docs — MODULE_ROADMAP.md розділ 11, Крок 3: розширення статичного
// /docs реальним деревом статей замість hardcoded FAQ-віджета.
// Артем обрав MDX-файли в репозиторії (content/docs/) замість
// Supabase-таблиці docs_articles — простіше редагувати як розробнику,
// компроміс — редагування статті вимагає деплою, а не SQL UPDATE.
export default async function DocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const articles = getAllDocsArticles();
  // MDX рендериться тут, на сервері (RSC) — DocsBrowser отримує вже
  // готові React-елементи, тому next-mdx-remote не потрапляє в
  // клієнтський бандл разом з інтерактивною навігацією.
  const renderedArticles = articles.map(a => ({
    slug: a.slug,
    title: a.title,
    category: a.category,
    body: <DocsArticleBody key={a.slug} content={a.content} />,
  }));

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

      <DocsBrowser articles={renderedArticles} categories={DOCS_CATEGORIES} />
      <DocsCta />

      <SiteFooterExpanded />
    </main>
  );
}
