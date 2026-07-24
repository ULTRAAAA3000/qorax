import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://qorax.mrcru96.workers.dev";

export const metadata: Metadata = {
  title: "Qorax",
  metadataBase: new URL(SITE_URL),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // x-locale виставляється middleware.ts на основі шляху (/en/... =
  // "en"). Єдиний спосіб дати правильний <html lang> сторінкам /en
  // без переписування всього App Router дерева на [locale]-сегмент.
  const h = await headers();
  const locale = h.get("x-locale") === "en" ? "en" : "uk";
  return <html lang={locale}><body>{children}</body></html>;
}
