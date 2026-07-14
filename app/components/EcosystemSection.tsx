"use client";

// Секція лендінгу "Екосистема Qorax" — окремі продукти верхнього
// рівня (Dashboard, Creator, майбутній Mail), НЕ модулі всередині
// Dashboard (ті вже показані в PlatformModulesSection нижче на
// сторінці). Візуально споріднена з PlatformModulesSection (той
// самий glow-card, той самий Reveal-патерн), але з відчутнішою
// ієрархією — це вхідні двері в кожен продукт, не рядовий модуль,
// тож картки крупніші й мають явний статус-бейдж.
//
// Лише "live"-продукти клікабельні (зараз Dashboard). "preview" veде
// на реальний продукт, але позначений як ранній доступ. "soon" не
// клікабельний — Mail ще не існує технічно, посилання в нікуди було
// б гірше за його відсутність.

import Link from "next/link";
import { LayoutDashboard, LayoutTemplate, Mail, ArrowRight } from "lucide-react";
import { Reveal } from "./Reveal";

type ProductStatus = "live" | "preview" | "soon";

const PRODUCTS: Array<{
  name: string;
  tagline: string;
  description: string;
  icon: typeof LayoutDashboard;
  accent: "lime" | "cyan" | "purple";
  status: ProductStatus;
  href?: string;
}> = [
  {
    name: "Qorax Dashboard",
    tagline: "ОСНОВНА ПЛАТФОРМА",
    description: "Моніторинг, SEO, CRM, комерція, аналітика — усі інструменти для керування бізнесом онлайн в одному місці.",
    icon: LayoutDashboard,
    accent: "lime",
    status: "live",
    href: "/register",
  },
  {
    name: "Qorax Creator",
    tagline: "ВІЗУАЛЬНЕ ПОЛОТНО",
    description: "Створюйте й редагуйте сайти на безмежному canvas. Website Mode вже доступний у ранньому доступі.",
    icon: LayoutTemplate,
    accent: "cyan",
    status: "preview",
    href: "/creator",
  },
  {
    name: "Qorax Mail",
    tagline: "ПОШТОВІ РОЗСИЛКИ",
    description: "Email-кампанії та автоматизація листування, зв'язані з тими самими клієнтами й даними, що й решта Qorax.",
    icon: Mail,
    accent: "purple",
    status: "soon",
  },
];

const STATUS_LABEL: Record<ProductStatus, string> = {
  live: "Доступно",
  preview: "Ранній доступ",
  soon: "Скоро",
};

function accentColor(accent: "lime" | "cyan" | "purple"): string {
  if (accent === "lime") return "var(--lime)";
  if (accent === "cyan") return "var(--cyan)";
  return "var(--purple)";
}

export function EcosystemSection() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-6 sm:px-8">
        <Reveal>
          <p className="text-center text-xs font-mono tracking-[0.2em] uppercase mb-3" style={{ color: "var(--text-tertiary)" }}>
            Екосистема
          </p>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            Один Qorax, кілька продуктів
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-4 text-center text-base sm:text-lg text-[var(--text-secondary)] max-w-xl mx-auto">
            Кожен продукт працює самостійно, але спирається на ті самі дані — те, що ви створите в одному, видно й готове до роботи в іншому.
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-3 gap-5">
          {PRODUCTS.map((product, i) => {
            const color = accentColor(product.accent);
            const clickable = product.status !== "soon" && product.href;
            const CardInner = (
              <div
                className="glow-card p-7 h-full flex flex-col transition-transform"
                style={product.status === "soon" ? { opacity: 0.6 } : undefined}
              >
                <div className="flex items-start justify-between mb-5">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${color}14`, border: `1px solid ${color}33` }}
                  >
                    <product.icon size={20} style={{ color }} strokeWidth={1.5} />
                  </div>
                  <span
                    className="text-[10px] font-mono uppercase tracking-wide px-2 py-1 rounded-full shrink-0"
                    style={{ background: `${color}14`, color, border: `1px solid ${color}33` }}
                  >
                    {STATUS_LABEL[product.status]}
                  </span>
                </div>

                <h3 className="font-display text-lg font-semibold leading-tight mb-1">{product.name}</h3>
                <p className="text-[11px] font-mono mb-3" style={{ color }}>{product.tagline}</p>
                <p className="text-sm leading-relaxed text-[var(--text-secondary)] flex-1">{product.description}</p>

                {clickable && (
                  <div className="mt-5 flex items-center gap-1.5 text-sm font-medium" style={{ color }}>
                    Перейти <ArrowRight size={14} />
                  </div>
                )}
              </div>
            );

            return (
              <Reveal key={product.name} delay={Math.min(i * 0.08, 0.3)}>
                {clickable ? (
                  <Link href={product.href!} className="block h-full hover:-translate-y-0.5 transition-transform">
                    {CardInner}
                  </Link>
                ) : (
                  CardInner
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
