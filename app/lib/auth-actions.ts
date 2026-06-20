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

  // Після реєстрації — створюємо organization та прив'язуємо користувача
  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: fullName || email.split("@")[0],
      org_type: "client",
      site_limit: 1,
    })
    .select("id")
    .single();

  if (orgError || !org) {
    console.error("Failed to create organization on signup:", orgError?.message);
    redirect("/dashboard?welcome=1");
  }

  // Прив'язуємо користувача до організації як власника
  const { error: memberError } = await supabase
    .from("organization_members")
    .insert({
      organization_id: org.id,
      user_id: data.user.id,
      role: "owner",
    });

  if (memberError) {
    console.error("Failed to create organization member:", memberError.message);
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
