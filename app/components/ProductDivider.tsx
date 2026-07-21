"use client";

import { ArrowUpRight } from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * ProductDivider — великий якір-заголовок перед групою ProductSection
 * одного продукту. Артем: три існуючі ProductSection (Моніторинг/
 * AI-пояснення/Історія) + HowItWorks/Plans/FAQ — усі вузько про
 * Qorax Business, без явного маркування цього факту. Цей компонент
 * дає кожній групі секцій свій "заголовок розділу" — і одразу відповідає
 * на "чому раптом лендинг заглиблюється в конкретний продукт" —
 * а не мовчки перемикається з екосистеми на один продукт.
 *
 * Той самий Cyber Minimal — glow-card-подібний бейдж, gradient-text,
 * accent-колір продукту (lime/cyan/purple), не нова візуальна мова.
 */

const ACCENT_COLORS = { lime: "var(--lime)", cyan: "var(--cyan)", purple: "var(--purple)" } as const;

export function ProductDivider({
  icon: Icon,
  productName,
  tagline,
  href,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  productName: string;
  tagline: string;
  href: string;
  accent: keyof typeof ACCENT_COLORS;
}) {
  const color = ACCENT_COLORS[accent];

  return (
    <div className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-24 pb-4">
        <Reveal>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3.5">
              <div
                className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${color}14`, border: `1px solid ${color}33` }}
              >
                <Icon size={20} style={{ color }} strokeWidth={1.5} />
              </div>
              <div>
                <span className="font-mono text-[11px] tracking-wide" style={{ color }}>
                  ЦЕ — {productName.toUpperCase()}
                </span>
                <h2 className="font-display text-xl sm:text-2xl font-semibold leading-tight">
                  {tagline}
                </h2>
              </div>
            </div>

            <a
              href={href}
              className="inline-flex items-center gap-1.5 text-sm font-medium shrink-0 px-4 py-2 rounded-xl transition-colors"
              style={{ color, background: `${color}0d`, border: `1px solid ${color}26` }}
            >
              Перейти в {productName} <ArrowUpRight size={14} />
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
