import { addSite } from "@/app/lib/site-actions";
import Link from "next/link";

export const metadata = {
  title: "Додати сайт — Qorax",
};

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="mb-8">
        <Link
          href="/dashboard"
          className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
        >
          ← Назад до дашборду
        </Link>
      </div>

      <h1 className="font-display text-2xl font-semibold mb-2">
        Додати сайт
      </h1>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Qorax почне стежити за цим сайтом одразу після додавання.
      </p>

      {error && (
        <div
          className="rounded-xl px-4 py-3 mb-6 text-sm"
          style={{
            background: "rgba(245,103,90,0.1)",
            border: "1px solid rgba(245,103,90,0.3)",
            color: "#F5675A",
          }}
        >
          {error}
        </div>
      )}

      <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-7">
        <form action={addSite} className="space-y-5">
          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1.5 font-mono tracking-wide">
              АДРЕСА САЙТУ *
            </label>
            <input
              name="url"
              type="text"
              required
              placeholder="https://вашсайт.com.ua"
              className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
              style={{ transitionDuration: "180ms" }}
            />
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              Можна без https:// — ми додамо автоматично
            </p>
          </div>

          <div>
            <label className="block text-xs text-[var(--text-tertiary)] mb-1.5 font-mono tracking-wide">
              НАЗВА (НЕОБОВ&apos;ЯЗКОВО)
            </label>
            <input
              name="display_name"
              type="text"
              placeholder="Наприклад: Мій магазин"
              className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
              style={{ transitionDuration: "180ms" }}
            />
            <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
              Якщо не заповнити — використаємо домен сайту
            </p>
          </div>

          <button
            type="submit"
            className="w-full rounded-xl py-3.5 font-medium text-sm"
            style={{ background: "var(--lime)", color: "#0c111d" }}
          >
            Додати і почати моніторинг
          </button>
        </form>
      </div>
    </div>
  );
}
