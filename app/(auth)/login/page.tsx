import { signIn } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";

export const metadata = {
  title: "Вхід — Qorax",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <Link href="/">
            <QoraxLogo size="md" animated />
          </Link>
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-8">
          <h1 className="font-display text-2xl font-semibold mb-1">
            Увійти в Qorax
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-7">
            Ваш дашборд чекає.
          </p>

          {error && (
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm"
              style={{
                background: "rgba(245,103,90,0.1)",
                border: "1px solid rgba(245,103,90,0.3)",
                color: "#F5675A",
              }}
            >
              {error}
            </div>
          )}

          <form action={signIn} className="space-y-4">
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1.5 font-mono tracking-wide">
                EMAIL
              </label>
              <input
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
                style={{ transitionDuration: "180ms" }}
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1.5 font-mono tracking-wide">
                ПАРОЛЬ
              </label>
              <input
                name="password"
                type="password"
                required
                placeholder="••••••••"
                autoComplete="current-password"
                className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
                style={{ transitionDuration: "180ms" }}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl py-3.5 font-medium text-sm mt-2"
              style={{ background: "var(--lime)", color: "#0c111d" }}
            >
              Увійти
            </button>
          </form>
        </div>

        <p className="text-center text-sm text-[var(--text-tertiary)] mt-5">
          Ще немає акаунту?{" "}
          <Link
            href="/register"
            className="text-[var(--cyan)] hover:opacity-80 transition-opacity"
          >
            Зареєструватись
          </Link>
        </p>
      </div>
    </div>
  );
}
