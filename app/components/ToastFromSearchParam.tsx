"use client";

import { useEffect, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useToast, type ToastVariant } from "@/app/components/ToastProvider";

// ToastFromSearchParam — міст між Server Actions (форми з action={...},
// що редіректять назад з ?error=... при помилці) і toast-системою.
// Показує toast один раз при монтуванні, потім чистить query param з
// URL (щоб toast не з'являвся повторно при рефреші сторінки).
interface Props {
  param: string;
  variant?: ToastVariant;
}

export function ToastFromSearchParam({ param, variant = "error" }: Props) {
  const { showToast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const shownRef = useRef(false);

  useEffect(() => {
    if (shownRef.current) return;
    const url = new URL(window.location.href);
    const value = url.searchParams.get(param);
    if (!value) return;

    shownRef.current = true;
    showToast(decodeURIComponent(value), variant);

    url.searchParams.delete(param);
    router.replace(`${pathname}${url.search}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
