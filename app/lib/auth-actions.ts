"use server";

import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { buildWelcomeEmail } from "@/app/lib/onboarding-email";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;
  const plan = formData.get("plan") as string | null;

  console.log("[signUp] email:", email, "password length:", password?.length, "plan:", plan, "all keys:", [...formData.keys()]);

  // plan передається з лендингу коли юзер натискає на конкретний тариф
  // після реєстрації редіректимо одразу на checkout цього плану
  const planParam = plan && ["starter", "growth", "agency"].includes(plan)
    ? `?plan=${plan}`
    : "";

  if (!email || !password) {
    const missing = !email ? "email" : "пароль";
    const back = plan ? `/register?plan=${plan}&error=` : "/register?error=";
    redirect(`${back}${encodeURIComponent(`Поле ${missing} порожнє`)}`);
  }

  if (password.length < 8) {
    const back = plan ? `/register?plan=${plan}&error=` : "/register?error=";
    redirect(`${back}${encodeURIComponent("Пароль має бути мінімум 8 символів")}`);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        // Реф-код зберігається в cookie при переході по /r/:code (30 днів,
        // див. app/r/[code]/route.ts). handle_new_user() в БД шукає
        // організацію з таким referral_code і проставляє атрибуцію.
        referral_code: (await cookies()).get("qorax_ref")?.value ?? null,
      },
    },
  });

  if (error) {
    const back = plan ? `/register?plan=${plan}&error=` : "/register?error=";
    console.error("[signUp] auth error:", {
      message: error.message,
      status: error.status,
      name: error.name,
      full: JSON.stringify(error),
    });
    if (error.message?.includes?.("already registered") || error.message?.includes?.("already been registered")) {
      redirect(`${back}${encodeURIComponent("Цей email вже зареєстровано")}`);
    }
    // error.message може бути об'єктом або порожнім — stringify для надійності
    const rawMsg = typeof error.message === "string" && error.message
      ? error.message
      : JSON.stringify(error.message) !== "{}"
        ? JSON.stringify(error.message)
        : null;
    const displayMsg = rawMsg || `Помилка реєстрації (код: ${error.status ?? "unknown"})`;
    redirect(`${back}${encodeURIComponent(displayMsg)}`);
  }

  if (!data.user) {
    const back = plan ? `/register?plan=${plan}&error=` : "/register?error=";
    redirect(`${back}${encodeURIComponent("Щось пішло не так, спробуйте ще раз")}`);
  }

  // Organization + organization_member створюються автоматично тригером
  // handle_new_user() в БД (див. migrations/0014) — він спрацьовує при
  // INSERT в auth.users і не залежить від того, чи є клієнтська сесія.
  // Раніше це робилося тут вручну через anon-клієнта, але якщо в Supabase
  // Auth увімкнено підтвердження email, signUp() не відкриває сесію одразу
  // (data.session === null), і insert падав без помилки через RLS —
  // organization просто не створювалась. Тригер у БД не залежить від цього.

  if (!data.session) {
    // Підтвердження email увімкнено — сесії ще немає, редірект на
    // /dashboard тут безглуздий: middleware однаково поверне на /login.
    redirect(
      `/login?info=${encodeURIComponent(
        "Перевірте пошту та підтвердіть email, щоб увійти"
      )}`
    );
  }

  // Welcome email — fire and forget, не блокуємо редірект
  // Обгортаємо в try-catch щоб будь-яка помилка (включно з buildWelcomeEmail)
  // не зламала реєстрацію користувача
  try {
    const firstName = fullName?.split(" ")[0] || email.split("@")[0];
    buildWelcomeEmail({
      firstName,
      email,
      dashboardUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev"}/dashboard`,
    }).then(({ subject, html }) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.RESEND_API_KEY ?? ""}`,
        },
        body: JSON.stringify({
          from: "Qorax <onboarding@resend.dev>",
          to: [email],
          subject,
          html,
        }),
      })
    ).catch((e) => console.error("[signUp] welcome email failed:", e));
  } catch (e) {
    console.error("[signUp] buildWelcomeEmail threw:", e);
  }

  // Якщо юзер прийшов з лендингу з конкретним планом —
  // показуємо welcome + підказку про план, але не форсуємо редірект на upgrade.
  // Юзер сам натисне кнопку в дашборді.
  if (planParam) {
    redirect(`/dashboard?welcome=1${planParam}`);
  }

  redirect("/dashboard?welcome=1");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const redirectTo = formData.get("redirect") as string | null;
  // Дозволяємо редірект тільки на внутрішні шляхи (захист від open redirect)
  // Дефолт — /dashboard/home (нова Головна), НЕ /dashboard (Audit).
  // Артем: "надо как то сделать чтоб была главная связующая страница".
  // Реєстрація (signUp нижче) свідомо НЕ змінена — onboarding-чеклист
  // після welcome=1 прив'язаний саме до /dashboard (Audit).
  const safeRedirect = redirectTo && redirectTo.startsWith("/") && !redirectTo.startsWith("//")
    ? redirectTo
    : "/dashboard/home";

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const back = redirectTo ? `&redirect=${encodeURIComponent(redirectTo)}` : "";
    if (error.message.includes("Invalid login credentials")) {
      redirect(`/login?error=${encodeURIComponent("Невірний email або пароль")}${back}`);
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}${back}`);
  }

  redirect(safeRedirect);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
