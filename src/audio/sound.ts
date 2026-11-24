/* WebAudio synthesised sound design — wood, bronze and silk-string timbres. */

type Voice = "move" | "capture" | "select" | "invalid" | "check" | "win" | "lose" | "draw" | "ui" | "combo";

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  muted = false;

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 6;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);

      const len = Math.floor(this.ctx.sampleRate * 0.5);
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    return this.ctx;
  }

  resume() {
    this.ensure();
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
    }
  }

  private noise(ctx: AudioContext, t: number, dur: number, gain: number, freq: number, q: number, type: BiquadFilterType = "bandpass") {
    if (!this.noiseBuf || !this.master) return;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  private tone(
    ctx: AudioContext,
    t: number,
    dur: number,
    gain: number,
    f0: number,
    f1: number,
    type: OscillatorType = "sine",
    detune = 0,
  ) {
    if (!this.master) return;
    const o = ctx.createOscillator();
    o.type = type;
    o.detune.value = detune;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.012, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** plucked silk string (guzheng-ish) */
  private pluck(ctx: AudioContext, t: number, freq: number, gain: number, dur = 0.9) {
    if (!this.master) return;
    const partials = [1, 2.01, 3.03, 4.11];
    const amps = [1, 0.42, 0.22, 0.11];
    for (let i = 0; i < partials.length; i++) {
      this.tone(ctx, t, dur / (1 + i * 0.55), gain * amps[i], freq * partials[i], freq * partials[i], "sine");
    }
    this.noise(ctx, t, 0.05, gain * 0.5, freq * 3, 1.2);
  }

  play(v: Voice, param = 0) {
    if (this.muted) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + 0.001;

    switch (v) {
      case "select":
        this.noise(ctx, t, 0.05, 0.16, 2400, 3);
        this.tone(ctx, t, 0.07, 0.06, 880, 1180, "triangle");
        break;
      case "ui":
        this.tone(ctx, t, 0.08, 0.07, 520, 720, "triangle");
        break;
      case "move": {
        // wooden clack
        this.noise(ctx, t, 0.075, 0.34, 1500, 1.6);
        this.noise(ctx, t, 0.04, 0.2, 4200, 2.5);
        this.tone(ctx, t, 0.1, 0.22, 300, 130, "sine");
        break;
      }
      case "capture": {
        this.noise(ctx, t, 0.16, 0.5, 900, 0.9);
        this.noise(ctx, t + 0.008, 0.09, 0.3, 3200, 1.6);
        this.tone(ctx, t, 0.24, 0.4, 210, 62, "sine");
        this.tone(ctx, t, 0.14, 0.14, 420, 120, "square");
        break;
      }
      case "combo": {
        const base = 660 * Math.pow(1.122, Math.min(param, 8));
        this.pluck(ctx, t, base, 0.16, 0.45);
        break;
      }
      case "invalid":
        this.tone(ctx, t, 0.14, 0.16, 150, 92, "sawtooth");
        this.noise(ctx, t, 0.1, 0.1, 400, 0.8, "lowpass");
        break;
      case "check": {
        // bronze gong
        const parts = [1, 1.51, 2.34, 3.12, 4.4];
        const amps = [0.3, 0.19, 0.13, 0.09, 0.06];
        for (let i = 0; i < parts.length; i++) {
          this.tone(ctx, t, 1.5 - i * 0.18, amps[i], 232 * parts[i], 228 * parts[i], "sine");
        }
        this.noise(ctx, t, 0.35, 0.2, 1800, 0.7);
        break;
      }
      case "win": {
        const scale = [523.25, 587.33, 698.46, 783.99, 1046.5, 1174.66];
        scale.forEach((f, i) => this.pluck(ctx, t + i * 0.1, f, 0.2, 1.4));
        this.tone(ctx, t + 0.62, 1.4, 0.12, 1567.98, 1567.98, "sine");
        break;
      }
      case "lose": {
        const scale = [523.25, 466.16, 392.0, 311.13, 233.08];
        scale.forEach((f, i) => this.pluck(ctx, t + i * 0.14, f, 0.18, 1.2));
        this.tone(ctx, t + 0.7, 1.8, 0.16, 116.54, 110, "sine");
        break;
      }
      case "draw": {
        [392, 392, 349.23].forEach((f, i) => this.pluck(ctx, t + i * 0.18, f, 0.17, 1.1));
        break;
      }
    }
  }
}

export const sound = new SoundEngine();