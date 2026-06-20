"use client";

import { useRef, useState, useCallback, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial, RoundedBox } from "@react-three/drei";
import * as THREE from "three";

/**
 * HeroGlassCube — a Raycast-style glass cube with a procedurally
 * animated, color-shifting core, refraction and chromatic aberration.
 * The cube rotates and drifts toward the cursor (eased, not 1:1) and
 * the inner shader cycles through the Qorax accent palette instead of
 * Raycast's red.
 *
 * Skipped entirely on touch devices and prefers-reduced-motion — a 3D
 * glass effect serves no purpose without a cursor, and WebGL has a real
 * performance/battery cost we shouldn't impose on a stated preference.
 */

// Procedural color-cycling core, ported in spirit from Raycast's cubeShader
// config (speed, four-color blend) but recolored to Qorax's lime/cyan/purple.
const coreVertexShader = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const coreFragmentShader = /* glsl */ `
  uniform float uTime;
  varying vec3 vPos;

  // Qorax palette: lime, cyan, deep violet, near-black
  vec3 color1 = vec3(0.84, 1.0, 0.247);   // #D6FF3F lime
  vec3 color2 = vec3(0.549, 0.965, 1.0);  // #8CF6FF cyan
  vec3 color3 = vec3(0.231, 0.012, 0.349); // deep violet
  vec3 color4 = vec3(0.027, 0.067, 0.118); // near-black navy

  void main() {
    float n = sin(vPos.x * 3.0 + uTime) * cos(vPos.y * 3.0 + uTime * 0.7) * sin(vPos.z * 3.0 + uTime * 0.5);
    n = n * 0.5 + 0.5;
    vec3 mixA = mix(color4, color3, smoothstep(0.0, 0.5, n));
    vec3 mixB = mix(color2, color1, smoothstep(0.4, 1.0, n));
    vec3 col = mix(mixA, mixB, smoothstep(0.3, 0.7, n));
    gl_FragColor = vec4(col, 1.0);
  }
`;

function GlassCubeScene({ pointer }: { pointer: React.RefObject<{ x: number; y: number }> }) {
  const groupRef = useRef<THREE.Group>(null);
  const coreMaterialRef = useRef<THREE.ShaderMaterial>(null);
  const currentRotation = useRef({ x: 0, y: 0 });

  useFrame((state, delta) => {
    if (coreMaterialRef.current) {
      coreMaterialRef.current.uniforms.uTime.value += delta * 0.4;
    }
    if (groupRef.current) {
      // Base idle spin, plus eased rotation toward pointer position —
      // mirrors Raycast's cubeInteraction.rotationInfluence.
      const targetX = pointer.current.y * 0.4;
      const targetY = pointer.current.x * 0.6 + state.clock.elapsedTime * 0.08;
      currentRotation.current.x += (targetX - currentRotation.current.x) * 0.04;
      currentRotation.current.y += (targetY - currentRotation.current.y) * 0.04;
      groupRef.current.rotation.x = currentRotation.current.x;
      groupRef.current.rotation.y = currentRotation.current.y;
    }
  });

  return (
    <group ref={groupRef} position={[0, 2.6, -4]} scale={1.1}>
      {/* Procedurally shaded core cube — the "cubeShader" layer */}
      <mesh scale={0.62}>
        <boxGeometry args={[1, 1, 1, 4, 4, 4]} />
        <shaderMaterial
          ref={coreMaterialRef}
          vertexShader={coreVertexShader}
          fragmentShader={coreFragmentShader}
          uniforms={{ uTime: { value: 0 } }}
        />
      </mesh>

      {/* Outer glass shell — transmission + chromatic aberration via drei */}
      <RoundedBox args={[1.05, 1.05, 1.05]} radius={0.08} smoothness={6}>
        <MeshTransmissionMaterial
          thickness={0.6}
          roughness={0.12}
          transmission={1}
          ior={1.4}
          chromaticAberration={0.025}
          anisotropy={0.2}
          distortion={0}
          temporalDistortion={0}
          samples={10}
          resolution={1024}
          background={new THREE.Color("#0c111d")}
        />
      </RoundedBox>
    </group>
  );
}

function SceneLights() {
  return (
    <>
      <ambientLight intensity={0.6} />
      <pointLight position={[3, 3, 3]} intensity={40} color="#d6ff3f" />
      <pointLight position={[-3, -2, 2]} intensity={30} color="#8cf6ff" />
    </>
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
        camera={{ position: [0, 0, 4.2], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: true }}
        style={{ pointerEvents: "auto", width: "100%", height: "100%", display: "block" }}
        resize={{ scroll: false, debounce: 0 }}
        onPointerMove={handlePointerMove}
      >
        <Suspense fallback={null}>
          <SceneLights />
          <GlassCubeScene pointer={pointer} />
        </Suspense>
      </Canvas>
    </div>
  );
}
