import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";

/**
 * Docs — MODULE_ROADMAP.md розділ 11. Схема БД у roadmap (docs_articles:
 * slug/title/content/category/is_enterprise_only/order_index) свідомо НЕ
 * використана як Supabase-таблиця — Артем обрав MDX-файли в репозиторії
 * (той самий компроміс, що прямо згаданий у roadmap як альтернатива:
 * "Історія змін статей — через git..., а не через окрему таблицю версій").
 * Ті самі поля живуть у frontmatter кожного .mdx-файлу замість рядків
 * таблиці. Мінус цього вибору: редагування статті вимагає деплою, а не
 * SQL UPDATE — свідомо прийнятий компроміс (простіше для соло-розробника).
 */

export const DOCS_CATEGORIES = [
  { id: "getting-started", label: "Початок роботи" },
  { id: "guides", label: "Гайди" },
  { id: "faq", label: "FAQ" },
] as const;

export type DocsCategory = (typeof DOCS_CATEGORIES)[number]["id"];

export interface DocsArticleMeta {
  slug: string;
  title: string;
  category: DocsCategory;
  isEnterpriseOnly: boolean;
  orderIndex: number;
}

export interface DocsArticle extends DocsArticleMeta {
  content: string; // сирий MDX-текст (рендериться через next-mdx-remote на сторінці)
}

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

function readArticleFile(category: string, filename: string): DocsArticle {
  const fullPath = path.join(DOCS_DIR, category, filename);
  const raw = fs.readFileSync(fullPath, "utf8");
  const { data, content } = matter(raw);
  const slug = filename.replace(/\.mdx$/, "");

  return {
    slug,
    title: data.title ?? slug,
    category: category as DocsCategory,
    isEnterpriseOnly: data.isEnterpriseOnly ?? false,
    orderIndex: data.orderIndex ?? 0,
    content,
  };
}

/** Усі статті документації, згруповані за категоріями, відсортовані за orderIndex. */
export function getAllDocsArticles(): DocsArticle[] {
  const articles: DocsArticle[] = [];

  for (const { id: category } of DOCS_CATEGORIES) {
    const categoryDir = path.join(DOCS_DIR, category);
    if (!fs.existsSync(categoryDir)) continue;

    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith(".mdx"));
    for (const filename of files) {
      articles.push(readArticleFile(category, filename));
    }
  }

  return articles.sort((a, b) => a.orderIndex - b.orderIndex);
}

/** Одна стаття за slug (шукає в усіх категоріях). Повертає null, якщо не знайдено. */
export function getDocsArticleBySlug(slug: string): DocsArticle | null {
  for (const { id: category } of DOCS_CATEGORIES) {
    const filePath = path.join(DOCS_DIR, category, `${slug}.mdx`);
    if (fs.existsSync(filePath)) {
      return readArticleFile(category, `${slug}.mdx`);
    }
  }
  return null;
}

/**
 * Найпростіший пошук для MVP (roadmap Крок 2 хоче Postgres tsvector —
 * недоречно без Supabase-таблиці; це свідоме спрощення, задокументоване
 * в EXECUTION_PLAN.md). Пошук по title + сирому MDX-контенту,
 * case-insensitive substring match — достатньо для десятків статей,
 * не тисяч.
 */
export function searchDocsArticles(query: string): DocsArticleMeta[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return getAllDocsArticles()
    .filter(a => a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q))
    .map(({ content: _content, ...meta }) => meta);
}
