import { signUp } from "@/app/lib/auth-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";

export const metadata = {
  title: "Реєстрація — Qorax",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; plan?: string; invite_email?: string }>;
}) {
  const { error, plan, invite_email: inviteEmail } = await searchParams;
  const errorMsg = error && typeof error === "string" && error !== "{}" ? error : null;

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
            Створити акаунт
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mb-7">
            Безкоштовно. Без карти.
          </p>

          {inviteEmail && (
            <div className="rounded-xl px-4 py-3 mb-5 text-sm"
              style={{ background: "rgba(140,246,255,0.08)", border: "1px solid rgba(140,246,255,0.3)" }}>
              <span style={{ color: "var(--cyan)" }} className="font-medium">Запрошення до команди</span>
              {" "}— створіть акаунт на {inviteEmail}, щоб приєднатись.
            </div>
          )}

          {plan && !inviteEmail && (
            <div className="rounded-xl px-4 py-3 mb-5 text-sm"
              style={{ background: "rgba(214,255,63,0.08)", border: "1px solid rgba(214,255,63,0.25)" }}>
              <span style={{ color: "var(--lime)" }} className="font-medium">
                План {plan.charAt(0).toUpperCase() + plan.slice(1)}
              </span>
              {" "}— після реєстрації одразу перейдете до оплати.
            </div>
          )}

          {errorMsg && (
            <div
              className="rounded-xl px-4 py-3 mb-5 text-sm"
              style={{
                background: "rgba(245,103,90,0.1)",
                border: "1px solid rgba(245,103,90,0.3)",
                color: "#F5675A",
              }}
            >
              {errorMsg}
            </div>
          )}

          <form action={signUp} className="space-y-4">
            {plan && <input type="hidden" name="plan" value={plan} />}
            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1.5 font-mono tracking-wide">
                ІМ&apos;Я
              </label>
              <input
                name="full_name"
                type="text"
                placeholder="Ваше ім'я"
                className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
                style={{ transitionDuration: "180ms" }}
              />
            </div>

            <div>
              <label className="block text-xs text-[var(--text-tertiary)] mb-1.5 font-mono tracking-wide">
                EMAIL
              </label>
              <input
                name="email"
                type="email"
                required
                defaultValue={inviteEmail ?? undefined}
                readOnly={!!inviteEmail}
                placeholder="you@example.com"
                className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors disabled:opacity-70"
                style={{ transitionDuration: "180ms", opacity: inviteEmail ? 0.7 : 1 }}
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
                placeholder="Мінімум 8 символів"
                className="w-full rounded-xl border hairline bg-[var(--bg)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--cyan)] transition-colors"
                style={{ transitionDuration: "180ms" }}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl py-3.5 font-medium text-sm mt-2"
              style={{ background: "var(--lime)", color: "#0c111d" }}
            >
              Створити акаунт
            </button>
          </form>

          <p className="text-center text-xs text-[var(--text-tertiary)] mt-4 leading-relaxed">
            Реєструючись, ви погоджуєтесь з{" "}
            <Link href="/terms" className="text-[var(--cyan)] hover:opacity-80 transition-opacity">
              Умовами використання
            </Link>{" "}
            та{" "}
            <Link href="/privacy" className="text-[var(--cyan)] hover:opacity-80 transition-opacity">
              Політикою конфіденційності
            </Link>
          </p>
        </div>

        <p className="text-center text-sm text-[var(--text-tertiary)] mt-5">
          Вже маєте акаунт?{" "}
          <Link
            href="/login"
            className="text-[var(--cyan)] hover:opacity-80 transition-opacity"
          >
            Увійти
          </Link>
        </p>
      </div>
    </div>
  );
}
