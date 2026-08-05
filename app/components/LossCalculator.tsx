"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { AuditForm } from "./AuditForm";
import { AuditResultPanel } from "./AuditResultPanel";
import type { AuditSuccessResult } from "../lib/audit";
import type { Locale } from "@/app/lib/i18n";

/**
 * LossCalculator — обгортає AuditForm і додає до звичної панелі
 * результатів audit'у великий грошовий акцент: скільки клієнт
 * втрачає що­місяця й за рік через знайдені проблеми сайту
 * (totalEstimatedMonthlyLossUsd — агрегат ВСІХ findings з backend,
 * включно зі скритими за лід-магніт лімітом; сам зміст скритих
 * findings лишається прихованим, видно лише підсумкове число).
 *
 * Задумано для секції лендингу типу "Loss Calculator" — той самий
 * технічний потік що AuditForm (той самий /api/audit), інша подача:
 * не "ось що не так на сайті", а "ось скільки це коштує щомісяця".
 * Тому AuditForm рендериться з hideResultPanel — дублювання
 * AuditResultPanel в обидвох місцях не потрібне, LossCalculator сам
 * вирішує порядок (гроші спершу, деталі нижче).
 */

const COPY: Record<
  Locale,
  {
    eyebrow: string;
    zeroTitle: string;
    zeroSubtitle: string;
    lossLabel: string;
    perMonth: string;
    perYear: string;
    yearLabel: string;
    cta: string;
    ctaSubtext: string;
    detailsToggle: string;
  }
> = {
  uk: {
    eyebrow: "Калькулятор втрат",
    zeroTitle: "Сайт клієнта не втрачає гроші",
    zeroSubtitle: "Жодних критичних проблем не знайдено — сайт у хорошому стані.",
    lossLabel: "Клієнт втрачає щомісяця",
    perMonth: "/міс",
    perYear: "/рік",
    yearLabel: "За рік це",
    cta: "Продавати моніторинг цьому клієнту",
    ctaSubtext: "Покажіть це число клієнту — і запропонуйте $30-100/міс за те, щоб проблеми виправлялись, а не накопичувались.",
    detailsToggle: "Показати деталі проблем",
  },
  en: {
    eyebrow: "Loss Calculator",
    zeroTitle: "This site isn't losing money",
    zeroSubtitle: "No critical issues found — the site is in good shape.",
    lossLabel: "This client is losing",
    perMonth: "/mo",
    perYear: "/yr",
    yearLabel: "Over a year, that's",
    cta: "Sell monitoring to this client",
    ctaSubtext: "Show them this number — then offer $30-100/mo to keep issues fixed instead of piling up.",
    detailsToggle: "Show issue details",
  },
};

function formatUsd(n: number): string {
  return `$${n.toLocaleString("en-US")}`;
}

export function LossCalculator({ lang = "uk" }: { lang?: Locale }) {
  const t = COPY[lang];
  const [result, setResult] = useState<AuditSuccessResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  return (
    <div className="w-full max-w-xl">
      <div className="flex justify-center">
        <AuditForm lang={lang} onResult={setResult} hideResultPanel />
      </div>

      <AnimatePresence mode="wait">
        {result && (
          <motion.div
            key={result.url}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-6"
          >
            {result.totalEstimatedMonthlyLossUsd > 0 ? (
              <div
                className="rounded-2xl border hairline overflow-hidden"
                style={{
                  background:
                    "radial-gradient(ellipse at top, rgba(255, 107, 61, 0.08), transparent 60%)",
                }}
              >
                <div className="px-6 sm:px-8 py-8 text-center">
                  <p className="font-mono text-xs tracking-wide text-[var(--text-tertiary)] mb-3">
                    {t.eyebrow.toUpperCase()}
                  </p>
                  <p className="text-sm text-[var(--text-secondary)] mb-1">
                    {t.lossLabel}
                  </p>
                  <div className="flex items-baseline justify-center gap-1.5 mb-2">
                    <span
                      className="font-display text-5xl sm:text-6xl font-bold tabular"
                      style={{ color: "#FF6B3D" }}
                    >
                      {formatUsd(result.totalEstimatedMonthlyLossUsd)}
                    </span>
                    <span className="text-lg text-[var(--text-tertiary)]">{t.perMonth}</span>
                  </div>
                  <p className="text-sm text-[var(--text-tertiary)]">
                    {t.yearLabel}{" "}
                    <span className="font-mono text-[var(--text-secondary)]">
                      {formatUsd(result.totalEstimatedMonthlyLossUsd * 12)}
                      {t.perYear}
                    </span>
                  </p>
                </div>

                <div className="px-6 sm:px-8 py-5 border-t hairline bg-[var(--bg-raised)] text-center">
                  <a href="#plans" className="glow-button justify-center w-full sm:w-auto">
                    {t.cta}
                  </a>
                  <p className="mt-3 text-xs text-[var(--text-tertiary)] max-w-sm mx-auto leading-relaxed">
                    {t.ctaSubtext}
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border hairline bg-[var(--bg-raised)] px-6 py-8 text-center">
                <p className="text-base font-medium text-[var(--text-primary)] mb-1">
                  {t.zeroTitle}
                </p>
                <p className="text-sm text-[var(--text-secondary)]">{t.zeroSubtitle}</p>
              </div>
            )}

            <div className="mt-4 text-center">
              <button
                onClick={() => setShowDetails((v) => !v)}
                className="text-xs font-mono text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
              >
                {showDetails ? "▲" : "▼"} {t.detailsToggle}
              </button>
            </div>

            {showDetails && <AuditResultPanel result={result} lang={lang} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
