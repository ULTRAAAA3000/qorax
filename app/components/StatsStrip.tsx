import { Reveal } from "./Reveal";

/**
 * StatsStrip — real market figures from our research, presented as a
 * dense data row (Raycast/Linear style: numbers as the visual, not
 * illustrations of numbers).
 */

const STATS = [
  { value: "$4.06B", label: "ринок обслуговування сайтів у 2025" },
  { value: "61%", label: "компаній вже передають це на аутсорс" },
  { value: "43%", label: "кібератак спрямовані на малий бізнес" },
  { value: "3–10×", label: "дешевше за середній аутсорс ($500/міс)" },
];

export function StatsStrip() {
  return (
    <section className="border-t hairline">
      <div className="mx-auto max-w-6xl px-6 sm:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 sm:gap-6">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delay={i * 0.05}>
              <div className="font-mono text-2xl sm:text-3xl tabular text-[var(--text-primary)] mb-1.5">
                {stat.value}
              </div>
              <div className="text-xs sm:text-[13px] text-[var(--text-tertiary)] leading-snug max-w-[150px]">
                {stat.label}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
