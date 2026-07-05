"use server";

import { createClient } from "@/app/lib/supabase/server";
import { redirect } from "next/navigation";

export async function addSite(formData: FormData) {
  const supabase = await createClient();

  // Отримуємо поточного користувача
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const url = formData.get("url") as string;
  const displayName = formData.get("display_name") as string;

  if (!url) {
    redirect(`/dashboard/sites/new?error=${encodeURIComponent("Вкажіть адресу сайту")}`);
  }

  // Нормалізуємо URL
  let normalizedUrl = url.trim();
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  try {
    new URL(normalizedUrl);
  } catch {
    redirect(`/dashboard/sites/new?error=${encodeURIComponent("Невірний формат адреси сайту")}`);
  }

  // Знаходимо organization поточного користувача
  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    redirect(
      `/dashboard/sites/new?error=${encodeURIComponent("Організацію не знайдено — зверніться до підтримки")}`
    );
  }

  // Перевіряємо ліміт сайтів (plan-based)
  const { count: siteCount } = await supabase
    .from("sites")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", membership.organization_id);

  const { data: org } = await supabase
    .from("organizations")
    .select("site_limit")
    .eq("id", membership.organization_id)
    .single();

  if (siteCount !== null && org && siteCount >= org.site_limit) {
    redirect(
      `/dashboard/sites/new?error=${encodeURIComponent(
        `Досягнуто ліміт сайтів (${org.site_limit}). Оновіть план для додавання більше сайтів`
      )}`
    );
  }

  // Додаємо сайт
  const { data: site, error } = await supabase
    .from("sites")
    .insert({
      organization_id: membership.organization_id,
      url: normalizedUrl,
      display_name: displayName || new URL(normalizedUrl).hostname,
      monitoring_enabled: true,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to add site:", error.message);
    redirect(`/dashboard/sites/new?error=${encodeURIComponent("Не вдалося додати сайт, спробуйте ще раз")}`);
  }

  // Одразу запускаємо першу uptime-перевірку замість очікування cron
  // (до 5 хв) — новий юзер бачить результат моніторингу відразу після
  // додавання сайту, а не порожній дашборд. Чекаємо максимум 4с: якщо
  // перевірка не встигла — не страшно, cron підхопить сайт за 5 хв.
  // await з timeout, а не fire-and-forget без await, тому що serverless
  // рантайм може обірвати необачений fetch одразу після redirect().
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      const workerUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 4000);
      await fetch(`${workerUrl}/api/sites/${site.id}/run-uptime-check`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        signal: controller.signal,
      }).catch(() => { /* best-effort — cron підхопить за 5 хв в будь-якому разі */ });
      clearTimeout(timeout);
    }
  } catch { /* best-effort */ }

  redirect(`/dashboard?site=${site.id}&new=1`);
}
