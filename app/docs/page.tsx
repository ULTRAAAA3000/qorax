import { createClient } from "@/app/lib/supabase/server";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { Reveal } from "@/app/components/Reveal";
import { getAllDocsArticles, DOCS_CATEGORIES } from "@/app/lib/docs";
import { DocsArticleBody } from "./DocsArticleBody";
import { DocsEnterpriseLocked } from "./DocsEnterpriseLocked";
import { DocsBrowser, DocsCta } from "./DocsContent";

export const metadata = { title: "Документація — Qorax" };

// Docs — MODULE_ROADMAP.md розділ 11, Крок 3: розширення статичного
// /docs реальним деревом статей замість hardcoded FAQ-віджета.
// Артем обрав MDX-файли в репозиторії (content/docs/) замість
// Supabase-таблиці docs_articles — простіше редагувати як розробнику,
// компроміс — редагування статті вимагає деплою, а не SQL UPDATE.
//
// Гейтинг isEnterpriseOnly (EXECUTION_PLAN.md, PRICING.md розділ 4 —
// поле існувало в docs.ts з самого початку, але ніде не
// перевірялось). КРИТИЧНО: перевірка робиться ДО рендерингу MDX-тіла
// статті, не після — уся документація рендериться в один прохід тут
// (RSC) і передається в DocsBrowser як готові React-елементи
// (renderedArticles нижче). Якщо спершу відрендерити тіло
// isEnterpriseOnly-статті і тільки потім приховати його в UI —
// контент однаково потрапить у HTML/React payload, який видно через
// "показати код сторінки". Тому для юзерів без доступу тіло взагалі
// НЕ рендериться — підставляється DocsEnterpriseLocked замість
// DocsArticleBody.
export default async function DocsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const hasEnterpriseAccess = await checkEnterpriseAccess(supabase, user?.id);

  const articles = getAllDocsArticles();
  // MDX рендериться тут, на сервері (RSC) — DocsBrowser отримує вже
  // готові React-елементи, тому next-mdx-remote не потрапляє в
  // клієнтський бандл разом з інтерактивною навігацією.
  const renderedArticles = articles.map(a => ({
    slug: a.slug,
    title: a.isEnterpriseOnly && !hasEnterpriseAccess ? `${a.title} 🔒` : a.title,
    category: a.category,
    body:
      a.isEnterpriseOnly && !hasEnterpriseAccess
        ? <DocsEnterpriseLocked key={a.slug} title={a.title} />
        : <DocsArticleBody key={a.slug} content={a.content} />,
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

/**
 * Enterprise-доступ = platform admin (бачить усе незалежно від
 * тарифу своєї організації, той самий принцип, що is_platform_admin()
 * в RLS-політиках) АБО членство в організації з активним тарифом
 * enterprise (0056_enterprise_plan.sql). Анонімний відвідувач
 * (user == null) — завжди без доступу, найбезпечніший дефолт.
 */
async function checkEnterpriseAccess(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string | undefined
): Promise<boolean> {
  if (!userId) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", userId)
    .single();
  if (profile?.platform_role === "admin") return true;

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", userId)
    .single();
  if (!membership) return false;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, plans(code)")
    .eq("organization_id", membership.organization_id)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const planCode = (subscription?.plans as unknown as { code: string }[] | { code: string } | null);
  const code = Array.isArray(planCode) ? planCode[0]?.code : planCode?.code;
  return code === "enterprise";
}
