"use client";

import { useEffect, useRef } from "react";

/* ------------------------------------------------------------------ *
 *  GalaxyCanvas — a hand-painted Milky Way rendered on <canvas>.
 *
 *  Layers (far → near), each parallaxes at a different depth:
 *    1. Nebula band + faint dust stars  → pre-rendered once (offscreen)
 *    2. Twinkling field stars            → animated per frame
 *    3. Occasional meteors               → spawned on a timer
 *
 *  Follows the canvas-design-system philosophy: a limited, cohesive
 *  palette (blue → violet → fuchsia), dense accumulation of marks,
 *  systematic composition — patient repetition that rewards a long look.
 * ------------------------------------------------------------------ */

type Star = {
  x: number;
  y: number;
  r: number;
  a: number; // base alpha
  phase: number;
  speed: number;
  depth: number; // 0 = far, 1 = near (drives parallax + drift)
  hue: string;
};

type Meteor = {
  x: number;
  y: number;
  len: number;
  vx: number;
  vy: number;
  life: number; // 0..1 remaining
};

const PALETTE = [
  "rgba(70,120,255,",
  "rgba(120,90,245,",
  "rgba(168,120,255,",
  "rgba(214,120,240,",
  "rgba(224,231,255,",
];

// Gaussian-ish random in [-1,1], concentrates marks toward the band centre.
function gauss(rand: () => number) {
  return (rand() + rand() + rand() - 1.5) / 1.5;
}

