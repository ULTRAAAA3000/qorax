"use client";

import { ErrorDisplay } from "@/app/components/ErrorDisplay";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorDisplay error={error} reset={reset} context="/dashboard" />;
}
