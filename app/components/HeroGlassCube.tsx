"use client";

import { useEffect, useRef, useCallback } from "react";

/**
 * HeroSignalEffect — замінює Three.js GlassCube.
 * Canvas-ефект у стилі live-моніторингу: горизонтальні сигнальні лінії
 * що "пінгують" вузли зліва направо. Кольори — lime (#D6FF3F) та cyan (#8CF6FF).
 * Cursor-reactive: лінії трохи відхиляються від курсора.
 * Без WebGL, без важких бібліотек — чистий Canvas2D.
 */

interface Line {
  y: number;           // базова позиція по Y (0..1 відносно висоти)
  speed: number;       // швидкість пульсу
  progress: number;    // поточний прогрес пульсу (0..1)
  color: "lime" | "cyan";
  opacity: number;
  nodes: number[];     // X-позиції вузлів (0..1)
  dotProgress: number; // анімація dot на вузлі
  activeDot: number;   // індекс активного вузла
  delay: number;       // затримка старту
}

const LIME = "#D6FF3F";
const CYAN = "#8CF6FF";
const LINE_COUNT = 9;

function createLines(width: number, height: number): Line[] {
  return Array.from({ length: LINE_COUNT }, (_, i) => {
    const color = i % 3 === 1 ? "cyan" : "lime";
    const nodeCount = 3 + Math.floor(Math.random() * 3);
    return {
      y: 0.08 + (i / (LINE_COUNT - 1)) * 0.84,
      speed: 0.0004 + Math.random() * 0.0003,
      progress: Math.random(),
      color,
      opacity: 0.12 + Math.random() * 0.18,
      nodes: Array.from({ length: nodeCount }, (_, j) => 0.1 + (j / (nodeCount - 1)) * 0.8),
      dotProgress: 0,
      activeDot: 0,
      delay: Math.random() * 2000,
    };
  });
}

export function HeroGlassCube() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linesRef = useRef<Line[]>([]);
  const mouseRef = useRef({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number>(0);
  const startedRef = useRef(false);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    const mx = mouseRef.current.x;
    const my = mouseRef.current.y;

    linesRef.current.forEach(line => {
      // Cursor influence — лінія трохи відхиляється від курсора
      const dy = line.y - my;
      const yOffset = dy * 0.03 * H;
      const baseY = line.y * H + yOffset;

      const color = line.color === "lime" ? LIME : CYAN;

      // Базова горизонтальна лінія
      ctx.beginPath();
      ctx.moveTo(0, baseY);
      ctx.lineTo(W, baseY);
      ctx.strokeStyle = color;
      ctx.globalAlpha = line.opacity * 0.4;
      ctx.lineWidth = 1;
      ctx.stroke();

      // Пульс — яскрава точка що рухається по лінії
      const pulseX = line.progress * W;
      const trailLen = W * 0.18;
      const grad = ctx.createLinearGradient(pulseX - trailLen, 0, pulseX + 20, 0);
      grad.addColorStop(0, "transparent");
      grad.addColorStop(0.6, color + "22");
      grad.addColorStop(1, color);
      ctx.beginPath();
      ctx.moveTo(Math.max(0, pulseX - trailLen), baseY);
      ctx.lineTo(pulseX, baseY);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = line.opacity * 1.8;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Вузли (кола)
      line.nodes.forEach((nx, idx) => {
        const nodeX = nx * W;
        const dist = Math.abs(pulseX - nodeX);

        // Glow коли пульс проходить через вузол
        const glow = Math.max(0, 1 - dist / (W * 0.06));
        const r = glow > 0.01 ? 3 + glow * 4 : 2.5;

        ctx.beginPath();
        ctx.arc(nodeX, baseY, r, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = line.opacity * (0.5 + glow * 0.8);
        ctx.fill();

        // Ripple ефект при попаданні пульсу
        if (glow > 0.3) {
          ctx.beginPath();
          ctx.arc(nodeX, baseY, r + glow * 12, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.globalAlpha = glow * 0.15;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      });

      // Прогрес
      line.progress += line.speed;
      if (line.progress > 1.05) line.progress = -0.05;
    });

    ctx.globalAlpha = 1;
    rafRef.current = requestAnimationFrame(draw);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * Math.min(window.devicePixelRatio, 2);
      canvas.height = rect.height * Math.min(window.devicePixelRatio, 2);
      if (!startedRef.current) {
        linesRef.current = createLines(canvas.width, canvas.height);
        startedRef.current = true;
      }
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const section = canvas.parentElement?.parentElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: (e.clientX - rect.left) / rect.width,
        y: (e.clientY - rect.top) / rect.height,
      };
    };
    section?.addEventListener("pointermove", onMove);

    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      ro.disconnect();
      section?.removeEventListener("pointermove", onMove);
    };
  }, [draw]);

  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: "none", zIndex: 0 }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: "100%", height: "100%", display: "block", opacity: 0.85 }}
      />
    </div>
  );
}
