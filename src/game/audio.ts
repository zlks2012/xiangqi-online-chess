// 轻量 WebAudio 合成音效，无需外部资源
let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(v: boolean) {
  enabled = v;
}
export function isSoundEnabled() {
  return enabled;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, delay = 0, slide = 0) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(dur: number, vol = 0.22, delay = 0, low = 800) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const len = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = low;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  click() { tone(660, 0.07, 'triangle', 0.12); },
  select() { tone(520, 0.08, 'triangle', 0.14); tone(780, 0.06, 'sine', 0.08, 0.02); },
  move() {
    noise(0.09, 0.25, 0, 1400);
    tone(220, 0.1, 'sine', 0.22, 0, -80);
    tone(440, 0.07, 'triangle', 0.08, 0.015);
  },
  capture() {
    noise(0.22, 0.4, 0, 2400);
    tone(160, 0.22, 'sawtooth', 0.16, 0, -100);
    tone(90, 0.28, 'sine', 0.32, 0, -30);
    tone(1200, 0.08, 'square', 0.05, 0.02, -600);
  },
  check() {
    tone(880, 0.12, 'square', 0.1);
    tone(880, 0.12, 'square', 0.1, 0.15);
    tone(1320, 0.2, 'square', 0.08, 0.3);
  },
  illegal() { tone(180, 0.12, 'square', 0.1); },
  win() {
    const seq = [523, 659, 784, 1046, 784, 1046, 1318];
    seq.forEach((f, i) => tone(f, 0.22, 'triangle', 0.16, i * 0.13));
    noise(0.5, 0.08, 0.2, 6000);
  },
  lose() {
    const seq = [392, 330, 262, 196];
    seq.forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.1, i * 0.18));
  },
  draw() {
    tone(440, 0.2, 'triangle', 0.14); tone(440, 0.2, 'triangle', 0.14, 0.25);
  },
};
