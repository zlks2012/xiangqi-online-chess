import { Effects } from "./effects";
import { BLACK, Board, KING, RED, charOf, findKing } from "./xiangqi";

export const CN_FONT = `"Noto Serif SC","Songti SC","STSong","SimSun",serif`;

export interface Layout {
  w: number;
  h: number;
  cell: number;
  ox: number;
  oy: number;
  r: number;
  dpr: number;
}

export interface Scene {
  board: Board;
  turn: number;
  playerSide: number;
  selected: number | null;
  targets: number[];
  lastMove: { from: number; to: number } | null;
  hint: { from: number; to: number } | null;
  checkSide: number;
  cursor: number | null;
  showCursor: boolean;
  anim: { piece: number; from: number; to: number; t: number; dur: number } | null;
  drag: { from: number; px: number; py: number; moved: boolean } | null;
  interactive: boolean;
  dimmed: boolean;
  flip: boolean;
  threat: number[];
  /** seconds timestamp (performance.now()/1000) when the pieces staged in; 0 = off */
  intro: number;
}

export function computeLayout(w: number, h: number, dpr: number): Layout {
  const cell = Math.min(w / 9.35, h / 10.5);
  const ox = (w - cell * 8) / 2;
  const oy = (h - cell * 9) / 2;
  return { w, h, cell, ox, oy, r: cell * 0.455, dpr };
}

export function sqToPx(l: Layout, sq: number, flip: boolean) {
  let x = sq % 9;
  let y = (sq / 9) | 0;
  if (flip) {
    x = 8 - x;
    y = 9 - y;
  }
  return { px: l.ox + x * l.cell, py: l.oy + y * l.cell };
}

export function pxToSq(l: Layout, px: number, py: number, flip: boolean): number | null {
  let x = Math.round((px - l.ox) / l.cell);
  let y = Math.round((py - l.oy) / l.cell);
  if (x < 0 || x > 8 || y < 0 || y > 9) return null;
  const dx = Math.abs(px - (l.ox + x * l.cell));
  const dy = Math.abs(py - (l.oy + y * l.cell));
  if (dx > l.cell * 0.62 || dy > l.cell * 0.62) return null;
  if (flip) {
    x = 8 - x;
    y = 9 - y;
  }
  return y * 9 + x;
}

/* ---------------- static board cache ---------------- */

let cacheKey = "";
let cacheCanvas: HTMLCanvasElement | null = null;

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function marker(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number, g: number, quads: number[]) {
  ctx.beginPath();
  for (const q of quads) {
    const sx = q === 0 || q === 3 ? -1 : 1;
    const sy = q < 2 ? -1 : 1;
    ctx.moveTo(cx + sx * g, cy + sy * (g + s));
    ctx.lineTo(cx + sx * g, cy + sy * g);
    ctx.lineTo(cx + sx * (g + s), cy + sy * g);
  }
  ctx.stroke();
}

