"use client";

import { useEffect, useRef } from "react";

/**
 * HeroAtmosphere — Raycast-inspired animated gradient orbs.
 * Multiple overlapping radial gradients with slow floating animation
 * create a living, breathing background. A soft cursor-reactive spotlight
 * and subtle orb parallax add depth on pointer movement (desktop only —
 * skipped entirely for touch devices and reduced-motion preference).
 */

export function HeroAtmosphere() {
  const containerRef = useRef<HTMLDivElement>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const orbLimeRef = useRef<HTMLDivElement>(null);
  const orbCyanRef = useRef<HTMLDivElement>(null);
  const orbPurpleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Skip on touch devices and when the user prefers reduced motion —
    // a cursor-reactive effect has no meaning on touch and shouldn't
    // override an explicit motion preference.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
    if (prefersReducedMotion || isTouchDevice) return;

    let targetX = 0.5;
    let targetY = 0.5;
    let currentX = 0.5;
    let currentY = 0.5;
    let rafId: number;

    // Listen on the parent <section> (closest positioned ancestor), not the
    // background layer itself — the background stays pointer-events-none so
    // it never intercepts clicks on the Hero's actual content.
    const sectionEl = container.parentElement;

    const handlePointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      targetX = (e.clientX - rect.left) / rect.width;
      targetY = (e.clientY - rect.top) / rect.height;
    };

    // Smooth easing toward the cursor target each frame — avoids jittery
    // 1:1 tracking and reads as a gentle, intentional drift.
    const animate = () => {
      currentX += (targetX - currentX) * 0.06;
      currentY += (targetY - currentY) * 0.06;

      if (spotlightRef.current) {
        spotlightRef.current.style.background = `radial-gradient(600px circle at ${currentX * 100}% ${currentY * 100}%, rgba(214, 255, 63, 0.05), transparent 70%)`;
      }
      if (orbLimeRef.current) {
        orbLimeRef.current.style.transform = `translate(${(currentX - 0.5) * 40}px, ${(currentY - 0.5) * 40}px)`;
      }
      if (orbCyanRef.current) {
        orbCyanRef.current.style.transform = `translate(${(currentX - 0.5) * -30}px, ${(currentY - 0.5) * -30}px)`;
      }
      if (orbPurpleRef.current) {
        orbPurpleRef.current.style.transform = `translate(${(currentX - 0.5) * 20}px, ${(currentY - 0.5) * -20}px)`;
      }

      rafId = requestAnimationFrame(animate);
    };

    sectionEl?.addEventListener("pointermove", handlePointerMove);
    rafId = requestAnimationFrame(animate);

    return () => {
      sectionEl?.removeEventListener("pointermove", handlePointerMove);
      cancelAnimationFrame(rafId);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="absolute inset-0 -z-10 overflow-hidden pointer-events-none"
    >
      {/* Dot grid texture */}
      <div className="absolute inset-0 bg-grid opacity-40" />

      {/* Cursor-reactive spotlight — subtle, fades in only on pointer movement */}
      <div ref={spotlightRef} className="absolute inset-0 transition-opacity duration-500" />

      {/* Primary lime orb — top left */}
      <div
        ref={orbLimeRef}
        className="absolute -top-32 -left-16 h-[600px] w-[600px] animate-float-slow will-change-transform"
        style={{
          background:
            "radial-gradient(closest-side, rgba(214, 255, 63, 0.10), transparent 70%)",
          filter: "blur(80px)",
          transition: "transform 0.1s linear",
        }}
      />

      {/* Cyan orb — top right */}
      <div
        ref={orbCyanRef}
        className="absolute -top-20 right-[-5%] h-[550px] w-[550px] animate-float-slow-reverse will-change-transform"
        style={{
          background:
            "radial-gradient(closest-side, rgba(140, 246, 255, 0.08), transparent 70%)",
          filter: "blur(80px)",
          transition: "transform 0.1s linear",
        }}
      />

      {/* Purple orb — center */}
      <div
        ref={orbPurpleRef}
        className="absolute top-[40%] left-[35%] h-[400px] w-[400px] animate-float-slow will-change-transform"
        style={{
          background:
            "radial-gradient(closest-side, rgba(191, 90, 242, 0.06), transparent 70%)",
          filter: "blur(100px)",
          transition: "transform 0.1s linear",
        }}
      />

      {/* Bottom fade-out mask */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to bottom, transparent 0%, transparent 60%, var(--bg) 100%)",
        }}
      />
    </div>
  );
}
