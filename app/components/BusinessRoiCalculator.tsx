"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { Locale } from "@/app/lib/i18n";

/**
 * BusinessRoiCalculator — новий інтерактивний віджет (немає в коді
 * до цього проходу, PRICING.md Частина 0 п.5 плану). Клієнтський,
 * без бекенду: два слайдери ("скільки клієнтів студії/фрілансера
 * на retainer" × "скільки бере з кожного клієнта на місяць") →
 * чистий прибуток після вирахування вартості Qorax-тарифу, який
 * автоматично підбирається під кількість клієнтів (1 клієнт = 1
 * сайт на моніторингу).
 *
 * Тарифи хардкоджені за ФІНАЛЬНИМ рішенням PRICING.md Частина 0
 * (серпень 2026) — Free/Starter $29(3)/Growth $79(10)/Agency
 * $179(30) — НЕ за застарілою сіткою $12.99/$24.99/$59.99 з
 * /pricing (Частина A, скасована, ще не приведена в код на момент
 * цього проходу).
 */

const TIERS = [
  { name: "Free", priceUsd: 0, maxSites: 1 },
  { name: "Starter", priceUsd: 29, maxSites: 3 },
  { name: "Growth", priceUsd: 79, maxSites: 10 },
  { name: "Agency", priceUsd: 179, maxSites: 30 },
] as const;

function tierForClients(clients: number) {
  return TIERS.find((t) => clients <= t.maxSites) ?? TIERS[TIERS.length - 1];
}

const COPY: Record<
  Locale,
  {
    eyebrow: string;
    title: string;
    clientsLabel: (n: number) => string;
    retainerLabel: (n: number) => string;
    revenueLabel: string;
    costLabel: string;
    profitLabel: string;
    perMonth: string;
    tierNote: (tier: string, price: number) => string;
    overCapacity: string;
  }
> = {
  uk: {
    eyebrow: "ROI-калькулятор",
    title: "Скільки можна заробити на retainer-моделі",
    clientsLabel: (n) => `Клієнтів на моніторингу: ${n}`,
    retainerLabel: (n) => `Ціна для клієнта: $${n}/міс`,
    revenueLabel: "Дохід від клієнтів",
    costLabel: "Вартість Qorax",
    profitLabel: "Чистий прибуток",
    perMonth: "/міс",
    tierNote: (tier, price) => `Тариф ${tier} ($${price}/міс) покриває цю кількість сайтів`,
    overCapacity: "Понад максимум — потрібен окремий тариф, зв'яжіться з нами",
  },
  en: {
    eyebrow: "ROI Calculator",
    title: "What the retainer model could earn you",
    clientsLabel: (n) => `Clients on monitoring: ${n}`,
    retainerLabel: (n) => `Price per client: $${n}/mo`,
    revenueLabel: "Revenue from clients",
    costLabel: "Qorax cost",
    profitLabel: "Net profit",
    perMonth: "/mo",
    tierNote: (tier, price) => `${tier} plan ($${price}/mo) covers this many sites`,
    overCapacity: "Above max — needs a custom plan, contact us",
  },
};

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function BusinessRoiCalculator({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const [clients, setClients] = useState(10);
  const [retainer, setRetainer] = useState(50);

  const { revenue, cost, profit, tier, overCapacity } = useMemo(() => {
    const revenue = clients * retainer;
    const maxTier = TIERS[TIERS.length - 1];
    const overCapacity = clients > maxTier.maxSites;
    const tier = tierForClients(clients);
    const cost = overCapacity ? maxTier.priceUsd : tier.priceUsd;
    const profit = revenue - cost;
    return { revenue, cost, profit, tier: overCapacity ? maxTier : tier, overCapacity };
  }, [clients, retainer]);

  return (
    <div className="w-full max-w-xl rounded-2xl border hairline bg-[var(--bg-raised)] overflow-hidden">
      <div className="px-6 sm:px-8 py-6 border-b hairline">
        <p className="font-mono text-xs tracking-wide text-[var(--text-tertiary)] mb-2">
          {t.eyebrow.toUpperCase()}
        </p>
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t.title}</h3>
      </div>

      <div className="px-6 sm:px-8 py-6 space-y-6">
        <SliderField
          label={t.clientsLabel(clients)}
          value={clients}
          min={1}
          max={30}
          step={1}
          onChange={setClients}
        />
        <SliderField
          label={t.retainerLabel(retainer)}
          value={retainer}
          min={30}
          max={100}
          step={5}
          onChange={setRetainer}
        />
      </div>

      <div className="grid grid-cols-3 divide-x divide-[var(--border-hairline)] border-t hairline">
        <ResultCell label={t.revenueLabel} value={formatUsd(revenue)} tone="neutral" suffix={t.perMonth} />
        <ResultCell label={t.costLabel} value={`−${formatUsd(cost)}`} tone="neutral" suffix={t.perMonth} />
        <ResultCell label={t.profitLabel} value={formatUsd(profit)} tone="profit" suffix={t.perMonth} />
      </div>

      <div className="px-6 sm:px-8 py-4 bg-[var(--bg-raised-2)]">
        <p className="text-xs text-[var(--text-tertiary)] font-mono">
          {overCapacity ? t.overCapacity : t.tierNote(tier.name, tier.priceUsd)}
        </p>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div>
      <label className="flex items-center justify-between mb-3">
        <span className="text-sm text-[var(--text-secondary)]">{label}</span>
      </label>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="roi-slider w-full"
        style={{
          background: `linear-gradient(to right, var(--lime) ${pct}%, rgba(255,255,255,0.1) ${pct}%)`,
        }}
      />
    </div>
  );
}

function ResultCell({
  label,
  value,
  suffix,
  tone,
}: {
  label: string;
  value: string;
  suffix: string;
  tone: "neutral" | "profit";
}) {
  return (
    <div className="px-4 sm:px-6 py-5 text-center">
      <motion.div
        key={value}
        initial={{ opacity: 0.4 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="font-mono text-base sm:text-lg tabular mb-1"
        style={{ color: tone === "profit" ? "var(--lime)" : "var(--text-primary)" }}
      >
        {value}
        <span className="text-xs text-[var(--text-tertiary)]">{suffix}</span>
      </motion.div>
      <div className="text-[11px] sm:text-xs text-[var(--text-tertiary)]">{label}</div>
    </div>
  );
}