export default function GalaxyCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let stars: Star[] = [];
    const meteors: Meteor[] = [];
    let nebula: HTMLCanvasElement | null = null;

    // Deterministic RNG so the sky is stable across re-renders.
    let seed = 987654321;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Band geometry (the Milky Way's diagonal axis).
    const bandAngle = -0.42;
    let bandCx = 0;
    let bandCy = 0;

    const softCloud = (
      c: CanvasRenderingContext2D,
      x: number,
      y: number,
      r: number,
      color: string,
      alpha: number,
    ) => {
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color + alpha + ")");
      g.addColorStop(0.5, color + alpha * 0.35 + ")");
      g.addColorStop(1, color + "0)");
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    };

    const buildNebula = () => {
      const off = document.createElement("canvas");
      off.width = Math.floor(w * dpr);
      off.height = Math.floor(h * dpr);
      const c = off.getContext("2d");
      if (!c) return off;
      c.scale(dpr, dpr);

      // Deep-space base
      const base = c.createLinearGradient(0, 0, w, h);
      base.addColorStop(0, "#070313");
      base.addColorStop(0.45, "#0a0619");
      base.addColorStop(1, "#04040e");
      c.fillStyle = base;
      c.fillRect(0, 0, w, h);

      const span = Math.max(w, h);
      bandCx = w * 0.4;
      bandCy = h * 0.52;
      const ax = Math.cos(bandAngle);
      const ay = Math.sin(bandAngle);
      const px = -ay; // perpendicular
      const py = ax;

      c.globalCompositeOperation = "lighter";

      // Broad galactic core glow
      softCloud(c, bandCx, bandCy, span * 0.55, "rgba(96,80,210,", 0.1);

      // Large nebula clumps along the axis
      const clumps = [
        { t: -0.85, col: "rgba(60,110,255,", r: 0.32, a: 0.14 },
        { t: -0.45, col: "rgba(130,90,240,", r: 0.4, a: 0.16 },
        { t: -0.1, col: "rgba(190,120,255,", r: 0.28, a: 0.13 },
        { t: 0.25, col: "rgba(110,80,255,", r: 0.36, a: 0.16 },
        { t: 0.6, col: "rgba(214,90,235,", r: 0.28, a: 0.11 },
        { t: 0.95, col: "rgba(60,90,220,", r: 0.3, a: 0.12 },
      ];
      for (const cl of clumps) {
        const x = bandCx + ax * cl.t * span * 0.85;
        const y = bandCy + ay * cl.t * span * 0.85;
        softCloud(c, x, y, span * cl.r, cl.col, cl.a);
      }

      // Filamentary dust — dense accumulation of small clouds jittered along the band
      const filaments = Math.floor((w * h) / 26000);
      for (let i = 0; i < filaments; i++) {
        const t = (rand() * 2 - 1) * span * 0.95;
        const off2 = gauss(rand) * span * 0.16;
        const x = bandCx + ax * t + px * off2;
        const y = bandCy + ay * t + py * off2;
        const col = PALETTE[Math.floor(rand() * PALETTE.length)];
        softCloud(c, x, y, span * (0.04 + rand() * 0.07), col, 0.05 + rand() * 0.06);
      }

      // Faint static background stars (thousands of tiny dots — the deep field)
      c.globalCompositeOperation = "source-over";
      const bg = Math.floor((w * h) / 1400);
      for (let i = 0; i < bg; i++) {
        // half uniformly, half hugging the band for realistic density
        let x: number, y: number;
        if (i % 2 === 0) {
          x = rand() * w;
          y = rand() * h;
        } else {
          const t = (rand() * 2 - 1) * span * 0.95;
          const off2 = gauss(rand) * span * 0.2;
          x = bandCx + ax * t + px * off2;
          y = bandCy + ay * t + py * off2;
        }
        if (x < 0 || x > w || y < 0 || y > h) continue;
        const a = 0.15 + rand() * 0.45;
        c.fillStyle = `rgba(226,232,255,${a})`;
        c.fillRect(x, y, rand() < 0.15 ? 1.3 : 0.8, rand() < 0.15 ? 1.3 : 0.8);
      }

      return off;
    };

    const buildStars = () => {
      const count = Math.floor((w * h) / 5200);
      const span = Math.max(w, h);
      const ax = Math.cos(bandAngle);
      const ay = Math.sin(bandAngle);
      const px = -ay;
      const py = ax;
      const arr: Star[] = [];
      for (let i = 0; i < count; i++) {
        let x: number, y: number;
        if (i % 3 === 0) {
          x = rand() * w;
          y = rand() * h;
        } else {
          const t = (rand() * 2 - 1) * span * 0.95;
          const o = gauss(rand) * span * 0.18;
          x = bandCx + ax * t + px * o;
          y = bandCy + ay * t + py * o;
        }
        const big = rand() < 0.06;
        arr.push({
          x,
          y,
          r: big ? 1.2 + rand() * 1.4 : 0.4 + rand() * 1,
          a: 0.4 + rand() * 0.6,
          phase: rand() * Math.PI * 2,
          speed: 0.4 + rand() * 1.6,
          depth: rand(),
          hue:
            rand() < 0.7
              ? "226,232,255"
              : rand() < 0.5
                ? "150,180,255"
                : "220,180,255",
        });
      }
      return arr;
    };

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      nebula = buildNebula();
      stars = buildStars();
    };

    // Parallax state
    let tgtX = 0;
    let tgtY = 0;
    let curX = 0;
    let curY = 0;

    const onMove = (e: MouseEvent) => {
      tgtX = (e.clientX / w - 0.5) * 2;
      tgtY = (e.clientY / h - 0.5) * 2;
    };

    let lastMeteor = 0;
    const spawnMeteor = (now: number) => {
      lastMeteor = now + 3500 + rand() * 6000;
      const fromLeft = rand() < 0.5;
      const speed = 6 + rand() * 5;
      const ang = 0.32 + rand() * 0.16;
      meteors.push({
        x: fromLeft ? rand() * w * 0.4 : w * (0.6 + rand() * 0.4),
        y: rand() * h * 0.35,
        len: 120 + rand() * 160,
        vx: (fromLeft ? 1 : -1) * speed * Math.cos(ang),
        vy: speed * Math.sin(ang),
        life: 1,
      });
    };

    let raf = 0;
    const render = () => {
      const now = performance.now();
      const t = now * 0.001;

      // Smoothly ease parallax toward the pointer
      curX += (tgtX - curX) * 0.045;
      curY += (tgtY - curY) * 0.045;

      const drift = t * 4; // gentle perpetual motion

      // Far layer: nebula image, subtle parallax
      ctx.globalCompositeOperation = "source-over";
      if (nebula) {
        ctx.drawImage(
          nebula,
          0,
          0,
          nebula.width,
          nebula.height,
          -30 + curX * 14,
          -30 + curY * 14 + Math.sin(t * 0.05) * 4,
          w + 60,
          h + 60,
        );
      } else {
        ctx.fillStyle = "#05040e";
        ctx.fillRect(0, 0, w, h);
      }

      // Star field: twinkle + depth parallax + wrapping drift
      ctx.globalCompositeOperation = "lighter";
      for (const s of stars) {
        const shift = 10 + s.depth * 42;
        let x = s.x + curX * shift - drift * (0.1 + s.depth * 0.5);
        x = ((x % w) + w) % w;
        const y = s.y + curY * shift;
        const tw = 0.55 + 0.45 * Math.sin(t * s.speed + s.phase);
        const a = s.a * tw;
        if (s.r > 1.1) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, s.r * 4);
          g.addColorStop(0, `rgba(${s.hue},${a})`);
          g.addColorStop(1, `rgba(${s.hue},0)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(x, y, s.r * 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(${s.hue},${a})`;
        ctx.beginPath();
        ctx.arc(x, y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Meteors
      if (now > lastMeteor) spawnMeteor(now);
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx;
        m.y += m.vy;
        m.life -= 0.012;
        if (m.life <= 0 || m.y > h + 50) {
          meteors.splice(i, 1);
          continue;
        }
        const tx = m.x - m.vx * (m.len / 8);
        const ty = m.y - m.vy * (m.len / 8);
        const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
        g.addColorStop(0, `rgba(224,231,255,${0.85 * m.life})`);
        g.addColorStop(1, "rgba(224,231,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
      }

      raf = requestAnimationFrame(render);
    };

    // Static render for reduced-motion users
    const renderStatic = () => {
      ctx.globalCompositeOperation = "source-over";
      if (nebula) ctx.drawImage(nebula, 0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const s of stars) {
        ctx.fillStyle = `rgba(${s.hue},${s.a})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    resize();
    let resizeTimer: number;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resize();
        if (reduce) renderStatic();
      }, 180);
    };
    window.addEventListener("resize", onResize);

    if (reduce) {
      renderStatic();
    } else {
      lastMeteor = performance.now() + 2000;
      window.addEventListener("mousemove", onMove);
      raf = requestAnimationFrame(render);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("mousemove", onMove);
      window.clearTimeout(resizeTimer);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 h-full w-full"
    />
  );
}