function buildBoard(l: Layout, flip: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.floor(l.w * l.dpr));
  c.height = Math.max(1, Math.floor(l.h * l.dpr));
  const ctx = c.getContext("2d")!;
  ctx.scale(l.dpr, l.dpr);
  const { cell, ox, oy } = l;
  const pad = cell * 0.62;
  const fx = ox - pad;
  const fy = oy - pad;
  const fw = cell * 8 + pad * 2;
  const fh = cell * 9 + pad * 2;

  // ---- lacquer frame ----
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = cell * 0.9;
  ctx.shadowOffsetY = cell * 0.28;
  const frameG = ctx.createLinearGradient(fx, fy, fx + fw, fy + fh);
  frameG.addColorStop(0, "#5c3720");
  frameG.addColorStop(0.35, "#3b2214");
  frameG.addColorStop(0.7, "#4a2b19");
  frameG.addColorStop(1, "#28170e");
  ctx.fillStyle = frameG;
  roundRect(ctx, fx, fy, fw, fh, cell * 0.34);
  ctx.fill();
  ctx.restore();

  // frame bevel
  ctx.save();
  roundRect(ctx, fx + 1, fy + 1, fw - 2, fh - 2, cell * 0.32);
  ctx.strokeStyle = "rgba(255,214,150,0.22)";
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // ---- playing field ----
  const ix = ox - cell * 0.42;
  const iy = oy - cell * 0.42;
  const iw = cell * 8 + cell * 0.84;
  const ih = cell * 9 + cell * 0.84;
  const fieldG = ctx.createLinearGradient(ix, iy, ix + iw * 0.4, iy + ih);
  fieldG.addColorStop(0, "#f3e2ba");
  fieldG.addColorStop(0.42, "#e8d3a4");
  fieldG.addColorStop(0.75, "#dcc28d");
  fieldG.addColorStop(1, "#cdb079");
  ctx.fillStyle = fieldG;
  roundRect(ctx, ix, iy, iw, ih, cell * 0.14);
  ctx.fill();

  // wood grain
  ctx.save();
  roundRect(ctx, ix, iy, iw, ih, cell * 0.14);
  ctx.clip();
  ctx.lineWidth = 1;
  for (let i = 0; i < 46; i++) {
    const yy = iy + (i / 46) * ih + Math.sin(i * 2.3) * 3;
    ctx.strokeStyle = `rgba(120,80,40,${0.035 + (i % 3) * 0.022})`;
    ctx.beginPath();
    for (let x = 0; x <= iw; x += 12) {
      const yv = yy + Math.sin((x / iw) * 6.2 + i * 1.7) * 3.4 + Math.sin((x / iw) * 15 + i) * 1.2;
      if (x === 0) ctx.moveTo(ix + x, yv);
      else ctx.lineTo(ix + x, yv);
    }
    ctx.stroke();
  }
  // warm centre light
  const glow = ctx.createRadialGradient(ix + iw * 0.5, iy + ih * 0.36, cell, ix + iw * 0.5, iy + ih * 0.5, ih * 0.8);
  glow.addColorStop(0, "rgba(255,238,200,0.34)");
  glow.addColorStop(1, "rgba(90,55,25,0.22)");
  ctx.fillStyle = glow;
  ctx.fillRect(ix, iy, iw, ih);
  ctx.restore();

  // gold hairline inside frame
  ctx.strokeStyle = "rgba(233,185,92,0.55)";
  ctx.lineWidth = 1.2;
  roundRect(ctx, ix - cell * 0.1, iy - cell * 0.1, iw + cell * 0.2, ih + cell * 0.2, cell * 0.18);
  ctx.stroke();

  // ---- grid ----
  const line = Math.max(1, cell * 0.028);
  ctx.strokeStyle = "rgba(74,42,20,0.82)";
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  for (let y = 0; y < 10; y++) {
    ctx.beginPath();
    ctx.moveTo(ox, oy + y * cell);
    ctx.lineTo(ox + 8 * cell, oy + y * cell);
    ctx.stroke();
  }
  for (let x = 0; x < 9; x++) {
    if (x === 0 || x === 8) {
      ctx.beginPath();
      ctx.moveTo(ox + x * cell, oy);
      ctx.lineTo(ox + x * cell, oy + 9 * cell);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(ox + x * cell, oy);
      ctx.lineTo(ox + x * cell, oy + 4 * cell);
      ctx.moveTo(ox + x * cell, oy + 5 * cell);
      ctx.lineTo(ox + x * cell, oy + 9 * cell);
      ctx.stroke();
    }
  }

  // outer double border
  ctx.lineWidth = line * 2.1;
  ctx.strokeStyle = "rgba(60,32,14,0.92)";
  ctx.strokeRect(ox - cell * 0.16, oy - cell * 0.16, 8 * cell + cell * 0.32, 9 * cell + cell * 0.32);

  // palace diagonals
  ctx.lineWidth = line;
  ctx.strokeStyle = "rgba(74,42,20,0.8)";
  const diag = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(ox + x1 * cell, oy + y1 * cell);
    ctx.lineTo(ox + x2 * cell, oy + y2 * cell);
    ctx.stroke();
  };
  diag(3, 0, 5, 2);
  diag(5, 0, 3, 2);
  diag(3, 7, 5, 9);
  diag(5, 7, 3, 9);

  // position markers
  ctx.strokeStyle = "rgba(74,42,20,0.7)";
  ctx.lineWidth = line * 1.1;
  const ms = cell * 0.16;
  const mg = cell * 0.09;
  const pts: [number, number, number[]][] = [
    [1, 2, [0, 1, 2, 3]],
    [7, 2, [0, 1, 2, 3]],
    [1, 7, [0, 1, 2, 3]],
    [7, 7, [0, 1, 2, 3]],
    [0, 3, [1, 2]],
    [0, 6, [1, 2]],
    [8, 3, [0, 3]],
    [8, 6, [0, 3]],
    [2, 3, [0, 1, 2, 3]],
    [4, 3, [0, 1, 2, 3]],
    [6, 3, [0, 1, 2, 3]],
    [2, 6, [0, 1, 2, 3]],
    [4, 6, [0, 1, 2, 3]],
    [6, 6, [0, 1, 2, 3]],
  ];
  for (const [x, y, q] of pts) marker(ctx, ox + x * cell, oy + y * cell, ms, mg, q);

  // ---- river text ----
  ctx.save();
  ctx.fillStyle = "rgba(78,46,22,0.42)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const ry = oy + 4.5 * cell;
  ctx.font = `700 ${cell * 0.62}px ${CN_FONT}`;
  const left = flip ? "漢  界" : "楚  河";
  const right = flip ? "楚  河" : "漢  界";
  ctx.save();
  ctx.translate(ox + 1.85 * cell, ry);
  ctx.fillText(left, 0, 0);
  ctx.restore();
  ctx.save();
  ctx.translate(ox + 6.15 * cell, ry);
  ctx.fillText(right, 0, 0);
  ctx.restore();
  ctx.restore();

  // ---- file labels ----
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${cell * 0.235}px ${CN_FONT}`;
  const CN = ["九", "八", "七", "六", "五", "四", "三", "二", "一"];
  for (let x = 0; x < 9; x++) {
    const dx = flip ? 8 - x : x;
    ctx.fillStyle = "rgba(178,54,40,0.75)";
    ctx.fillText(CN[x], ox + dx * cell, oy + (flip ? -0.29 : 9.29) * cell);
    ctx.fillStyle = "rgba(52,36,50,0.72)";
    ctx.fillText(String(x + 1), ox + dx * cell, oy + (flip ? 9.29 : -0.29) * cell);
  }
  ctx.restore();

  return c;
}

export function getBoardCache(l: Layout, flip: boolean): HTMLCanvasElement {
  const key = `${Math.round(l.w)}x${Math.round(l.h)}@${l.dpr}|${flip}`;
  if (key !== cacheKey || !cacheCanvas) {
    cacheKey = key;
    cacheCanvas = buildBoard(l, flip);
  }
  return cacheCanvas;
}

export function invalidateBoardCache() {
  cacheKey = "";
  cacheCanvas = null;
}

/* ---------------- piece sprites ---------------- */

const spriteCache = new Map<string, HTMLCanvasElement>();

export function clearSpriteCache() {
  spriteCache.clear();
}

function pieceSprite(code: number, r: number, dpr: number): HTMLCanvasElement {
  const key = `${code}|${Math.round(r * 2)}|${dpr}`;
  const hit = spriteCache.get(key);
  if (hit) return hit;
  if (spriteCache.size > 48) spriteCache.clear();

  const S = Math.ceil(r * 2.24);
  const c = document.createElement("canvas");
  c.width = Math.ceil(S * dpr);
  c.height = Math.ceil(S * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const cx = S / 2;
  const cy = S / 2;
  const red = code > 0;
  const inkA = red ? "#a81f16" : "#241f2b";
  const inkB = red ? "#e0483a" : "#4a4356";

  // body
  const g = ctx.createRadialGradient(cx - r * 0.34, cy - r * 0.4, r * 0.12, cx, cy, r * 1.06);
  g.addColorStop(0, "#fdf3dc");
  g.addColorStop(0.42, "#f0dcae");
  g.addColorStop(0.78, "#d8bd8a");
  g.addColorStop(1, "#ab8a58");
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();

  // rim
  ctx.lineWidth = Math.max(1, r * 0.1);
  ctx.strokeStyle = "rgba(88,58,28,0.85)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.955, 0, Math.PI * 2);
  ctx.stroke();

  // top-light bevel
  ctx.lineWidth = Math.max(1, r * 0.07);
  ctx.strokeStyle = "rgba(255,248,225,0.65)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.87, Math.PI * 1.08, Math.PI * 1.95);
  ctx.stroke();
  ctx.strokeStyle = "rgba(120,84,44,0.35)";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.87, Math.PI * 0.1, Math.PI * 0.92);
  ctx.stroke();

  // engraved circle
  ctx.lineWidth = Math.max(1, r * 0.075);
  ctx.strokeStyle = inkA;
  ctx.globalAlpha = 0.9;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.735, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // character (engraved: light offset then ink)
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${r * 1.06}px ${CN_FONT}`;
  ctx.fillStyle = "rgba(255,250,232,0.7)";
  ctx.fillText(charOf(code), cx, cy + r * 0.055 + Math.max(1, r * 0.045));
  const cg = ctx.createLinearGradient(cx, cy - r * 0.6, cx, cy + r * 0.6);
  cg.addColorStop(0, inkB);
  cg.addColorStop(1, inkA);
  ctx.fillStyle = cg;
  ctx.fillText(charOf(code), cx, cy + r * 0.055);

  spriteCache.set(key, c);
  return c;
}

