import { createClient } from "@/app/lib/supabase/server";
import { addSite } from "@/app/lib/site-actions";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Globe, Tag } from "lucide-react";

export const metadata = { title: "Додати сайт — Qorax" };

export default async function NewSitePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", user.id)
    .single();

  const [orgResult, siteCountResult] = await Promise.all([
    membership
      ? supabase.from("organizations").select("name, site_limit, org_type").eq("id", membership.organization_id).single()
      : Promise.resolve({ data: null }),
    membership
      ? supabase.from("sites").select("*", { count: "exact", head: true }).eq("organization_id", membership.organization_id)
      : Promise.resolve({ count: 0 }),
  ]);

  const org = orgResult.data;
  const siteCount = siteCountResult.count ?? 0;
  const siteLimit = org?.site_limit ?? 1;
  const atLimit = siteCount >= siteLimit;
  const isAgency = org?.org_type === "agency";

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Navbar */}
      <header className="sticky top-0 z-40"
        style={{
          background: "rgba(10,10,10,0.8)",
          backdropFilter: "blur(20px) saturate(160%)",
          WebkitBackdropFilter: "blur(20px) saturate(160%)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/"><QoraxLogo size="sm" /></Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <Link href="/dashboard"
              className="flex items-center gap-1.5 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors">
              <ArrowLeft size={13} /> Дашборд
            </Link>
            <span style={{ color: "rgba(255,255,255,0.12)" }}>/</span>
            <span className="text-sm text-[var(--text-primary)]">Новий сайт</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-6 sm:px-8 py-10">

        {/* Header */}
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold mb-1">Додати сайт</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Qorax почне моніторинг одразу після додавання.
          </p>
        </div>

        {/* Site usage for agency */}
        {isAgency && (
          <div className="rounded-xl px-4 py-3 mb-5 flex items-center justify-between"
            style={{ background: "rgba(140,246,255,0.04)", border: "1px solid rgba(140,246,255,0.12)" }}>
            <span className="text-sm text-[var(--text-secondary)]">
              Сайти агентства
            </span>
            <span className="text-sm font-mono" style={{ color: "var(--cyan)" }}>
              {siteCount} / {siteLimit}
            </span>
          </div>
        )}

        {/* At limit */}
        {atLimit ? (
          <div className="rounded-2xl p-6 text-center"
            style={{ background: "rgba(245,103,90,0.04)", border: "1px solid rgba(245,103,90,0.2)" }}>
            <p className="text-sm font-semibold mb-2" style={{ color: "#F5675A" }}>
              Ліміт сайтів досягнуто ({siteLimit})
            </p>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              {isAgency
                ? "Додаткові сайти для Agency — $29/міс кожен. Зверніться до підтримки."
                : "Перейдіть на Agency для моніторингу до 5 сайтів."}
            </p>
            <Link href="/dashboard/upgrade"
              className="inline-block text-sm font-semibold px-6 py-2.5 rounded-xl hover:opacity-80 transition-opacity"
              style={{ background: "var(--lime)", color: "#0a0a0a" }}>
              {isAgency ? "Зв'язатись з підтримкою" : "Перейти на Agency →"}
            </Link>
          </div>
        ) : (
          <div className="rounded-2xl p-6"
            style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>

            {error && (
              <div className="rounded-xl px-4 py-3 mb-5 text-sm"
                style={{ background: "rgba(245,103,90,0.08)", border: "1px solid rgba(245,103,90,0.2)", color: "#F5675A" }}>
                {error}
              </div>
            )}

            <form action={addSite} className="space-y-5">
              {/* URL */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-tertiary)] mb-2 tracking-wide">
                  <Globe size={11} /> АДРЕСА САЙТУ *
                </label>
                <input
                  name="url"
                  type="text"
                  required
                  placeholder="https://вашсайт.com.ua"
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                  onFocus={undefined}
                />
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  Можна без https:// — додамо автоматично
                </p>
              </div>

              {/* Display name */}
              <div>
                <label className="flex items-center gap-1.5 text-xs font-mono text-[var(--text-tertiary)] mb-2 tracking-wide">
                  <Tag size={11} /> НАЗВА (НЕОБОВ&apos;ЯЗКОВО)
                </label>
                <input
                  name="display_name"
                  type="text"
                  placeholder={isAgency ? "Назва клієнта" : "Наприклад: Мій магазин"}
                  className="w-full rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none transition-colors"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.1)",
                  }}
                />
                <p className="mt-1.5 text-xs text-[var(--text-tertiary)]">
                  {isAgency ? "Ім'я клієнта для зручності" : "Якщо не заповнити — використаємо домен"}
                </p>
              </div>

              <button
                type="submit"
                className="w-full rounded-xl py-3.5 font-semibold text-sm transition-opacity hover:opacity-90"
                style={{ background: "var(--lime)", color: "#0c111d" }}
              >
                Додати і почати моніторинг →
              </button>
            </form>
          </div>
        )}

        {/* Info for agency about multi-site */}
        {isAgency && !atLimit && (
          <div className="mt-5 rounded-xl px-4 py-3"
            style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}>
            <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
              <span style={{ color: "var(--cyan)" }}>Agency план:</span>{" "}
              до {siteLimit} сайтів клієнтів. White-label PDF звіти — ваш брендинг замість Qorax.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
