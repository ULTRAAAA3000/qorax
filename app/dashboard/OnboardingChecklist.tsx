"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X, ChevronDown, ChevronUp, Plus, Activity, Bell } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

interface OnboardingStep {
  key: string;
  label: string;
  description: string;
  done: boolean;
  href?: string;
  icon: React.ReactNode;
}

interface Props {
  organizationId: string;
  steps: {
    hasSite: boolean;
    hasFirstCheck: boolean;
    hasEmailAlert: boolean;
  };
}

export function OnboardingChecklist({ organizationId, steps }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissing, setDismissing] = useState(false);

  if (dismissed) return null;

  const checklistSteps: OnboardingStep[] = [
    {
      key: "site",
      label: "Додайте перший сайт",
      description: "Вкажіть URL — і Qorax почне стежити за ним",
      done: steps.hasSite,
      href: steps.hasSite ? undefined : "/dashboard/sites/new",
      icon: <Plus size={14} />,
    },
    {
      key: "check",
      label: "Дочекайтесь першої перевірки",
      description: "Перша uptime-перевірка запускається автоматично протягом кількох хвилин",
      done: steps.hasFirstCheck,
      icon: <Activity size={14} />,
    },
    {
      key: "alert",
      label: "Email-алерти готові",
      description: "Ми надішлемо лист якщо сайт стане недоступний",
      done: steps.hasEmailAlert,
      href: steps.hasEmailAlert ? "/dashboard/settings" : "/dashboard/settings",
      icon: <Bell size={14} />,
    },
  ];

  const doneCount = checklistSteps.filter(s => s.done).length;
  const allDone = doneCount === checklistSteps.length;

  async function handleDismiss() {
    setDismissing(true);
    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("organizations")
        .update({ onboarding_dismissed: true })
        .eq("id", organizationId);
      if (error) {
        // RLS може заборонити не-власникам — все одно ховаємо локально
        // для цієї сесії, щоб не блокувати юзера.
        console.warn("Could not persist onboarding dismissal:", error.message);
      }
    } catch {
      // ignore — ховаємо локально нижче в будь-якому випадку
    } finally {
      setDismissing(false);
      setDismissed(true);
    }
  }

  return (
    <div className="rounded-2xl p-5" style={{ background: "rgba(214,255,63,0.03)", border: "1px solid rgba(214,255,63,0.12)" }}>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => setCollapsed(c => !c)}
          className="flex items-center gap-3 min-w-0 flex-1 text-left"
        >
          <div className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: "rgba(214,255,63,0.1)", border: "1px solid rgba(214,255,63,0.2)" }}>
            <span className="text-xs font-bold" style={{ color: "var(--lime)" }}>{doneCount}/{checklistSteps.length}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">
              {allDone ? "Налаштування завершено 🎉" : "Перші кроки з Qorax"}
            </p>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">
              {allDone ? "Все готово — моніторинг активний" : "Виконайте кілька кроків щоб все запрацювало"}
            </p>
          </div>
          {collapsed ? <ChevronDown size={16} className="shrink-0 text-[var(--text-tertiary)]" /> : <ChevronUp size={16} className="shrink-0 text-[var(--text-tertiary)]" />}
        </button>
        <button
          onClick={handleDismiss}
          disabled={dismissing}
          className="shrink-0 h-7 w-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5 disabled:opacity-50"
          title="Приховати"
          aria-label="Приховати чек-лист"
        >
          <X size={14} className="text-[var(--text-tertiary)]" />
        </button>
      </div>

      {!collapsed && (
        <div className="mt-4 space-y-2">
          {checklistSteps.map(step => {
            const content = (
              <div
                className="flex items-center gap-3 rounded-xl px-3.5 py-3 transition-colors"
                style={{
                  background: step.done ? "rgba(214,255,63,0.04)" : "rgba(255,255,255,0.02)",
                  border: `1px solid ${step.done ? "rgba(214,255,63,0.15)" : "rgba(255,255,255,0.06)"}`,
                }}
              >
                <div
                  className="shrink-0 h-6 w-6 rounded-full flex items-center justify-center"
                  style={{
                    background: step.done ? "var(--lime)" : "rgba(255,255,255,0.06)",
                    color: step.done ? "#0a0a0a" : "var(--text-tertiary)",
                  }}
                >
                  {step.done ? <Check size={13} /> : step.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="text-sm font-medium"
                    style={{
                      color: step.done ? "var(--text-secondary)" : "var(--text-primary)",
                      textDecoration: step.done ? "line-through" : "none",
                    }}
                  >
                    {step.label}
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{step.description}</p>
                </div>
              </div>
            );

            return step.href && !step.done ? (
              <Link key={step.key} href={step.href} className="block">
                {content}
              </Link>
            ) : (
              <div key={step.key}>{content}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
