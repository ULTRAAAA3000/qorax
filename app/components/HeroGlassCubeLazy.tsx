"use client";

import dynamic from "next/dynamic";

// Three.js + @react-three/fiber + drei are heavy (~250kb+) and only matter
// for desktop pointer interaction — loaded lazily, client-only, so they
// never block the landing page's first paint or run during SSR. The
// dynamic() call with ssr:false must live in a Client Component.
const HeroGlassCube = dynamic(
  () => import("./HeroGlassCube").then((mod) => mod.HeroGlassCube),
  { ssr: false }
);

export function HeroGlassCubeLazy() {
  return <HeroGlassCube />;
}
