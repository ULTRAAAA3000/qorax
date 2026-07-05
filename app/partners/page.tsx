import { Reveal } from "@/app/components/Reveal";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import { createClient } from "@/app/lib/supabase/server";
import { Link2, Wallet, Users, Clock } from "lucide-react";

export const metadata = { title: "Партнерська програма — Qorax" };

const STEPS = [
  {
    icon: Link2,
    title: "Отримайте посилання",
    text: "Зареєструйтесь у Qorax — у вашому кабінеті одразу зʼявиться персональне реферальне посилання.",
  },
  {
    icon: Users,
    title: "Поділіться з клієнтами",
    text: "Надішліть посилання клієнту, якому пропонуєте моніторинг сайту — на своєму сайті, у пропозиції, де завгодно.",
  },
  {
    icon: Clock,
    title: "Клієнт реєструється й оплачує",
    text: "Якщо клієнт зареєструється за вашим посиланням і оплатить підписку протягом 30 днів — вона зарахується за вами.",
  },
  {
    icon: Wallet,
    title: "Отримуєте комісію",
    text: "25% від суми першого платежу клієнта нараховується вам автоматично. Виплата — переказом, за домовленістю.",
  },
];

const FAQ = [
  { q: "Хто може стати партнером?", a: "Будь-хто з акаунтом Qorax — власники веб-студій, фрілансери, агентства, чи просто ті, хто знає бізнеси з застарілими сайтами." },
  { q: "Скільки я заробляю?", a: "25% від суми першого платежу клієнта, якого ви привели. Це одноразова комісія за перший місяць оплати, не щомісячна." },
  { q: "Як довго діє моє посилання?", a: "Атрибуція зберігається 30 днів з моменту переходу за посиланням. Якщо клієнт оплатить підписку протягом цього вікна — комісія ваша." },
  { q: "Коли і як я отримаю виплату?", a: "Виплати обробляються вручну переказом за домовленістю. Статус кожного нарахування видно у вашому кабінеті: в очікуванні → виплачено." },
  { q: "Чи можу я запросити самого себе?", a: "Ні, комісія нараховується тільки за реальних нових клієнтів, які самостійно оплачують підписку." },
];

export default async function PartnersPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <main className="flex flex-col min-h-screen">
      <MarketingHeader isLoggedIn={!!user} activePath="/partners" />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: "radial-gradient(ellipse at 50% 0%, rgba(140,246,255,0.06) 0%, transparent 60%)" }} />
        <div className="mx-auto max-w-4xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
          <Reveal>
            <span className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}>
              ✦ ПАРТНЕРСЬКА ПРОГРАМА
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              Приведіть клієнта —{" "}<span className="gradient-text">отримайте 25%</span>
            </h1>
          </Reveal>
          <Reveal delay={0.12}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              Для веб-студій, фрілансерів та всіх, хто працює з бізнесами, яким потрібен моніторинг сайту.
              Без мінімальних порогів і складних умов.
            </p>
          </Reveal>
          <Reveal delay={0.18}>
            <div className="mt-10 flex items-center justify-center gap-4">
              <a href={user ? "/dashboard/referrals" : "/register"} className="glow-button text-sm">
                {user ? "Перейти до кабінету партнера" : "Почати зараз →"}
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-5xl px-6 sm:px-8 pb-24 w-full">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-12">
            Як це працює
          </h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 0.08}>
              <div className="rounded-2xl p-6 h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: "rgba(140,246,255,0.1)" }}>
                  <step.icon size={18} style={{ color: "var(--cyan)" }} />
                </div>
                <p className="font-mono text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>КРОК {i + 1}</p>
                <h3 className="font-medium mb-2">{step.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </div>

        {/* Example calculation */}
        <Reveal delay={0.1}>
          <div className="mt-14 rounded-2xl p-8 sm:p-10 gradient-border" style={{ background: "rgba(255,255,255,0.04)" }}>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
              <div>
                <p className="text-sm text-[var(--text-tertiary)] mb-1">Наприклад</p>
                <p className="text-lg">
                  Клієнт обирає план <strong className="text-[var(--text-primary)]">Growth ($99/міс)</strong>
                </p>
              </div>
              <div className="text-center">
                <p className="font-mono text-4xl font-bold gradient-text">$24.75</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-1">ваша комісія за цього клієнта</p>
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-2xl px-6 sm:px-8 pb-24 w-full">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-center mb-12">
            Часті запитання
          </h2>
        </Reveal>
        <div className="space-y-4">
          {FAQ.map((item, i) => (
            <Reveal key={i} delay={i * 0.05}>
              <div className="rounded-2xl p-6" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <h3 className="font-medium mb-2">{item.q}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.a}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto max-w-3xl px-6 sm:px-8 pb-24 w-full text-center">
        <Reveal>
          <div className="rounded-2xl p-10 sm:p-14" style={{ background: "rgba(214,255,63,0.04)", border: "1px solid rgba(214,255,63,0.15)" }}>
            <h2 className="font-display text-2xl sm:text-3xl font-semibold mb-3">
              Готові почати заробляти на рекомендаціях?
            </h2>
            <p className="text-[var(--text-secondary)] mb-8 max-w-md mx-auto">
              Зареєструйтесь у Qorax і отримайте своє реферальне посилання одразу в кабінеті.
            </p>
            <a href={user ? "/dashboard/referrals" : "/register"} className="glow-button text-sm">
              {user ? "Перейти до кабінету партнера" : "Створити акаунт →"}
            </a>
          </div>
        </Reveal>
      </section>

      <SiteFooterExpanded />
    </main>
  );
}