let shadowSprite: HTMLCanvasElement | null = null;
let shadowKey = "";
function getShadow(r: number, dpr: number) {
  const key = `${Math.round(r * 2)}|${dpr}`;
  if (shadowSprite && shadowKey === key) return shadowSprite;
  const S = Math.ceil(r * 3);
  const c = document.createElement("canvas");
  c.width = Math.ceil(S * dpr);
  c.height = Math.ceil(S * dpr);
  const ctx = c.getContext("2d")!;
  ctx.scale(dpr, dpr);
  const g = ctx.createRadialGradient(S / 2, S / 2, r * 0.2, S / 2, S / 2, r * 1.4);
  g.addColorStop(0, "rgba(38,20,8,0.5)");
  g.addColorStop(0.6, "rgba(38,20,8,0.22)");
  g.addColorStop(1, "rgba(38,20,8,0)");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, r * 1.4, 0, Math.PI * 2);
  ctx.fill();
  shadowSprite = c;
  shadowKey = key;
  return c;
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  code: number,
  px: number,
  py: number,
  opts: { scale?: number; alpha?: number; lift?: number; glow?: string; glowAmt?: number } = {},
) {
  const scale = opts.scale ?? 1;
  const lift = opts.lift ?? 0;
  const r = l.r * scale;
  const alpha = opts.alpha ?? 1;

  // shadow
  const sh = getShadow(l.r, l.dpr);
  const ss = l.r * 3 * (1 + lift * 0.5) * scale;
  ctx.save();
  ctx.globalAlpha = alpha * (0.55 + lift * 0.35);
  ctx.drawImage(sh, px - ss / 2, py - ss / 2 + l.r * (0.14 + lift * 0.5), ss, ss);
  ctx.restore();

  if (opts.glow && opts.glowAmt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.globalAlpha = alpha * opts.glowAmt;
    const gg = ctx.createRadialGradient(px, py, r * 0.6, px, py, r * 2.1);
    gg.addColorStop(0, opts.glow);
    gg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(px, py, r * 2.1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  const sp = pieceSprite(code, l.r, l.dpr);
  const S = l.r * 2.24 * scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.drawImage(sp, px - S / 2, py - S / 2 - lift * l.r * 0.34, S, S);
  ctx.restore();
}

/* ---------------- scene ---------------- */

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function drawScene(
  ctx: CanvasRenderingContext2D,
  l: Layout,
  s: Scene,
  fx: Effects,
  time: number,
) {
  ctx.setTransform(l.dpr, 0, 0, l.dpr, 0, 0);
  ctx.clearRect(0, 0, l.w, l.h);

  const sh = fx.shake;
  if (sh > 0.2) {
    const a = fx.shakeAngle + time * 34;
    ctx.translate(Math.cos(a) * sh, Math.sin(a * 1.37) * sh * 0.8);
  }

  ctx.drawImage(getBoardCache(l, s.flip), 0, 0, l.w, l.h);

  const cell = l.cell;
  const pulse = 0.5 + 0.5 * Math.sin(time * 4.2);

  // ---- last move markers ----
  if (s.lastMove) {
    const a = sqToPx(l, s.lastMove.from, s.flip);
    const b = sqToPx(l, s.lastMove.to, s.flip);
    ctx.save();
    ctx.strokeStyle = "rgba(233,185,92,0.5)";
    ctx.lineWidth = Math.max(1.2, cell * 0.035);
    ctx.setLineDash([cell * 0.11, cell * 0.09]);
    ctx.beginPath();
    ctx.arc(a.px, a.py, l.r * 0.86, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "rgba(255,221,154,0.9)";
    ctx.lineWidth = Math.max(1.6, cell * 0.05);
    const q = l.r * 1.0;
    const arm = l.r * 0.36;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(b.px + sx * q, b.py + sy * q - sy * arm);
      ctx.lineTo(b.px + sx * q, b.py + sy * q);
      ctx.lineTo(b.px + sx * q - sx * arm, b.py + sy * q);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- threat highlights (pieces of the player that are attacked) ----
  if (s.threat.length) {
    ctx.save();
    ctx.globalAlpha = 0.2 + pulse * 0.16;
    for (const sq of s.threat) {
      const p = sqToPx(l, sq, s.flip);
      ctx.strokeStyle = "#ff5f47";
      ctx.lineWidth = Math.max(1.4, cell * 0.04);
      ctx.setLineDash([cell * 0.09, cell * 0.12]);
      ctx.beginPath();
      ctx.arc(p.px, p.py, l.r * 1.06, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- check glow on the king ----
  if (s.checkSide !== 0) {
    const k = findKing(s.board, s.checkSide);
    if (k >= 0) {
      const p = sqToPx(l, k, s.flip);
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const gg = ctx.createRadialGradient(p.px, p.py, l.r * 0.3, p.px, p.py, l.r * (2.2 + pulse * 0.5));
      gg.addColorStop(0, `rgba(255,70,50,${0.4 + pulse * 0.3})`);
      gg.addColorStop(1, "rgba(255,70,50,0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(p.px, p.py, l.r * (2.2 + pulse * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = `rgba(255,95,71,${0.55 + pulse * 0.4})`;
      ctx.lineWidth = Math.max(2, cell * 0.055);
      ctx.beginPath();
      ctx.arc(p.px, p.py, l.r * (1.12 + pulse * 0.12), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- selection ring ----
  if (s.selected != null) {
    const p = sqToPx(l, s.selected, s.flip);
    ctx.save();
    ctx.strokeStyle = `rgba(255,221,154,${0.75 + pulse * 0.25})`;
    ctx.lineWidth = Math.max(2, cell * 0.055);
    ctx.beginPath();
    ctx.arc(p.px, p.py, l.r * 1.14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = Math.max(1, cell * 0.03);
    ctx.beginPath();
    ctx.arc(p.px, p.py, l.r * (1.3 + pulse * 0.16), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- legal targets ----
  for (const t of s.targets) {
    const p = sqToPx(l, t, s.flip);
    const occupied = s.board[t] !== 0;
    ctx.save();
    if (occupied) {
      ctx.strokeStyle = `rgba(255,95,71,${0.72 + pulse * 0.28})`;
      ctx.lineWidth = Math.max(2, cell * 0.06);
      ctx.beginPath();
      ctx.arc(p.px, p.py, l.r * (1.06 + pulse * 0.06), 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = 0.25 + pulse * 0.2;
      const gg = ctx.createRadialGradient(p.px, p.py, l.r * 0.8, p.px, p.py, l.r * 1.7);
      gg.addColorStop(0, "rgba(255,95,71,0.7)");
      gg.addColorStop(1, "rgba(255,95,71,0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(p.px, p.py, l.r * 1.7, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.globalCompositeOperation = "lighter";
      const rad = l.r * (0.26 + pulse * 0.06);
      const gg = ctx.createRadialGradient(p.px, p.py, 0, p.px, p.py, rad * 2.4);
      gg.addColorStop(0, "rgba(127,240,205,0.95)");
      gg.addColorStop(0.4, "rgba(53,195,154,0.6)");
      gg.addColorStop(1, "rgba(53,195,154,0)");
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(p.px, p.py, rad * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "rgba(18,60,48,0.55)";
      ctx.beginPath();
      ctx.arc(p.px, p.py, rad * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- keyboard cursor ----
  if (s.showCursor && s.cursor != null) {
    const p = sqToPx(l, s.cursor, s.flip);
    ctx.save();
    ctx.strokeStyle = "#48a6ff";
    ctx.lineWidth = Math.max(2, cell * 0.05);
    const q = l.r * 1.24;
    const arm = l.r * 0.5;
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      ctx.beginPath();
      ctx.moveTo(p.px + sx * q, p.py + sy * q - sy * arm);
      ctx.lineTo(p.px + sx * q, p.py + sy * q);
      ctx.lineTo(p.px + sx * q - sx * arm, p.py + sy * q);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ---- pieces ----
  const animTo = s.anim ? s.anim.to : -1;
  const dragFrom = s.drag ? s.drag.from : -1;
  const introAge = s.intro > 0 ? time - s.intro : -1;
  if (introAge > 1.35) s.intro = 0;
  for (let i = 0; i < 90; i++) {
    const code = s.board[i];
    if (code === 0) continue;
    if (i === animTo || i === dragFrom) continue;
    const p = sqToPx(l, i, s.flip);
    const isSel = s.selected === i;
    let alpha = s.dimmed ? 0.82 : 1;
    let scale = isSel ? 1.06 : 1;
    let lift = isSel ? 0.22 + pulse * 0.1 : 0;
    if (introAge >= 0) {
      const rank = (i / 9) | 0;
      const delay = (s.playerSide > 0 ? 9 - rank : rank) * 0.036 + (i % 9) * 0.014;
      const tt = Math.max(0, Math.min(1, (introAge - delay) / 0.3));
      if (tt <= 0) continue;
      const e = 1 - Math.pow(1 - tt, 3);
      alpha *= tt;
      scale *= 0.5 + 0.5 * e + Math.sin(Math.PI * tt) * 0.14;
      lift += (1 - e) * 1.1;
    }
    drawPiece(ctx, l, code, p.px, p.py, {
      alpha,
      lift,
      scale,
      glow: isSel ? "rgba(255,214,140,0.55)" : undefined,
      glowAmt: isSel ? 0.5 + pulse * 0.3 : 0,
    });
  }

  // ---- animating piece ----
  if (s.anim) {
    const a = s.anim;
    const t = Math.min(1, a.t / a.dur);
    const e = easeInOutCubic(t);
    const from = sqToPx(l, a.from, s.flip);
    const to = sqToPx(l, a.to, s.flip);
    const px = from.px + (to.px - from.px) * e;
    const py = from.py + (to.py - from.py) * e;
    const hop = Math.sin(Math.PI * t) * 0.42;
    const sc = 1 + Math.sin(Math.PI * t) * 0.1;
    drawPiece(ctx, l, a.piece, px, py, {
      lift: hop,
      scale: sc,
      glow: "rgba(255,214,140,0.5)",
      glowAmt: Math.sin(Math.PI * t) * 0.55,
    });
    if (t < 0.98 && Math.random() < 0.7) {
      fx.trail(px, py, a.piece > 0 ? "rgba(255,140,110,0.9)" : "rgba(150,190,255,0.85)", l.cell / 42);
    }
  }

  // ---- hint arrow ----
  if (s.hint) {
    const a = sqToPx(l, s.hint.from, s.flip);
    const b = sqToPx(l, s.hint.to, s.flip);
    const dx = b.px - a.px;
    const dy = b.py - a.py;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const sx = a.px + ux * l.r * 0.9;
    const sy = a.py + uy * l.r * 0.9;
    const ex = b.px - ux * l.r * 1.0;
    const ey = b.py - uy * l.r * 1.0;
    ctx.save();
    ctx.globalAlpha = 0.6 + pulse * 0.4;
    ctx.strokeStyle = "#48a6ff";
    ctx.lineWidth = Math.max(2.5, cell * 0.075);
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(72,166,255,0.9)";
    ctx.shadowBlur = cell * 0.35;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    const hs = cell * 0.24;
    ctx.beginPath();
    ctx.moveTo(ex + ux * hs * 0.7, ey + uy * hs * 0.7);
    ctx.lineTo(ex - uy * hs * 0.55 - ux * hs * 0.25, ey + ux * hs * 0.55 - uy * hs * 0.25);
    ctx.lineTo(ex + uy * hs * 0.55 - ux * hs * 0.25, ey - ux * hs * 0.55 - uy * hs * 0.25);
    ctx.closePath();
    ctx.fillStyle = "#8fd0ff";
    ctx.fill();
    ctx.restore();
  }

  // ---- dragged piece on top ----
  if (s.drag) {
    const code = s.board[s.drag.from];
    if (code !== 0) {
      drawPiece(ctx, l, code, s.drag.px, s.drag.py, {
        scale: 1.16,
        lift: 0.55,
        glow: "rgba(255,214,140,0.6)",
        glowAmt: 0.6,
      });
    }
  }

  // ---- effects ----
  fx.drawWaves(ctx);
  fx.drawParticles(ctx);
  fx.drawFloaters(ctx, CN_FONT);

  if (fx.flash > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.fillStyle = `rgba(${fx.flashColor},${fx.flash * 0.4})`;
    ctx.fillRect(-40, -40, l.w + 80, l.h + 80);
    ctx.restore();
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

export function pieceColors(code: number): string[] {
  return code > 0
    ? ["#ff5f47", "#d6382c", "#ffdd9a", "#e9b95c", "#f4e3bd"]
    : ["#9fb4e0", "#5c6c92", "#c9d6f0", "#e9b95c", "#f4e3bd"];
}

export const SIDE_KEY = { RED, BLACK, KING };