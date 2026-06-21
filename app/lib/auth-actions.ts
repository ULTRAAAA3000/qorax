"use server";

import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";

export async function signUp(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const fullName = formData.get("full_name") as string;

  if (!email || !password) {
    redirect(`/register?error=${encodeURIComponent("Заповніть усі поля")}`);
  }

  if (password.length < 8) {
    redirect(`/register?error=${encodeURIComponent("Пароль має бути мінімум 8 символів")}`);
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
    },
  });

  if (error) {
    if (error.message.includes("already registered")) {
      redirect(`/register?error=${encodeURIComponent("Цей email вже зареєстровано")}`);
    }
    redirect(`/register?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user) {
    redirect(`/register?error=${encodeURIComponent("Щось пішло не так, спробуйте ще раз")}`);
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

  redirect("/dashboard?welcome=1");
}

export async function signIn(formData: FormData) {
  const supabase = await createClient();

  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.includes("Invalid login credentials")) {
      redirect(`/login?error=${encodeURIComponent("Невірний email або пароль")}`);
    }
    redirect(`/login?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
