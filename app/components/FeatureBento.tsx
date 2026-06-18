"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";
import { Reveal } from "./Reveal";

/**
 * FeatureBento — dense, scannable overview of every capability, in the
 * "Bento Grid Showcase" pattern (Apple-style modular tiles). Each tile
 * card hover-scales 1.02 per the pattern spec, no rotation/tilt gimmicks.
 */

type Tile = {
  title: string;
  description: string;
  span?: "wide" | "tall" | "normal";
  accent?: "lime" | "cyan" | "none";
  visual: ReactNode;
};

function MiniBars({ accent }: { accent: "lime" | "cyan" }) {
  const color = accent === "lime" ? "var(--lime)" : "var(--cyan)";
  return (
    <div className="flex items-end gap-1.5 h-12">
      {[0.4, 0.7, 1, 0.55, 0.85].map((h, i) => (
        <div
          key={i}
          className="w-1.5 rounded-full"
          style={{ height: `${h * 100}%`, background: i === 2 ? color : "var(--border-hairline-strong)" }}
        />
      ))}
    </div>
  );
}

function MiniGauge({ accent }: { accent: "lime" | "cyan" }) {
  const color = accent === "lime" ? "var(--lime)" : "var(--cyan)";
  return (
    <svg viewBox="0 0 100 56" className="w-20 h-11">
      <path d="M6 50 A44 44 0 0 1 94 50" fill="none" stroke="var(--border-hairline-strong)" strokeWidth="6" strokeLinecap="round" />
      <path d="M6 50 A44 44 0 0 1 70 14" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" />
    </svg>
  );
}

function MiniBadge({ text, accent }: { text: string; accent: "lime" | "cyan" }) {
  const color = accent === "lime" ? "var(--lime)" : "var(--cyan)";
  return (
    <span
      className="font-mono text-xs px-2.5 py-1 rounded-full border"
      style={{ borderColor: color, color }}
    >
      {text}
    </span>
  );
}

const TILES: Tile[] = [
  {
    title: "SSL та домен",
    description: "Алерт за 30 і 7 днів до закінчення — ніколи не дізнаєтесь про це з помилки в браузері клієнта.",
    accent: "lime",
    visual: <MiniBadge text="84 дні" accent="lime" />,
  },
  {
    title: "Core Web Vitals",
    description: "LCP, INP, CLS — ті самі метрики, за якими Google ранжує швидкість вашого сайту.",
    span: "wide",
    accent: "cyan",
    visual: <MiniGauge accent="cyan" />,
  },
  {
    title: "Биті посилання",
    description: "Щотижневий обхід усіх сторінок сайту з переліком, що саме зламалось.",
    accent: "lime",
    visual: <MiniBars accent="lime" />,
  },
  {
    title: "Google Search Console",
    description: "Клікі, показники, середня позиція — напряму з офіційного API Google, без скрейпінгу.",
    accent: "cyan",
    visual: <MiniBadge text="GSC" accent="cyan" />,
  },
  {
    title: "Мобільна версія",
    description: "Viewport, читабельність тексту, розмір тап-таргетів — усе, що Google перевіряє для mobile-first індексації.",
    accent: "lime",
    visual: <MiniBadge text="✓ OK" accent="lime" />,
  },
  {
    title: "Конкуренти",
    description: "Бачите, коли конкурент змінює сайт або стає швидшим за вас — без ручного відвідування щодня.",
    span: "wide",
    accent: "cyan",
    visual: <MiniBars accent="cyan" />,
  },
  {
    title: "White-label звіти",
    description: "Для агентств: PDF-звіти з вашим логотипом і брендом, а не з нашим.",
    accent: "lime",
    visual: <MiniBadge text="Agency" accent="lime" />,
  },
  {
    title: "Telegram-алерти",
    description: "Сайт впав — повідомлення приходить за хвилину, не через годину, коли хтось випадково помітив.",
    accent: "cyan",
    visual: <MiniBadge text="↯ 1 хв" accent="cyan" />,
  },
];

function BentoTile({ tile }: { tile: Tile }) {
  const reduceMotion = useReducedMotion();
  const spanClass =
    tile.span === "wide" ? "sm:col-span-2" : tile.span === "tall" ? "sm:row-span-2" : "";

  return (
    <motion.div
      className={`rounded-2xl border hairline bg-[var(--bg-raised)] p-6 flex flex-col justify-between min-h-[180px] ${spanClass}`}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
    >
      <div>
        <h3 className="font-display text-base font-medium mb-2 text-[var(--text-primary)]">
          {tile.title}
        </h3>
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {tile.description}
        </p>
      </div>
      <div className="mt-4">{tile.visual}</div>
    </motion.div>
  );
}

export function FeatureBento() {
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="flex items-baseline gap-3 mb-5">
            <span className="font-mono text-sm text-[var(--text-tertiary)]">04</span>
            <span className="font-mono text-xs tracking-wide text-[var(--text-tertiary)]">
              УСІ МОЖЛИВОСТІ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl font-semibold max-w-xl leading-tight">
            Один сервіс замість п&apos;яти різних вкладок
          </h2>
        </Reveal>

        <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TILES.map((tile, i) => (
            <Reveal key={tile.title} delay={Math.min(i * 0.04, 0.2)} className={tile.span === "wide" ? "sm:col-span-2" : ""}>
              <BentoTile tile={tile} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
