"use client";

/**
 * HeroAtmosphere — Raycast-inspired animated gradient orbs.
 * Multiple overlapping radial gradients with slow floating animation
 * create a living, breathing background. Static dot-grid adds texture.
 */

export function HeroAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 -z-10 overflow-hidden pointer-events-none"
    >
      {/* Dot grid texture */}
      <div className="absolute inset-0 bg-grid opacity-40" />

      {/* Primary lime orb — top left */}
      <div
        className="absolute -top-32 -left-16 h-[600px] w-[600px] animate-float-slow"
        style={{
          background:
            "radial-gradient(closest-side, rgba(214, 255, 63, 0.10), transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Cyan orb — top right */}
      <div
        className="absolute -top-20 right-[-5%] h-[550px] w-[550px] animate-float-slow-reverse"
        style={{
          background:
            "radial-gradient(closest-side, rgba(140, 246, 255, 0.08), transparent 70%)",
          filter: "blur(80px)",
        }}
      />

      {/* Purple orb — center */}
      <div
        className="absolute top-[40%] left-[35%] h-[400px] w-[400px] animate-float-slow"
        style={{
          background:
            "radial-gradient(closest-side, rgba(191, 90, 242, 0.06), transparent 70%)",
          filter: "blur(100px)",
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
