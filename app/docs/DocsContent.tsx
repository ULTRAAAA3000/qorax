"use client";

import { useState, type ReactNode } from "react";
import { Reveal } from "@/app/components/Reveal";

export interface RenderedDocsArticle {
  slug: string;
  title: string;
  category: string;
  body: ReactNode;
}

export interface DocsCategoryDef {
  id: string;
  label: string;
}

/**
 * Дерево статей документації (MODULE_ROADMAP.md розділ 11, Крок 3):
 * сайдбар категорій + список статей у категорії + тіло активної статті.
 * Тіло вже відрендерене на сервері (RSC) в page.tsx і передається як
 * готовий ReactNode — цей компонент керує лише тим, яка стаття активна.
 */
export function DocsBrowser({
  articles,
  categories,
}: {
  articles: RenderedDocsArticle[];
  categories: readonly DocsCategoryDef[];
}) {
  const firstCategoryWithArticles = categories.find(c => articles.some(a => a.category === c.id));
  const [activeCategory, setActiveCategory] = useState(firstCategoryWithArticles?.id ?? categories[0]?.id ?? "");

  const categoryArticles = articles.filter(a => a.category === activeCategory);
  const [activeSlug, setActiveSlug] = useState(categoryArticles[0]?.slug ?? "");

  function selectCategory(categoryId: string) {
    setActiveCategory(categoryId);
    const firstInCategory = articles.find(a => a.category === categoryId);
    setActiveSlug(firstInCategory?.slug ?? "");
  }

  const activeArticle = articles.find(a => a.slug === activeSlug) ?? categoryArticles[0];

  return (
    <section className="mx-auto max-w-6xl px-6 sm:px-8 py-10 sm:py-16 w-full">
      <div className="grid lg:grid-cols-[220px_1fr] gap-10 lg:gap-16">
        {/* Sidebar: категорії + статті поточної категорії */}
        <nav className="lg:sticky lg:top-24 lg:self-start">
          <ul className="space-y-1">
            {categories.map(category => {
              const isActiveCategory = activeCategory === category.id;
              const articlesInCategory = articles.filter(a => a.category === category.id);
              if (articlesInCategory.length === 0) return null;

              return (
                <li key={category.id}>
                  <button
                    onClick={() => selectCategory(category.id)}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm transition-all"
                    style={{
                      color: isActiveCategory ? "var(--text-primary)" : "var(--text-secondary)",
                      background: isActiveCategory ? "rgba(214,255,63,0.06)" : "transparent",
                      borderLeft: isActiveCategory ? "2px solid var(--lime)" : "2px solid transparent",
                    }}
                  >
                    {category.label}
                  </button>

                  {isActiveCategory && articlesInCategory.length > 1 && (
                    <ul className="ml-3 mt-1 space-y-0.5 mb-1">
                      {articlesInCategory.map(article => (
                        <li key={article.slug}>
                          <button
                            onClick={() => setActiveSlug(article.slug)}
                            className="w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors"
                            style={{
                              color: activeSlug === article.slug ? "var(--cyan)" : "var(--text-tertiary)",
                            }}
                          >
                            {article.title}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div
            className="mt-8 rounded-xl p-4"
            style={{
              background: "rgba(140,246,255,0.04)",
              border: "1px solid rgba(140,246,255,0.1)",
            }}
          >
            <p className="text-xs font-mono text-[var(--cyan)] mb-2">ПІДТРИМКА</p>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Не знайшли відповідь?
            </p>
            <a
              href="mailto:support@qorax.app"
              className="mt-2 text-sm text-[var(--cyan)] hover:opacity-80 transition-opacity block"
            >
              support@qorax.app →
            </a>
          </div>
        </nav>

        {/* Active article */}
        <div>
          {activeArticle ? (
            <>
              <h2 className="font-display text-2xl font-semibold mb-6">
                {activeArticle.title}
              </h2>
              {activeArticle.body}
            </>
          ) : (
            <p className="text-sm text-[var(--text-secondary)]">
              Документація для цього розділу з&apos;явиться найближчим часом.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

// Bottom CTA — reusable in server page
export function DocsCta() {
  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-16 sm:py-20 text-center">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-4">
            Готові спробувати?
          </h2>
        </Reveal>
        <Reveal delay={0.05}>
          <p className="text-[var(--text-secondary)] mb-8 max-w-sm mx-auto">
            14 днів повного доступу безкоштовно. Без кредитної картки.
          </p>
        </Reveal>
        <Reveal delay={0.1}>
          <a href="/register" className="glow-button text-sm !py-3 !px-8 inline-block">
            Почати тріал →
          </a>
        </Reveal>
      </div>
    </section>
  );
}
