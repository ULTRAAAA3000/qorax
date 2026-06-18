import type { NextConfig } from "next";

// Серверный рендеринг (не output: "export") — нужен для middleware
// проверки сессии Supabase Auth на защищённых маршрутах /dashboard/*.
// Деплоится на Cloudflare через @opennextjs/cloudflare адаптер.
const nextConfig: NextConfig = {
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
