import { Reveal } from "@/app/components/Reveal";
import { MarketingHeader } from "@/app/components/MarketingHeader";
import { SiteFooterExpanded } from "@/app/components/SiteFooterExpanded";
import type { LucideIcon } from "lucide-react";

/**
 * ProductComingSoon — спільний шаблон для landing-заглушок п'яти
 * продуктів екосистеми Qorax (PRODUCT_VISION.md). Business єдиний,
 * що вже live — має власну повноцінну /page.tsx (лендинг проєкту),
 * не використовує цей шаблон. Mail/Creator/Office/Browser
 * зафіксовані в MODULE_ROADMAP.md як концепції без коду — ці
 * сторінки лише дизайн, переходи на реальні продукти додамо, коли
 * кожен з них реально почне реалізовуватись.
 *
 * isLoggedIn — сесія Supabase спільна на весь домен (cookie
 * path="/", 400 днів — @supabase/ssr за замовчуванням), тому
 * користувач, який вже увійшов через /dashboard чи /creator, не
 * повинен бачити тут повідомлення, що натякає на повторний вхід.
 * Сторінка сама не робить запит до Supabase — той самий
 * server-side `auth.getUser()`, що вже виконує кожна /app/*-сторінка
 * продукту, передається сюди пропсом (уникає дублювання клієнта
 * Supabase в кожному з 3 coming-soon роутів).
 */

interface HighlightItem {
  icon: LucideIcon;
  title: string;
  text: string;
}

interface Props {
  activePath: string;
  eyebrow: string;
  name: string;
  tagline: string;
  description: string;
  accent: "lime" | "cyan" | "purple";
  highlights: HighlightItem[];
  isLoggedIn?: boolean;
}

const ACCENT_COLORS = { lime: "var(--lime)", cyan: "var(--cyan)", purple: "#B98CF7" } as const;
const ACCENT_GLOW = {
  lime: "rgba(198,255,84,0.06)",
  cyan: "rgba(140,246,255,0.06)",
  purple: "rgba(185,140,247,0.06)",
} as const;

export function ProductComingSoon({ activePath, eyebrow, name, tagline, description, accent, highlights, isLoggedIn }: Props) {
  const color = ACCENT_COLORS[accent];

  return (
    <main className="flex flex-col min-h-screen">
      <MarketingHeader activePath={activePath} />

      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse at 50% 0%, ${ACCENT_GLOW[accent]} 0%, transparent 60%)` }} />
        <div className="mx-auto max-w-4xl px-6 sm:px-8 pt-20 sm:pt-28 pb-16 text-center">
          <Reveal>
            <span
              className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-mono mb-8"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "var(--text-tertiary)" }}
            >
              ✦ {eyebrow}
            </span>
          </Reveal>
          <Reveal delay={0.06}>
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight">
              {name.split(" ")[0]}{" "}
              <span className="gradient-text">{name.split(" ").slice(1).join(" ")}</span>
            </h1>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-4 text-sm font-mono" style={{ color }}>{tagline}</p>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-6 text-lg text-[var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              {description}
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <div className="mt-10 flex items-center justify-center gap-4">
              <span
                className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium"
                style={{ background: `${color}14`, border: `1px solid ${color}33`, color }}
              >
                У розробці — слідкуйте за оновленнями
              </span>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 sm:px-8 pb-24 w-full">
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {highlights.map((item, i) => (
            <Reveal key={item.title} delay={i * 0.08}>
              <div className="rounded-2xl p-6 h-full" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center mb-4" style={{ background: `${color}14` }}>
                  <item.icon size={18} style={{ color }} strokeWidth={1.5} />
                </div>
                <h3 className="font-medium mb-2">{item.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{item.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-2xl px-6 sm:px-8 pb-24 w-full text-center">
        <Reveal>
          <div className="rounded-2xl p-8" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
            {isLoggedIn ? (
              <>
                <p className="text-[var(--text-secondary)] mb-1">А поки — ваш акаунт вже готовий у</p>
                <a href="/dashboard" className="inline-flex items-center gap-2 mt-2 text-sm font-medium" style={{ color: "var(--lime)" }}>
                  Qorax Business →
                </a>
              </>
            ) : (
              <>
                <p className="text-[var(--text-secondary)] mb-1">Поки що доступна лише</p>
                <a href="/login" className="inline-flex items-center gap-2 mt-2 text-sm font-medium" style={{ color: "var(--lime)" }}>
                  Qorax Business →
                </a>
              </>
            )}
          </div>
        </Reveal>
      </section>

      <SiteFooterExpanded />
    </main>
  );
}
