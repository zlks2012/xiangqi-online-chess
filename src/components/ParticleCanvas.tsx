import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface BurstOpts {
  count?: number;
  colors?: string[];
  power?: number;
  size?: number;
  gravity?: number;
  life?: number;
}

export interface ParticleHandle {
  burst: (x: number, y: number, opts?: BurstOpts) => void;
  confetti: () => void;
  ring: (x: number, y: number, color?: string) => void;
}

interface P {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
  shape: 'circle' | 'rect' | 'spark';
  rot: number; vr: number; gravity: number;
}
interface Ring { x: number; y: number; r: number; maxR: number; alpha: number; color: string; width: number; }

const ParticleCanvas = forwardRef<ParticleHandle>(function ParticleCanvas(_, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const parts = useRef<P[]>([]);
  const rings = useRef<Ring[]>([]);
  const raf = useRef(0);

  useImperativeHandle(ref, () => ({
    burst(x, y, opts = {}) {
      const {
        count = 26,
        colors = ['#ffd76a', '#ff9d3c', '#ff5d5d', '#fff3c4'],
        power = 7,
        size = 4,
        gravity = 0.22,
        life = 55,
      } = opts;
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = (0.3 + Math.random() * 0.7) * power;
        parts.current.push({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - power * 0.35,
          life: 0,
          maxLife: life * (0.6 + Math.random() * 0.6),
          size: size * (0.5 + Math.random()),
          color: colors[(Math.random() * colors.length) | 0],
          shape: Math.random() < 0.55 ? 'circle' : Math.random() < 0.5 ? 'rect' : 'spark',
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.3,
          gravity,
        });
      }
      if (parts.current.length > 900) parts.current.splice(0, parts.current.length - 900);
    },
    ring(x, y, color = '#ffd76a') {
      rings.current.push({ x, y, r: 6, maxR: 90 + Math.random() * 40, alpha: 1, color, width: 4 });
    },
    confetti() {
      const w = window.innerWidth;
      for (let i = 0; i < 160; i++) {
        parts.current.push({
          x: Math.random() * w,
          y: -20 - Math.random() * 120,
          vx: (Math.random() - 0.5) * 3,
          vy: 2 + Math.random() * 4,
          life: 0,
          maxLife: 160 + Math.random() * 80,
          size: 4 + Math.random() * 5,
          color: ['#ffd76a', '#e63946', '#f4f1de', '#2ec4b6', '#ff9d3c', '#fff'][i % 6],
          shape: 'rect',
          rot: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.25,
          gravity: 0.06,
        });
      }
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(2, (now - last) / 16.666);
      last = now;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      const ps = parts.current;
      for (let i = ps.length - 1; i >= 0; i--) {
        const p = ps[i];
        p.life += dt;
        if (p.life >= p.maxLife) { ps.splice(i, 1); continue; }
        p.vy += p.gravity * dt;
        p.vx *= 0.985;
        p.vy *= 0.992;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        const t = 1 - p.life / p.maxLife;
        ctx.globalAlpha = Math.max(0, t);
        ctx.fillStyle = p.color;
        if (p.shape === 'circle') {
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * t), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === 'rect') {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
        } else {
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.fillRect(-p.size * 1.6, -1, p.size * 3.2, 2);
          ctx.restore();
        }
      }
      ctx.globalAlpha = 1;

      const rs = rings.current;
      for (let i = rs.length - 1; i >= 0; i--) {
        const r = rs[i];
        r.r += (r.maxR - r.r) * 0.12 * dt + 1.2 * dt;
        r.alpha -= 0.03 * dt;
        if (r.alpha <= 0 || r.r >= r.maxR) { rs.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, r.alpha);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = r.width * r.alpha + 1;
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed inset-0 z-[90]"
      aria-hidden
    />
  );
});

export default ParticleCanvas;
