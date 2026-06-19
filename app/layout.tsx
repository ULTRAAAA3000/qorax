import type { Metadata } from "next";
import { Space_Grotesk, Inter, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display face — used with restraint for headlines and the signature numerals only.
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

// Body face — clean, modern, matches Raycast aesthetic.
const body = Inter({
  variable: "--font-body",
  subsets: ["latin", "latin-ext", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

// Utility face — for metrics, timestamps, anything tabular.
const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Qorax — технічний моніторинг сайтів для малого бізнесу",
  description:
    "Qorax стежить за швидкістю, безпекою та SEO вашого сайту, поки ви займаєтесь бізнесом. Безкоштовний аудит за 60 секунд.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="uk"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col noise-overlay">{children}</body>
    </html>
  );
}
