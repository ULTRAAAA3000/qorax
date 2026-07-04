"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/app/lib/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "https://qorax-api.mrcru96.workers.dev";

interface Props {
  token: string;
  inviteEmail: string;
  isLoggedIn: boolean;
  loggedInEmail: string | null;
}

export function InviteAcceptClient({ token, inviteEmail, isLoggedIn, loggedInEmail }: Props) {
  const router = useRouter();
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const emailMatches = isLoggedIn && loggedInEmail?.toLowerCase() === inviteEmail.toLowerCase();

  async function handleAccept() {
    setAccepting(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token_ = session?.access_token;
      if (!token_) {
        setError("Сесія закінчилась, увійдіть ще раз");
        return;
      }
      const resp = await fetch(`${API_URL}/api/team/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token_}` },
        body: JSON.stringify({ token }),
      });
      const data = await resp.json() as { ok?: boolean; error?: string };
      if (resp.ok && data.ok) {
        setDone(true);
        setTimeout(() => router.push("/dashboard"), 1200);
      } else {
        setError(data.error ?? "Не вдалося прийняти запрошення");
      }
    } catch {
      setError("Помилка мережі");
    } finally {
      setAccepting(false);
    }
  }

  if (done) {
    return (
      <div className="text-center py-4">
        <CheckCircle2 size={28} className="mx-auto mb-2" style={{ color: "var(--lime)" }} />
        <p className="text-sm text-[var(--text-secondary)]">Готово! Переходимо до дашборду...</p>
      </div>
    );
  }

  // Залогінений під правильним email — просто кнопка "Прийняти"
  if (emailMatches) {
    return (
      <div>
        {error && <p className="text-xs mb-3" style={{ color: "#F5675A" }}>{error}</p>}
        <button
          onClick={handleAccept}
          disabled={accepting}
          className="w-full rounded-xl py-3.5 font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: "var(--lime)", color: "#0c111d" }}
        >
          {accepting && <Loader2 size={14} className="animate-spin" />}
          {accepting ? "Приєднання..." : "Прийняти запрошення"}
        </button>
      </div>
    );
  }

  // Залогінений під ІНШИМ email — конфлікт
  if (isLoggedIn && !emailMatches) {
    return (
      <div>
        <p className="text-sm mb-4" style={{ color: "#F5A623" }}>
          Ви увійшли як <strong>{loggedInEmail}</strong>, а запрошення адресоване <strong>{inviteEmail}</strong>.
          Вийдіть і увійдіть під потрібним акаунтом.
        </p>
        <Link href={`/login?redirect=/invite/${token}`}
          className="block text-center w-full rounded-xl py-3.5 font-medium text-sm"
          style={{ background: "var(--lime)", color: "#0c111d" }}>
          Увійти під іншим акаунтом
        </Link>
      </div>
    );
  }

  // Не залогінений — форма реєстрації/входу з передзаповненим email
  return (
    <div className="space-y-3">
      <Link
        href={`/register?invite_email=${encodeURIComponent(inviteEmail)}`}
        className="block text-center w-full rounded-xl py-3.5 font-medium text-sm"
        style={{ background: "var(--lime)", color: "#0c111d" }}
      >
        Створити акаунт і приєднатись
      </Link>
      <p className="text-center text-sm text-[var(--text-tertiary)]">
        Вже маєте акаунт?{" "}
        <Link href={`/login?redirect=/invite/${token}`} className="text-[var(--cyan)] hover:opacity-80 transition-opacity">
          Увійти
        </Link>
      </p>
    </div>
  );
}
