import { MDXRemote } from "next-mdx-remote/rsc";

/**
 * Рендерить сирий MDX-контент статті на сервері (RSC) — жодного MDX-
 * тулінгу в клієнтському бандлі. Базові HTML-теги переопределені
 * інлайн-стилями під design system (--text-primary/--text-secondary/
 * --lime), кастомних MDX-компонентів поки не потрібно для FAQ/гайдів.
 */
export function DocsArticleBody({ content }: { content: string }) {
  return (
    <div className="docs-article-body text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
      <MDXRemote
        source={content}
        components={{
          h2: (props) => (
            <h2
              className="font-display text-lg font-semibold mt-6 mb-2 first:mt-0"
              style={{ color: "var(--text-primary)" }}
              {...props}
            />
          ),
          p: (props) => <p className="mb-4" {...props} />,
          a: (props) => <a className="underline hover:opacity-80 transition-opacity" style={{ color: "var(--cyan)" }} {...props} />,
          ul: (props) => <ul className="list-disc pl-5 mb-4 space-y-1" {...props} />,
          ol: (props) => <ol className="list-decimal pl-5 mb-4 space-y-1" {...props} />,
          code: (props) => (
            <code
              className="text-xs font-mono px-1.5 py-0.5 rounded"
              style={{ background: "rgba(255,255,255,0.06)", color: "var(--lime)" }}
              {...props}
            />
          ),
        }}
      />
    </div>
  );
}
