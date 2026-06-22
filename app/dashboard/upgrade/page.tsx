import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { Check } from "lucide-react";

export const metadata = { title: "Обрати план — Qorax" };

const PLANS = [
  {
    code: "starter",
    name: "Starter",
    price: 49,
    highlight: false,
    features: [
      "1 сайт",
      "Uptime кожні 5 хвилин",
      "Швидкість + графік",
      "SSL / домен алерти",
      "Битые посилання",
      "AI пояснення простою",
      "Місячний PDF звіт",
      "Email алерти",
    ],
  },
  {
    code: "growth",
    name: "Growth",
    price: 99,
    highlight: true,
    features: [
      "1 сайт",
      "Всі функції Starter",
      "Core Web Vitals",
      "Meta / Schema checker",
      "Google Search Console",
      "AI Revenue Impact ($)",
      "1 конкурент моніторинг",
      "Telegram алерти",
    ],
  },
  {
    code: "agency",
    name: "Agency",
    price: 199,
    highlight: false,
    features: [
      "До 5 сайтів",
      "Всі функції Growth",
      "White-label звіти",
      "AI контент / SEO структура",
      "Моніторинг конкурентів",
      "+$29/міс за доп. сайт",
      "Пріоритетна підтримка",
    ],
  },
];

export default function UpgradePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link href="/dashboard" className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
            ← Назад
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 sm:px-8 py-16">
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-semibold mb-3">Оберіть план</h1>
          <p className="text-[var(--text-secondary)] text-sm max-w-md mx-auto">
            Підключення Stripe — скоро. Напишіть нам і ми активуємо план вручну поки платіжна система не готова.
          </p>
        </div>

        <div className="grid sm:grid-cols-3 gap-5">
          {PLANS.map((plan) => (
            <div
              key={plan.code}
              className="rounded-2xl border p-6 flex flex-col"
              style={{
                borderColor: plan.highlight ? "var(--lime)" : "var(--border-hairline)",
                background: plan.highlight ? "rgba(214,255,63,0.04)" : "var(--bg-raised)",
              }}
            >
              {plan.highlight && (
                <div className="text-xs font-mono mb-3 px-2.5 py-1 rounded-lg self-start"
                  style={{ background: "rgba(214,255,63,0.15)", color: "var(--lime)" }}>
                  Популярний
                </div>
              )}
              <div className="mb-1">
                <span className="font-display text-lg font-semibold">{plan.name}</span>
              </div>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="font-display text-3xl font-bold">${plan.price}</span>
                <span className="text-sm text-[var(--text-tertiary)]">/міс</span>
              </div>
              <ul className="space-y-2.5 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm text-[var(--text-secondary)]">
                    <Check size={13} style={{ color: "var(--lime)", flexShrink: 0, marginTop: 2 }} />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:hello@qorax.com?subject=Підключення плану"
                className="text-center text-sm font-medium rounded-xl py-3 transition-opacity hover:opacity-80"
                style={
                  plan.highlight
                    ? { background: "var(--lime)", color: "#0c111d" }
                    : { border: "1px solid var(--border-hairline)", color: "var(--text-primary)" }
                }
              >
                Обрати {plan.name}
              </a>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-[var(--text-tertiary)] mt-8">
          Є питання? Пишіть на{" "}
          <a href="mailto:hello@qorax.com" className="text-[var(--cyan)] hover:opacity-80">
            hello@qorax.com
          </a>
        </p>
      </main>
    </div>
  );
}
