"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ComponentType, CSSProperties } from "react";
import {
  ShieldCheck,
  Gauge,
  Link2,
  BarChart3,
  Smartphone,
  Flag,
  FileText,
  MessageCircle,
} from "lucide-react";
import { Reveal } from "./Reveal";

/**
 * FeatureBento — Raycast-style glow-on-hover bento grid with
 * gradient border effects and icon visuals.
 */

type Tile = {
  title: string;
  description: string;
  span?: "wide" | "tall" | "normal";
  accent?: "lime" | "cyan" | "none";
  icon: ComponentType<{ className?: string; strokeWidth?: number; style?: CSSProperties }>;
};

const TILES: Tile[] = [
  {
    title: "SSL та домен",
    description: "Алерт за 30 і 7 днів до закінчення — ніколи не дізнаєтесь про це з помилки в браузері клієнта.",
    accent: "lime",
    icon: ShieldCheck,
  },
  {
    title: "Core Web Vitals",
    description: "LCP, INP, CLS — ті самі метрики, за якими Google ранжує швидкість вашого сайту.",
    span: "wide",
    accent: "cyan",
    icon: Gauge,
  },
  {
    title: "Биті посилання",
    description: "Щотижневий обхід усіх сторінок сайту з переліком, що саме зламалось.",
    accent: "lime",
    icon: Link2,
  },
  {
    title: "Google Search Console",
    description: "Клікі, показники, середня позиція — напряму з офіційного API Google, без скрейпінгу.",
    accent: "cyan",
    icon: BarChart3,
  },
  {
    title: "Мобільна версія",
    description: "Viewport, читабельність тексту, розмір тап-таргетів — усе, що Google перевіряє для mobile-first індексації.",
    accent: "lime",
    icon: Smartphone,
  },
  {
    title: "Конкуренти",
    description: "Бачите, коли конкурент змінює сайт або стає швидшим за вас — без ручного відвідування щодня.",
    span: "wide",
    accent: "cyan",
    icon: Flag,
  },
  {
    title: "White-label звіти",
    description: "Для агентств: PDF-звіти з вашим логотипом і брендом, а не з нашим.",
    accent: "lime",
    icon: FileText,
  },
  {
    title: "Telegram-алерти",
    description: "Сайт впав — повідомлення приходить за хвилину, не через годину, коли хтось випадково помітив.",
    accent: "cyan",
    icon: MessageCircle,
  },
];

function BentoTile({ tile }: { tile: Tile }) {
  const reduceMotion = useReducedMotion();
  const spanClass =
    tile.span === "wide" ? "sm:col-span-2" : tile.span === "tall" ? "sm:row-span-2" : "";

  const accentColor = tile.accent === "lime" ? "214, 255, 63" : "140, 246, 255";

  return (
    <motion.div
      className={`glow-card p-6 flex flex-col justify-between min-h-[180px] ${spanClass} group cursor-default`}
      whileHover={reduceMotion ? undefined : { scale: 1.02 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      style={{
        ["--tile-accent" as string]: accentColor,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 0 40px rgba(${accentColor}, 0.08), 0 0 80px rgba(${accentColor}, 0.04)`;
        e.currentTarget.style.borderColor = `rgba(${accentColor}, 0.25)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.06)";
      }}
    >
      <div>
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-display text-base font-medium text-[var(--text-primary)] group-hover:text-white transition-colors">
            {tile.title}
          </h3>
          <tile.icon
            className="h-5 w-5 opacity-60 group-hover:opacity-100 transition-opacity"
            strokeWidth={1.5}
            style={{ color: `rgb(${accentColor})` }}
          />
        </div>
        <p className="text-[13px] leading-relaxed text-[var(--text-secondary)]">
          {tile.description}
        </p>
      </div>
      <div className="mt-4 flex items-center gap-2">
        <div
          className="h-0.5 flex-1 rounded-full opacity-20 group-hover:opacity-40 transition-opacity"
          style={{ background: `rgb(${accentColor})` }}
        />
      </div>
    </motion.div>
  );
}

export function FeatureBento() {
  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              ✦ УСІ МОЖЛИВОСТІ
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            Один сервіс замість{" "}
            <span className="gradient-text">п&apos;яти різних вкладок</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 text-center text-[var(--text-secondary)] max-w-lg mx-auto">
            Усе, що потрібно для технічного здоров&apos;я сайту — в одному дашборді
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
