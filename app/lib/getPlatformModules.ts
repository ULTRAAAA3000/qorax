import { createClient } from "@/app/lib/supabase/server";

export type PlatformModule = {
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  href: string;
  status: "live" | "coming_soon" | "hidden";
};

/**
 * Список модулів платформи для sidebar, з урахуванням organization_module_access:
 * якщо для організації є явний оверрайд (enabled=true), модуль показується
 * як "live" незалежно від глобального статусу (ранній доступ для бета-тестерів).
 * enabled=false — модуль ховається навіть якщо глобально live.
 * Модулі зі статусом 'hidden' не показуються нікому, окрім явного enabled=true оверрайду.
 */
export async function getPlatformModules(organizationId: string | null): Promise<PlatformModule[]> {
  const supabase = await createClient();

  const [{ data: modules }, { data: overrides }] = await Promise.all([
    supabase
      .from("platform_modules")
      .select("key, label, description, icon, href, status")
      .order("sort_order", { ascending: true }),
    organizationId
      ? supabase
          .from("organization_module_access")
          .select("module_key, enabled")
          .eq("organization_id", organizationId)
      : Promise.resolve({ data: [] as { module_key: string; enabled: boolean }[] }),
  ]);

  const overrideByKey = new Map((overrides ?? []).map(o => [o.module_key, o.enabled]));

  return (modules ?? [])
    .map(m => {
      const override = overrideByKey.get(m.key);
      let status = m.status as PlatformModule["status"];
      if (override === true) status = "live";
      if (override === false) status = "hidden";
      return { ...m, status };
    })
    .filter(m => m.status !== "hidden");
}
