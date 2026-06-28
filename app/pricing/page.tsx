import { Reveal } from "@/app/components/Reveal";
import { SiteNav } from "@/app/components/SiteNav";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { createClient } from "@/app/lib/supabase/server";

const LS_SUBDOMAIN = process.env.LS_STORE_SUBDOMAIN ?? "qoraxus";
const LS_VARIANTS: Record<string, string> = {
  Starter: process.env.LS_VARIANT_STARTER ?? "",
  Growth: process.env.LS_VARIANT_GROWTH ?? "",
  Agency: process.env.LS_VARIANT_AGENCY ?? "",
};
function lsUrl(plan: string): string {
  const vid = LS_VARIANTS[plan];
  return vid ? `https://${LS_SUBDOMAIN}.lemonsqueezy.com/checkout/buy/${vid}` : `/register?plan=${plan.toLowerCase()}`;
}

const FAQ = [
  { q: "Чи є пробний період?", a: "Так, 14 днів безкоштовно на будь-якому тарифі. Карта не потрібна." },
  { q: "Можна змінити тариф в будь-який момент?", a: "Так, апгрейд або даунгрейд одразу — різниця вартості перераховується пропорційно." },
  { q: "Що означає «сайт» в контексті тарифів?", a: "Один домен або піддомен. Наприклад, site.com і blog.site.com — це два різних сайти." },
  { q: "Як відбувається оплата?", a: "Щомісячно карткою через LemonSqueezy. Скасувати можна будь-коли в особистому кабінеті." },
  { q: "Є знижки для агентств?", a: "Тариф Agency вже розрахований на 5 сайтів з white-label звітами. Для більших об'ємів — напишіть нам." },
];

export default async function PricingPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let orgId = "";
  if (user) {
    const { data: membership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .single();
    orgId = membership?.organization_id ?? "";
  }

  function checkoutUrl(plan: string): string {
    if (!user) return `/register?plan=${plan.toLowerCase()}`;
    const base = lsUrl(plan);
    if (!base.startsWith("http")) return base;
    const params = new URLSearchParams();
    if (user.email) params.set("checkout[email]", user.email);
    if (orgId) params.set("checkout[custom][org_id]", orgId);
    return params.toString() ? `${base}?${params.toString()}` : base;
  }

  const PLANS = [
    {
      name: "Starter",
      price: "$49",
      tagline: "Один сайт, спокійний сон",
      highlighted: false,
      features: [
        "1 сайт", "Uptime моніторинг (кожні 5 хв)", "Швидкість + графік у часі",
        "SSL та домен — алерти", "Биті посилання (щотижня)", "AI-пояснення простою мовою",
        "PDF-звіт щомісяця", "Email сповіщення",
      ],
      url: checkoutUrl("Starter"),
    },
    {
      name: "Growth",
      price: "$99",
      tagline: "Коли вже росте трафік",
      highlighted: true,
      features: [
        "1 сайт — все з Starter", "Core Web Vitals (LCP, INP, CLS)", "SEO: meta, schema, sitemap",
        "AI: вплив на дохід у $", "Моніторинг 1 конкурента", "Telegram-алерти",
        "Живий дашборд", "Пріоритетна підтримка",
      ],
      url: checkoutUrl("Growth"),
    },
    {
      name: "Agency",
      price: "$199",
      tagline: "До 5 сайтів під одним дахом",
      highlighted: false,
      features: [
        "5 сайтів — все з Growth", "White-label PDF звіти", "AI генерація SEO текстів",
        "Конкуренти на кожен сайт", "Командний доступ", "Виділений менеджер",
      ],
      url: checkoutUrl("Agency"),
    },
  ];

  return (
    <main className="flex flex-col min-h-screen">
      <SiteNav />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(214,255,63,0.06) 0%, transparent 60%)" }} />
        <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}>
              ✦ ТАРИФИ
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              У 3–10 разів{" "}<span className="gradient-text">дешевше</span>{" "}за найм підрядника
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              14 днів безкоштовно на будь-якому тарифі. Карта не потрібна.
            </p>
          </Reveal>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-6xl px-6 sm:px-8 pb-24 w-full">
        <div className="grid lg:grid-cols-[0.85fr_1.15fr_0.85fr] gap-5 items-stretch">
          {PLANS.map((plan, i) => (
            <Reveal key={plan.name} delay={i * 0.08} className={plan.highlighted ? "" : "lg:pt-6"}>
              <div
                className={`rounded-2xl p-7 sm:p-8 h-full flex flex-col ${plan.highlighted ? "gradient-border" : ""}`}
                style={{
                  background: plan.highlighted ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.03)",
                  border: plan.highlighted ? "none" : "1px solid rgba(255,255,255,0.06)",
                  boxShadow: plan.highlighted ? "0 0 60px rgba(214,255,63,0.06), 0 0 120px rgba(140,246,255,0.04)" : "none",
                }}
              >
                <div className="flex items-baseline justify-between mb-1">
                  <h3 className="font-display text-xl font-medium">{plan.name}</h3>
                  {plan.highlighted && (
                    <span className="font-mono text-[10px] tracking-wide px-2.5 py-1 rounded-full font-medium" style={{ background: "var(--gradient-primary)", color: "#0a0a0a" }}>
                      ПОПУЛЯРНИЙ
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-6">{plan.tagline}</p>
                <div className="font-mono text-3xl tabular mb-7">
                  <span className={plan.highlighted ? "gradient-text font-bold" : "text-[var(--text-primary)] font-bold"}>{plan.price}</span>
                  <span className="text-sm text-[var(--text-tertiary)] font-sans font-normal">/міс</span>
                </div>
                <ul className="space-y-3 flex-1">
                  {plan.features.map(f => (
                    <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                      <span className="mt-1.5 h-1 w-1 rounded-full shrink-0" style={{ background: plan.highlighted ? "var(--cyan)" : "var(--text-tertiary)" }} />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={plan.url}
                  target={plan.url.startsWith("http") ? "_blank" : undefined}
                  rel={plan.url.startsWith("http") ? "noopener noreferrer" : undefined}
                  className={`mt-8 w-full py-3 rounded-xl text-sm font-medium transition-all text-center block ${plan.highlighted ? "glow-button justify-center" : "ghost-button justify-center"}`}
                >
                  Почати 14 днів безкоштовно →
                </a>
              </div>
            </Reveal>
          ))}
        </div>

        {/* FAQ */}
        <div className="mt-24">
          <Reveal>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-12">
              Часті запитання
            </h2>
          </Reveal>
          <div className="max-w-2xl mx-auto space-y-4">
            {FAQ.map((item, i) => (
              <Reveal key={i} delay={i * 0.05}>
                <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <h3 className="font-medium mb-2">{item.q}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <SiteFooterExpanded />
    </main>
  );
}
