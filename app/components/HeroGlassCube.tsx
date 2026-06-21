"use client";

import { useRef, useState, useCallback, useMemo, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial } from "@react-three/drei";
import * as THREE from "three";

/**
 * HeroGlassCube — Raycast-style glass "bars": a row of vertical glass
 * cylinders that refract and chromatically shift the colorful background
 * (HeroAtmosphere) behind them as the cursor moves. This mirrors Raycast's
 * actual hero scene (16 vertical cylinders, not a solid cube — see their
 * page_hero "cylinder" config: count 16, radius 0.5, height 15) rather than
 * a single rotating box.
 *
 * Skipped entirely on touch devices and prefers-reduced-motion — a WebGL
 * refraction effect serves no purpose without a cursor and has a real
 * performance/battery cost we shouldn't impose on a stated preference.
 */

const CYLINDER_COUNT = 16;
const CYLINDER_RADIUS = 0.5;
const CYLINDER_HEIGHT = 15;

function GlassBars({ pointer }: { pointer: React.RefObject<{ x: number; y: number }> }) {
  const groupRef = useRef<THREE.Group>(null);
  const currentRotation = useRef({ x: 0, y: 0 });
  const currentOffset = useRef({ x: 0, y: 0 });

  // Evenly spaced vertical cylinders along X, mirroring Raycast's row of bars.
  const positions = useMemo(() => {
    const spacing = 1.35;
    const totalWidth = (CYLINDER_COUNT - 1) * spacing;
    return Array.from({ length: CYLINDER_COUNT }, (_, i) => i * spacing - totalWidth / 2);
  }, []);

  useFrame(() => {
    if (!groupRef.current) return;

    // Gentle rotation + translation toward the cursor — mirrors Raycast's
    // cubeInteraction (rotationInfluence 0.3, translationInfluence 0.2).
    const targetRotX = pointer.current.y * 0.12;
    const targetRotY = pointer.current.x * 0.18;
    currentRotation.current.x += (targetRotX - currentRotation.current.x) * 0.04;
    currentRotation.current.y += (targetRotY - currentRotation.current.y) * 0.04;
    groupRef.current.rotation.x = currentRotation.current.x;
    groupRef.current.rotation.y = currentRotation.current.y + 0.73; // glassRotation base offset

    const targetOffsetX = pointer.current.x * 0.6;
    const targetOffsetY = pointer.current.y * 0.3;
    currentOffset.current.x += (targetOffsetX - currentOffset.current.x) * 0.04;
    currentOffset.current.y += (targetOffsetY - currentOffset.current.y) * 0.04;
    groupRef.current.position.x = currentOffset.current.x;
    groupRef.current.position.y = currentOffset.current.y;
  });

  return (
    <group ref={groupRef} position={[0, 0, -9]}>
      {positions.map((x, i) => (
        <mesh key={i} position={[x, 0, 0]}>
          <cylinderGeometry
            args={[CYLINDER_RADIUS, CYLINDER_RADIUS, CYLINDER_HEIGHT, 8, 1, true]}
          />
          <MeshTransmissionMaterial
            thickness={1}
            roughness={0.35}
            transmission={1}
            ior={1.5}
            chromaticAberration={3}
            anisotropy={2.88}
            distortion={0}
            temporalDistortion={0}
            samples={6}
            resolution={1024}
            background={new THREE.Color("#0c111d")}
          />
        </mesh>
      ))}
    </group>
  );
}

export function HeroGlassCube() {
  const pointer = useRef({ x: 0, y: 0 });
  const [enabled, setEnabled] = useState<boolean | null>(null);

  // Decide once on mount whether the effect should run at all.
  if (enabled === null && typeof window !== "undefined") {
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    setEnabled(!prefersReducedMotion && !isTouchDevice);
  }

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    pointer.current = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: ((e.clientY - rect.top) / rect.height) * 2 - 1,
    };
  }, []);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      onPointerMove={handlePointerMove}
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 0 }}
    >
      <Canvas
        camera={{ position: [0, 0, 16.54], fov: 35, near: 0.1, far: 100 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: "auto", width: "100%", height: "100%", display: "block" }}
        resize={{ scroll: false, debounce: 0 }}
        onPointerMove={handlePointerMove}
      >
        <Suspense fallback={null}>
          <GlassBars pointer={pointer} />
        </Suspense>
      </Canvas>
    </div>
  );
}
