"use client";

import { HelpCircle } from "lucide-react";

// TourButton — "прапорець" для ручного перезапуску туру (Артем:
// "надо сделать возможность запустить его снова вдруг ты что то
// забыл"). Портативний компонент, той самий патерн, що
// TelegramConnectButton — вставляється в шапку будь-якого продукту.

interface Props {
  onStart: () => void;
  className?: string;
}

export function TourButton({ onStart, className }: Props) {
  return (
    <button
      onClick={onStart}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/5 ${className ?? ""}`}
      style={{ color: "var(--text-tertiary)", border: "1px solid rgba(255,255,255,0.08)" }}
      title="Показати тур ще раз"
    >
      <HelpCircle size={13} />
      Тур
    </button>
  );
}
