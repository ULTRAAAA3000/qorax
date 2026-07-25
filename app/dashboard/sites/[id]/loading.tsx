import { SkeletonBlock } from "@/app/components/Skeleton";

// loading.tsx для /dashboard/sites/[id] — той самий Suspense-механізм,
// що dashboard/loading.tsx. Ця сторінка робить кілька Supabase-запитів
// (site, uptime_checks, core_web_vitals_checks, ai_insights тощо) —
// skeleton показує загальну форму (breadcrumb + метрики + вкладки),
// не намагаючись точно відтворити кожен віджет.
export default function SiteDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-8 py-8 space-y-6">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-4 w-16" />
      </div>

      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <SkeletonBlock className="h-6 w-48" />
          <SkeletonBlock className="h-3.5 w-64" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
          <SkeletonBlock className="h-8 w-8 rounded-lg" />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl p-4 space-y-2" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
            <SkeletonBlock className="h-3 w-20" />
            <SkeletonBlock className="h-6 w-16" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl p-5 space-y-3" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)" }}>
        <SkeletonBlock className="h-4 w-32" />
        <SkeletonBlock className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
