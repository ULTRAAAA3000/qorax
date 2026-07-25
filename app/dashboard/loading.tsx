import { SkeletonSiteList, SkeletonBlock } from "@/app/components/Skeleton";

// loading.tsx — нативний Next.js App Router механізм: автоматично
// показується під час навігації на /dashboard, поки server component
// (page.tsx) чекає на паралельні Supabase-запити (org/subscription/
// sites/profile). Жодного client-side state не потрібно — сам файл
// у файловій структурі маршруту вмикає Suspense boundary.
export default function DashboardLoading() {
  return (
    <div className="flex" style={{ minHeight: "100vh", background: "var(--bg)" }}>
      {/* Сайдбар-заглушка */}
      <aside className="w-56 shrink-0 hidden lg:flex flex-col px-2 py-4" style={{ borderRight: "1px solid rgba(255,255,255,0.06)" }}>
        <div className="space-y-1.5 px-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-8 w-full" />
          ))}
        </div>
      </aside>

      <main className="flex-1 min-w-0 mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <SkeletonBlock className="h-6 w-40" />
          <SkeletonBlock className="h-9 w-32 rounded-xl" />
        </div>
        <SkeletonSiteList count={4} />
      </main>
    </div>
  );
}
