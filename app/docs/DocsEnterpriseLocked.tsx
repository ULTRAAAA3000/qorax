import Link from "next/link";
import { Lock } from "lucide-react";

/**
 * Показується ЗАМІСТЬ DocsArticleBody для isEnterpriseOnly-статей,
 * коли в юзера немає доступу (page.tsx, checkEnterpriseAccess) —
 * саме тіло MDX ніколи не потрапляє в рендер, тому недоступне навіть
 * через "показати код сторінки" (не просто приховане CSS-класом).
 */
export function DocsEnterpriseLocked({ title }: { title: string }) {
  return (
    <div
      className="rounded-xl p-8 text-center"
      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <Lock size={20} className="mx-auto mb-3" style={{ color: "var(--text-tertiary)" }} />
      <h2 className="font-display text-base font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
        {title}
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--text-secondary)" }}>
        Ця стаття доступна тільки на тарифі Enterprise.
      </p>
      <Link
        href="/dashboard/upgrade"
        className="inline-block glow-button text-sm !py-2 !px-5"
      >
        Дізнатись про Enterprise
      </Link>
    </div>
  );
}
