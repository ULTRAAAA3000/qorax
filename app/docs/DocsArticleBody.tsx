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
          // MDXRemote передає className="language-json" (тощо) лише
          // для code-блоків УСЕРЕДИНІ ```fenced```, inline `code`
          // такого className не має — використовуємо цю ознаку, щоб
          // один спільний компонент `code` рендерив різний стиль
          // залежно від контексту (простіше й надійніше, ніж
          // намагатись перебити inline style="" через CSS-селектор
          // [&>code] у батьківському pre — inline style завжди
          // виграє специфічність над будь-яким класом).
          code: ({ className, ...props }: React.ComponentProps<"code">) => {
            const isFencedBlock = typeof className === "string" && className.startsWith("language-");
            if (isFencedBlock) {
              return <code className="text-xs font-mono" style={{ color: "var(--text-primary)" }} {...props} />;
            }
            return (
              <code
                className="text-xs font-mono px-1.5 py-0.5 rounded"
                style={{ background: "rgba(255,255,255,0.06)", color: "var(--lime)" }}
                {...props}
              />
            );
          },
          pre: (props) => (
            <pre
              className="text-xs font-mono rounded-xl p-4 mb-4 overflow-x-auto"
              style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}
              {...props}
            />
          ),
        }}
      />
    </div>
  );
}
