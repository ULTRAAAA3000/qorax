import { ArrowUpRight } from "lucide-react";
import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

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
 *
 * НАВМИСНО server component (без "use client") — компонент не
 * використовує жодних client-only API (hooks/event handlers), а
 * app/page.tsx (теж server component) передає сюди `icon` як React-
 * компонент (Briefcase/Mail/Palette/тощо з lucide-react). Функції
 * не можна серіалізувати через server→client межу ("Functions
 * cannot be passed directly to Client Components") — саме ця
 * помилка й падала на проді (500) після додавання цього компонента
 * з зайвим "use client". <Reveal> усередині лишається власною
 * client-межею (motion/react), і це працює нормально: server-
 * компонент може рендерити client-компонент як дочірній.
 */

const ACCENT_COLORS = { lime: "var(--lime)", cyan: "var(--cyan)", purple: "var(--purple)" } as const;
const COPY: Record<Locale, { thisIs: string; goTo: string }> = {
  uk: { thisIs: "ЦЕ — ", goTo: "Перейти в " },
  en: { thisIs: "THIS IS ", goTo: "Go to " },
};

export function ProductDivider({
  icon: Icon,
  productName,
  tagline,
  href,
  accent,
  lang = "uk",
}: {
  icon: React.ComponentType<{ size?: number; style?: React.CSSProperties; strokeWidth?: number }>;
  productName: string;
  tagline: string;
  href: string;
  accent: keyof typeof ACCENT_COLORS;
  lang?: Locale;
}) {
  const color = ACCENT_COLORS[accent];
  const t = COPY[lang];

  return (
    <div className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 pt-20 sm:pt-24 pb-4">
        <Reveal>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: `${color}14`, border: `1px solid ${color}33` }}
              >
                <Icon size={20} style={{ color }} strokeWidth={1.5} />
              </div>
              <div className="min-w-0">
                <span className="font-mono text-[11px] tracking-wide" style={{ color }}>
                  {t.thisIs}{productName.toUpperCase()}
                </span>
                <h2 className="font-display text-xl sm:text-2xl font-semibold leading-tight truncate">
                  {tagline}
                </h2>
              </div>
            </div>

            <a
              href={href}
              className="inline-flex items-center justify-center gap-1.5 text-sm font-medium shrink-0 px-4 py-2.5 sm:py-2 rounded-xl transition-colors w-full sm:w-auto"
              style={{ color, background: `${color}0d`, border: `1px solid ${color}26` }}
            >
              {t.goTo}{productName} <ArrowUpRight size={14} />
            </a>
          </div>
        </Reveal>
      </div>
    </div>
  );
}
