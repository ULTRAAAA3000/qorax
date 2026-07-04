import { createClient } from "@/app/lib/supabase/server";
import { QoraxLogo } from "@/app/components/QoraxLogo";
import Link from "next/link";
import { InviteAcceptClient } from "./InviteAcceptClient";

export const metadata = { title: "Запрошення — Qorax" };

const ROLE_LABELS: Record<string, string> = {
  admin: "Адміністратор",
  editor: "Редактор",
  viewer: "Перегляд",
};

async function fetchInvitePreview(token: string) {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";
  try {
    const resp = await fetch(`${apiUrl}/api/invite/${token}`, { cache: "no-store" });
    if (!resp.ok) {
      const data = await resp.json().catch(() => null);
      return { error: data?.error ?? "Запрошення не знайдено" };
    }
    return await resp.json() as { email: string; role: string; organizationName: string };
  } catch {
    return { error: "Не вдалося перевірити запрошення" };
  }
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await fetchInvitePreview(token);

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-10">
          <Link href="/"><QoraxLogo size="md" animated /></Link>
        </div>

        <div className="rounded-2xl border hairline bg-[var(--bg-raised)] p-8">
          {"error" in invite ? (
            <div className="text-center">
              <h1 className="font-display text-xl font-semibold mb-2">Запрошення недійсне</h1>
              <p className="text-sm text-[var(--text-tertiary)]">{invite.error}</p>
              <Link href="/login" className="inline-block mt-6 text-sm text-[var(--cyan)] hover:opacity-80 transition-opacity">
                Перейти до входу →
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-display text-xl font-semibold mb-1.5">Запрошення до команди</h1>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed mb-6">
                Вас запрошено приєднатись до <strong style={{ color: "var(--text-primary)" }}>{invite.organizationName}</strong> з
                роллю <strong style={{ color: "var(--cyan)" }}>{ROLE_LABELS[invite.role] ?? invite.role}</strong>.
              </p>
              <InviteAcceptClient
                token={token}
                inviteEmail={invite.email}
                isLoggedIn={!!user}
                loggedInEmail={user?.email ?? null}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
