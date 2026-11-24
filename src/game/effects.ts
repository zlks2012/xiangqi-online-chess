export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: "spark" | "shard" | "dust" | "ember";
  rot: number;
  vr: number;
  grav: number;
  drag: number;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  max: number;
  size: number;
  vy: number;
}

export interface Wave {
  x: number;
  y: number;
  r: number;
  target: number;
  life: number;
  max: number;
  color: string;
  width: number;
}

const MAX_PARTICLES = 420;

export class Effects {
  particles: Particle[] = [];
  floaters: Floater[] = [];
  waves: Wave[] = [];
  shake = 0;
  shakeAngle = 0;
  flash = 0;
  flashColor = "255,255,255";

  reset() {
    this.particles.length = 0;
    this.floaters.length = 0;
    this.waves.length = 0;
    this.shake = 0;
    this.flash = 0;
  }

  addShake(amount: number) {
    this.shake = Math.min(34, this.shake + amount);
    this.shakeAngle = Math.random() * Math.PI * 2;
  }

  addFlash(amount: number, color: string) {
    this.flash = Math.min(1, this.flash + amount);
    this.flashColor = color;
  }

  wave(x: number, y: number, target: number, color: string, width = 3, dur = 0.55) {
    this.waves.push({ x, y, r: 0, target, life: dur, max: dur, color, width });
  }

  float(x: number, y: number, text: string, color: string, size = 22) {
    this.floaters.push({ x, y, text, color, life: 1.1, max: 1.1, size, vy: -46 });
  }

  burst(x: number, y: number, colors: string[], count: number, power: number, scale = 1) {
    const n = Math.min(count, MAX_PARTICLES - this.particles.length);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = power * (0.35 + Math.random() * 0.9);
      const kind: Particle["kind"] = Math.random() < 0.42 ? "shard" : Math.random() < 0.75 ? "spark" : "dust";
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - power * 0.28,
        life: 0.45 + Math.random() * 0.65,
        max: 1,
        size: (kind === "shard" ? 2.4 + Math.random() * 3.6 : 1.4 + Math.random() * 2.6) * scale,
        color: colors[(Math.random() * colors.length) | 0],
        kind,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 12,
        grav: kind === "dust" ? 40 : 620,
        drag: kind === "dust" ? 1.6 : 0.9,
      });
      const p = this.particles[this.particles.length - 1];
      p.max = p.life;
    }
  }

  trail(x: number, y: number, color: string, scale = 1) {
    if (this.particles.length >= MAX_PARTICLES) return;
    this.particles.push({
      x: x + (Math.random() - 0.5) * 8,
      y: y + (Math.random() - 0.5) * 8,
      vx: (Math.random() - 0.5) * 26,
      vy: (Math.random() - 0.5) * 26 - 12,
      life: 0.32 + Math.random() * 0.25,
      max: 0.55,
      size: (1.2 + Math.random() * 2.2) * scale,
      color,
      kind: "ember",
      rot: 0,
      vr: 0,
      grav: -30,
      drag: 2.2,
    });
  }

  update(dt: number) {
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.life -= dt;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      const d = Math.max(0, 1 - p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= Math.max(0, 1 - 1.6 * dt);
      if (f.life <= 0) this.floaters.splice(i, 1);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.life -= dt;
      const t = 1 - w.life / w.max;
      w.r = w.target * (1 - Math.pow(1 - t, 3));
      if (w.life <= 0) this.waves.splice(i, 1);
    }
    this.shake *= Math.pow(0.0016, dt);
    if (this.shake < 0.15) this.shake = 0;
    this.flash *= Math.pow(0.0009, dt);
    if (this.flash < 0.01) this.flash = 0;
  }

  drawWaves(ctx: CanvasRenderingContext2D) {
    for (const w of this.waves) {
      const a = Math.max(0, w.life / w.max);
      ctx.save();
      ctx.globalAlpha = a * 0.85;
      ctx.strokeStyle = w.color;
      ctx.lineWidth = w.width * a + 0.6;
      ctx.beginPath();
      ctx.arc(w.x, w.y, Math.max(0.5, w.r), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  drawParticles(ctx: CanvasRenderingContext2D) {
    ctx.save();
    for (const p of this.particles) {
      const a = Math.max(0, Math.min(1, p.life / p.max));
      ctx.globalAlpha = a;
      if (p.kind === "shard") {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.28, p.size, p.size * 0.56);
        ctx.restore();
      } else if (p.kind === "dust") {
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.globalCompositeOperation = "lighter";
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.kind === "ember" ? a : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = "source-over";
      }
    }
    ctx.restore();
  }

  drawFloaters(ctx: CanvasRenderingContext2D, font: string) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floaters) {
      const t = 1 - f.life / f.max;
      const a = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 0.88);
      const s = f.size * (t < 0.14 ? 0.7 + (t / 0.14) * 0.42 : 1.12 - (t - 0.14) * 0.16);
      ctx.globalAlpha = a;
      ctx.font = `900 ${s}px ${font}`;
      ctx.lineWidth = Math.max(2, s * 0.16);
      ctx.strokeStyle = "rgba(10,6,10,0.75)";
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.restore();
  }
}