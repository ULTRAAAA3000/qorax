"use client";

import { createContext, useContext, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";

// ToastProvider — глобальна toast-система (Артем: "мікроанімації...
// красиві toast-уведомлення" — остання, четверта фаза мікроанімацій).
// Замінює alert() (2 місця) і частину inline-помилок для дій-мутацій
// (створено/збережено/видалено/помилка) короткочасними спливаючими
// повідомленнями замість постійного тексту на екрані. Той самий
// easing/підхід, що вже прийнятий для AnimatedModalOverlay/
// AnimatedDropdown (fade+y, [0.16, 1, 0.3, 1]) — консистентність з
// попередніми фазами мікроанімацій.
//
// НЕ замінює inline-валідацію форм (наприклад "Опишіть проблему" під
// текстовим полем) — та прив'язана до конкретного поля вводу і має
// лишатись видимою, доки людина не виправить, toast для миттєвих
// подій це не замінить.

export type ToastVariant = "success" | "error" | "info";

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;

const VARIANT_CONFIG: Record<ToastVariant, { icon: typeof CheckCircle2; color: string; bg: string; border: string }> = {
  success: { icon: CheckCircle2, color: "var(--lime)", bg: "rgba(214,255,63,0.08)", border: "rgba(214,255,63,0.25)" },
  error: { icon: XCircle, color: "#F5675A", bg: "rgba(245,103,90,0.08)", border: "rgba(245,103,90,0.25)" },
  info: { icon: Info, color: "var(--cyan)", bg: "rgba(140,246,255,0.08)", border: "rgba(140,246,255,0.25)" },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const reduceMotion = useReducedMotion();

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
  }, []);

  const showToast = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    setToasts(prev => [...prev, { id, message, variant }]);
    const timeout = setTimeout(() => dismissToast(id), TOAST_DURATION_MS);
    timeoutsRef.current.set(id, timeout);
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none"
        style={{ maxWidth: "min(380px, calc(100vw - 40px))" }}
      >
        <AnimatePresence>
          {toasts.map(toast => {
            const config = VARIANT_CONFIG[toast.variant];
            const Icon = config.icon;
            return (
              <motion.div
                key={toast.id}
                role="status"
                className="pointer-events-auto flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-sm shadow-lg"
                style={{ background: "#141416", border: `1px solid ${config.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}
                initial={reduceMotion ? undefined : { opacity: 0, y: 12, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? undefined : { opacity: 0, x: 40, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              >
                <Icon size={16} className="shrink-0 mt-0.5" style={{ color: config.color }} />
                <p className="flex-1 text-[var(--text-secondary)] leading-snug">{toast.message}</p>
                <button
                  onClick={() => dismissToast(toast.id)}
                  className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                  aria-label="Закрити"
                >
                  <X size={14} />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/**
 * useToast — hook для показу toast-повідомлень з будь-якого client-
 * компонента під ToastProvider (кореневий layout.tsx). Приклади:
 * showToast("Сайт додано", "success"), showToast("Не вдалося
 * зберегти", "error").
 */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Фолбек замість кидання помилки — якщо десь провайдер випадково
    // відсутній (наприклад ізольований тест), toast просто мовчки
    // не покажеться, а не зламає рендер сторінки.
    return { showToast: () => {} };
  }
  return ctx;
}
