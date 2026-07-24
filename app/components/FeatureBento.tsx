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
  Sparkles,
  Users,
  Gift,
  Wrench,
} from "lucide-react";
import { Reveal } from "./Reveal";
import type { Locale } from "@/app/lib/i18n";

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

const ICONS = [ShieldCheck, Gauge, Link2, BarChart3, Smartphone, Flag, FileText, MessageCircle, Sparkles, Users, Gift, Wrench];
const SPANS: Array<Tile["span"]> = [undefined, "wide", undefined, undefined, undefined, "wide", undefined, undefined, "wide", undefined, undefined, undefined];
const ACCENTS: Array<Tile["accent"]> = ["lime", "cyan", "lime", "cyan", "lime", "cyan", "lime", "cyan", "lime", "cyan", "lime", "cyan"];

const TILE_TEXT: Record<Locale, Array<{ title: string; description: string }>> = {
  uk: [
    { title: "SSL та домен", description: "Алерт за 30 і 7 днів до закінчення — ніколи не дізнаєтесь про це з помилки в браузері клієнта." },
    { title: "Core Web Vitals", description: "LCP, INP, CLS — ті самі метрики, за якими Google ранжує швидкість вашого сайту." },
    { title: "Биті посилання", description: "Щотижневий обхід усіх сторінок сайту з переліком, що саме зламалось." },
    { title: "Google Search Console", description: "Клікі, показники, середня позиція — напряму з офіційного API Google, без скрейпінгу." },
    { title: "Мобільна версія", description: "Viewport, читабельність тексту, розмір тап-таргетів — усе, що Google перевіряє для mobile-first індексації." },
    { title: "Конкуренти", description: "Бачите, коли конкурент змінює сайт або стає швидшим за вас — без ручного відвідування щодня." },
    { title: "White-label звіти", description: "Для агентств: PDF-звіти з вашим логотипом і брендом, а не з нашим." },
    { title: "Telegram-алерти", description: "Сайт впав — повідомлення приходить за хвилину, не через годину, коли хтось випадково помітив." },
    { title: "Qoraxus AI-чат", description: "Запитайте прямо в дашборді: «чому сайт повільний» — і отримайте відповідь з конкретним планом дій." },
    { title: "Команда та ролі", description: "Запросіть колег чи клієнта з правами owner, admin, editor або viewer — кожен бачить те, що потрібно." },
    { title: "Партнерська програма", description: "25% комісії з кожного клієнта, якого ви привели — фрілансерам і студіям, що рекомендують Qorax." },
    { title: "Заявка на виправлення", description: "Знайшли проблему, а виправити нема часу? Одна кнопка — і ми беремось за це самі." },
  ],
  en: [
    { title: "SSL and domain", description: "Alerts 30 and 7 days before expiry — you'll never find out from an error in a client's browser." },
    { title: "Core Web Vitals", description: "LCP, INP, CLS — the exact metrics Google uses to rank your site's speed." },
    { title: "Broken links", description: "A weekly crawl of every page on your site, listing exactly what broke." },
    { title: "Google Search Console", description: "Clicks, impressions, average position — straight from Google's official API, no scraping." },
    { title: "Mobile version", description: "Viewport, text readability, tap-target size — everything Google checks for mobile-first indexing." },
    { title: "Competitors", description: "See the moment a competitor changes their site or gets faster than you — no manual daily checks." },
    { title: "White-label reports", description: "For agencies: PDF reports with your logo and brand, not ours." },
    { title: "Telegram alerts", description: "Site goes down — you're notified within a minute, not an hour later when someone happens to notice." },
    { title: "Qoraxus AI chat", description: "Ask right in the dashboard: \u201Cwhy is the site slow\u201D — and get an answer with a concrete action plan." },
    { title: "Team and roles", description: "Invite colleagues or clients as owner, admin, editor, or viewer — everyone sees exactly what they need." },
    { title: "Partner program", description: "25% commission on every client you bring — for freelancers and studios that recommend Qorax." },
    { title: "Fix requests", description: "Found a problem but no time to fix it? One button — and we handle it ourselves." },
  ],
};

function tilesFor(lang: Locale): Tile[] {
  return TILE_TEXT[lang].map((t, i) => ({ ...t, span: SPANS[i], accent: ACCENTS[i], icon: ICONS[i] }));
}

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

const COPY: Record<Locale, { badge: string; titleStart: string; titleGradient: string; subtitle: string }> = {
  uk: { badge: "✦ УСІ МОЖЛИВОСТІ", titleStart: "Один сервіс замість ", titleGradient: "п'яти різних вкладок", subtitle: "Технічний стан, AI-аналіз, команда та партнерство — все, що потрібно для росту в одному дашборді" },
  en: { badge: "✦ ALL FEATURES", titleStart: "One service instead of ", titleGradient: "five different tabs", subtitle: "Technical health, AI analysis, team, and partnerships — everything you need to grow, in one dashboard" },
};

export function FeatureBento({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const tiles = tilesFor(lang);

  return (
    <section className="relative">
      <div className="gradient-divider" />
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-20 sm:py-24">
        <Reveal>
          <div className="text-center mb-4">
            <span className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-mono text-[var(--text-tertiary)]"
              style={{ background: "rgba(255, 255, 255, 0.04)", border: "1px solid rgba(255, 255, 255, 0.08)" }}>
              {t.badge}
            </span>
          </div>
        </Reveal>
        <Reveal delay={0.04}>
          <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-semibold text-center max-w-2xl mx-auto leading-tight">
            {t.titleStart}
            <span className="gradient-text">{t.titleGradient}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="mt-4 text-center text-[var(--text-secondary)] max-w-lg mx-auto">
            {t.subtitle}
          </p>
        </Reveal>

        <div className="mt-14 grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tiles.map((tile, i) => (
            <Reveal key={tile.title} delay={Math.min(i * 0.04, 0.2)} className={tile.span === "wide" ? "sm:col-span-2" : ""}>
              <BentoTile tile={tile} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
