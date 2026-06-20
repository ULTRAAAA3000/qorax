import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { redirect, notFound } from "next/navigation";

export const metadata = {
  title: "Сайт — Qorax",
};

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // RLS гарантує, що користувач отримає сайт лише якщо він належить
  // до тієї ж organization — не потрібно додатково перевіряти власника тут.
  const { data: site } = await supabase
    .from("sites")
    .select("id, url, display_name, platform, monitoring_enabled, check_interval_minutes, created_at")
    .eq("id", id)
    .single();

  if (!site) notFound();

  const hostname = new URL(site.url).hostname;
  const addedDate = new Date(site.created_at).toLocaleDateString("uk-UA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <header className="border-b hairline">
        <div className="mx-auto max-w-6xl px-6 sm:px-8 h-16 flex items-center justify-between">
          <QoraxLogo size="sm" />
          <Link
            href="/dashboard"
            className="text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            ← Назад до дашборду
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 sm:px-8 py-10">
        <div className="flex items-center gap-3 mb-1">
          <div
            className="h-2.5 w-2.5 rounded-full shrink-0"
            style={{
              background: site.monitoring_enabled ? "var(--lime)" : "var(--text-tertiary)",
            }}
          />
          <h1 className="font-display text-2xl font-semibold">{site.display_name}</h1>
        </div>
        <p className="text-sm font-mono text-[var(--text-tertiary)] mb-8">{hostname}</p>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-8 mb-6">
          <div className="grid sm:grid-cols-3 gap-6 text-sm">
            <div>
              <div className="text-[var(--text-tertiary)] mb-1">Адреса</div>
              <div className="font-mono break-all">{site.url}</div>
            </div>
            <div>
              <div className="text-[var(--text-tertiary)] mb-1">Перевірка кожні</div>
              <div>{site.check_interval_minutes} хв</div>
            </div>
            <div>
              <div className="text-[var(--text-tertiary)] mb-1">Додано</div>
              <div>{addedDate}</div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-12 text-center">
          <div className="font-mono text-4xl mb-4 text-[var(--text-tertiary)]">⊡</div>
          <h2 className="font-display text-lg font-medium mb-2">Детальний моніторинг у розробці</h2>
          <p className="text-sm text-[var(--text-secondary)] max-w-md mx-auto">
            Графіки швидкості, Core Web Vitals, SSL та інші перевірки з&apos;являться тут
            найближчим часом.
          </p>
        </div>
      </main>
    </div>
  );
}
