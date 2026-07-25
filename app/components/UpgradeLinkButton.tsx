"use client";

import Link from "next/link";
import { Crown } from "lucide-react";

// UpgradeLinkButton — портативна кнопка "Тарифи" для шапки будь-якого
// продукту (Mail/Creator/Office/Browser), той самий патерн, що
// TourButton поруч (розміщується поряд з ним у кожній шапці).
// Веде на /<product>/upgrade — окрему сторінку вибору тарифу,
// паралельну до вже наявної /dashboard/upgrade для Business.

interface Props {
  href: string;
  className?: string;
}

export function UpgradeLinkButton({ href, className }: Props) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg transition-colors hover:bg-white/5 ${className ?? ""}`}
      style={{ color: "var(--text-tertiary)", border: "1px solid rgba(255,255,255,0.08)" }}
      title="Тарифи"
    >
      <Crown size={13} style={{ color: "var(--lime)" }} />
      Тарифи
    </Link>
  );
}
