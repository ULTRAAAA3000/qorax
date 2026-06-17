import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Display face — used with restraint for headlines and the signature numerals only.
const display = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

// Body face — neutral, highly legible at small sizes, distinct from the display face.
const body = IBM_Plex_Sans({
  variable: "--font-body",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
});

// Utility face — for metrics, timestamps, anything tabular. Matches the dashboard subject matter.
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
