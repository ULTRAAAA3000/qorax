"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { driver, type DriveStep, type Driver } from "driver.js";
import "driver.js/dist/driver.css";
import { API_BASE_URL } from "@/app/lib/config";

// useProductTour — спільний движок інтерактивного туру по продуктах
// (Артем: "інтерактивний тур для новозареєстрованих... по кожному
// продукту" + "тег флажки типо тут це" — driver.js підсвічує реальні
// елементи DOM через CSS-селектори, не модальні слайди-скріншоти).
//
// Один хук переюзовується в усіх 5 продуктах (Dashboard/Mail/Creator/
// Office/Browser) — кожен продукт передає свій список кроків
// (TourStep[]), решта логіки (автозапуск при першому вході через
// /api/tours/seen, ручний перезапуск, позначення завершення) спільна.
//
// Стилізація driver.css перевизначена в globals.css під токени
// DESIGN_SYSTEM.md (lime акцент) — сам driver.js не знає про наші
// CSS-змінні, тому клас .qorax-tour-popover додається на кожен крок
// і решта стилів навішується через нього глобально.

export type TourProduct = "dashboard" | "mail" | "creator" | "office" | "browser";

export interface TourStep {
  /** CSS-селектор елемента для підсвітки. Якщо елемента немає на сторінці — крок пропускається (skipMissingElement). */
  element: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
}

async function getFreshToken(): Promise<string> {
  try {
    const { createClient } = await import("@/app/lib/supabase/client");
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) return session.access_token;
    const { data: refreshed } = await supabase.auth.refreshSession();
    return refreshed.session?.access_token ?? "";
  } catch {
    return "";
  }
}

async function fetchSeenTours(): Promise<Set<TourProduct>> {
  try {
    const token = await getFreshToken();
    if (!token) return new Set();
    const res = await fetch(`${API_BASE_URL}/api/tours/seen`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return new Set();
    const data = (await res.json()) as { seen?: string[] };
    return new Set((data.seen ?? []) as TourProduct[]);
  } catch {
    return new Set();
  }
}

async function markTourSeen(product: TourProduct): Promise<void> {
  try {
    const token = await getFreshToken();
    if (!token) return;
    await fetch(`${API_BASE_URL}/api/tours/seen`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ product }),
    });
  } catch {
    // best-effort — якщо не збереглось, тур просто покажеться ще раз
    // наступного разу, не критично
  }
}

function toDriveSteps(steps: TourStep[]): DriveStep[] {
  return steps.map(s => ({
    element: s.element,
    popover: {
      title: s.title,
      description: s.description,
      side: s.side ?? "bottom",
      align: "start",
      popoverClass: "qorax-tour-popover",
      nextBtnText: "Далі",
      prevBtnText: "Назад",
      doneBtnText: "Готово",
    },
  }));
}

interface UseProductTourResult {
  /** Викликати вручну — кнопка "Показати тур" в будь-якому продукті. */
  startTour: () => void;
  /** true, доки триває початкова перевірка "чи тур уже переглянутий" — щоб уникнути миготіння автозапуску. */
  loading: boolean;
}

export function useProductTour(product: TourProduct, steps: TourStep[]): UseProductTourResult {
  const [loading, setLoading] = useState(true);
  const driverRef = useRef<Driver | null>(null);
  const autoStartedRef = useRef(false);

  const runTour = useCallback(() => {
    if (steps.length === 0) return;
    const instance = driver({
      showProgress: true,
      progressText: "{{current}} з {{total}}",
      allowClose: true,
      overlayOpacity: 0.65,
      stagePadding: 6,
      stageRadius: 8,
      steps: toDriveSteps(steps),
      onDestroyed: () => {
        markTourSeen(product);
      },
    });
    driverRef.current = instance;
    instance.drive();
  }, [product, steps]);

  const startTour = useCallback(() => {
    runTour();
  }, [runTour]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const seen = await fetchSeenTours();
      if (cancelled) return;
      setLoading(false);

      if (!seen.has(product) && !autoStartedRef.current) {
        autoStartedRef.current = true;
        // Невелика затримка — даємо сторінці домалюватись (елементи
        // з TourStep[] мають реально існувати в DOM до старту driver.js,
        // інакше skipMissingElement мовчки пропустить крок).
        setTimeout(() => {
          if (!cancelled) runTour();
        }, 600);
      }
    })();

    return () => {
      cancelled = true;
      driverRef.current?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product]);

  return { startTour, loading };
}
