"use client";

import dynamic from "next/dynamic";

// Canvas-ефект завантажується тільки на клієнті (no SSR)
const HeroGlassCube = dynamic(
  () => import("./HeroGlassCube").then((mod) => mod.HeroGlassCube),
  { ssr: false }
);

export function HeroGlassCubeLazy() {
  return <HeroGlassCube />;
}
