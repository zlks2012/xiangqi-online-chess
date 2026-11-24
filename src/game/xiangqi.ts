/* ------------------------------------------------------------------
   象棋规则引擎 (Xiangqi rules engine)
   Board: Int8Array(90), index = y * 9 + x
   y = 0 is Black's back rank (top), y = 9 is Red's back rank (bottom)
   Positive values = RED, negative = BLACK
------------------------------------------------------------------- */

export const RED = 1;
export const BLACK = -1;
export type Side = 1 | -1;

export const EMPTY = 0;
export const KING = 1;
export const ADVISOR = 2;
export const ELEPHANT = 3;
export const HORSE = 4;
export const ROOK = 5;
export const CANNON = 6;
export const PAWN = 7;

export type Board = Int8Array;

export const W = 9;
export const H = 10;

export const ORTH: ReadonlyArray<readonly [number, number]> = [
  [0, -1],
  [0, 1],
  [-1, 0],
  [1, 0],
];
export const DIAG: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];
export const HORSE_D: ReadonlyArray<readonly [number, number]> = [
  [1, -2],
  [-1, -2],
  [1, 2],
  [-1, 2],
  [2, -1],
  [2, 1],
  [-2, -1],
  [-2, 1],
];

export const PIECE_VALUE = [0, 6000, 120, 120, 270, 600, 285, 30];

export const RED_CHARS = ["", "帅", "仕", "相", "马", "车", "炮", "兵"];
export const BLACK_CHARS = ["", "将", "士", "象", "马", "车", "炮", "卒"];

export function charOf(code: number): string {
  const t = Math.abs(code);
  return code > 0 ? RED_CHARS[t] : BLACK_CHARS[t];
}

export function nameOf(code: number): string {
  const t = Math.abs(code);
  const names = ["", "将帅", "士仕", "象相", "马", "车", "炮", "兵卒"];
  return names[t];
}

export const idx = (x: number, y: number) => y * 9 + x;
export const fileOf = (i: number) => i % 9;
export const rankOf = (i: number) => (i / 9) | 0;
export const inBoard = (x: number, y: number) => x >= 0 && x < 9 && y >= 0 && y < 10;

export function inPalace(x: number, y: number, side: number): boolean {
  if (x < 3 || x > 5) return false;
  return side === RED ? y >= 7 && y <= 9 : y >= 0 && y <= 2;
}

export function ownHalf(y: number, side: number): boolean {
  return side === RED ? y >= 5 : y <= 4;
}

export function crossedRiver(y: number, side: number): boolean {
  return side === RED ? y <= 4 : y >= 5;
}

export function initialBoard(): Board {
  const b = new Int8Array(90);
  const back = [ROOK, HORSE, ELEPHANT, ADVISOR, KING, ADVISOR, ELEPHANT, HORSE, ROOK];
  for (let x = 0; x < 9; x++) {
    b[idx(x, 0)] = -back[x];
    b[idx(x, 9)] = back[x];
  }
  b[idx(1, 2)] = -CANNON;
  b[idx(7, 2)] = -CANNON;
  b[idx(1, 7)] = CANNON;
  b[idx(7, 7)] = CANNON;
  for (let x = 0; x < 9; x += 2) {
    b[idx(x, 3)] = -PAWN;
    b[idx(x, 6)] = PAWN;
  }
  return b;
}

/* ---------------- move encoding: from * 90 + to ---------------- */
export const encode = (from: number, to: number) => from * 90 + to;
export const mFrom = (m: number) => (m / 90) | 0;
export const mTo = (m: number) => m % 90;

export function makeMove(b: Board, m: number): number {
  const from = (m / 90) | 0;
  const to = m % 90;
  const cap = b[to];
  b[to] = b[from];
  b[from] = 0;
  return cap;
}

export function unmakeMove(b: Board, m: number, cap: number): void {
  const from = (m / 90) | 0;
  const to = m % 90;
  b[from] = b[to];
  b[to] = cap;
}

/* ---------------- move generation ---------------- */

export function genMoves(b: Board, side: number, out: number[], capturesOnly = false): number[] {
  out.length = 0;
  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (p === 0) continue;
    if (side === RED ? p < 0 : p > 0) continue;
    const t = p > 0 ? p : -p;
    const x = i % 9;
    const y = (i / 9) | 0;

    switch (t) {
      case KING: {
        for (let d = 0; d < 4; d++) {
          const nx = x + ORTH[d][0];
          const ny = y + ORTH[d][1];
          if (!inPalace(nx, ny, side)) continue;
          const j = ny * 9 + nx;
          const q = b[j];
          if (q !== 0 && (side === RED ? q > 0 : q < 0)) continue;
          if (capturesOnly && q === 0) continue;
          out.push(i * 90 + j);
        }
        break;
      }
      case ADVISOR: {
        for (let d = 0; d < 4; d++) {
          const nx = x + DIAG[d][0];
          const ny = y + DIAG[d][1];
          if (!inPalace(nx, ny, side)) continue;
          const j = ny * 9 + nx;
          const q = b[j];
          if (q !== 0 && (side === RED ? q > 0 : q < 0)) continue;
          if (capturesOnly && q === 0) continue;
          out.push(i * 90 + j);
        }
        break;
      }
      case ELEPHANT: {
        for (let d = 0; d < 4; d++) {
          const nx = x + DIAG[d][0] * 2;
          const ny = y + DIAG[d][1] * 2;
          if (!inBoard(nx, ny) || !ownHalf(ny, side)) continue;
          if (b[(y + DIAG[d][1]) * 9 + (x + DIAG[d][0])] !== 0) continue;
          const j = ny * 9 + nx;
          const q = b[j];
          if (q !== 0 && (side === RED ? q > 0 : q < 0)) continue;
          if (capturesOnly && q === 0) continue;
          out.push(i * 90 + j);
        }
        break;
      }
      case HORSE: {
        for (let d = 0; d < 8; d++) {
          const dx = HORSE_D[d][0];
          const dy = HORSE_D[d][1];
          const nx = x + dx;
          const ny = y + dy;
          if (!inBoard(nx, ny)) continue;
          const lx = Math.abs(dx) === 2 ? x + dx / 2 : x;
          const ly = Math.abs(dx) === 2 ? y : y + dy / 2;
          if (b[ly * 9 + lx] !== 0) continue;
          const j = ny * 9 + nx;
          const q = b[j];
          if (q !== 0 && (side === RED ? q > 0 : q < 0)) continue;
          if (capturesOnly && q === 0) continue;
          out.push(i * 90 + j);
        }
        break;
      }
      case ROOK: {
        for (let d = 0; d < 4; d++) {
          const dx = ORTH[d][0];
          const dy = ORTH[d][1];
          let nx = x + dx;
          let ny = y + dy;
          while (inBoard(nx, ny)) {
            const j = ny * 9 + nx;
            const q = b[j];
            if (q === 0) {
              if (!capturesOnly) out.push(i * 90 + j);
            } else {
              if (side === RED ? q < 0 : q > 0) out.push(i * 90 + j);
              break;
            }
            nx += dx;
            ny += dy;
          }
        }
        break;
      }
      case CANNON: {
        for (let d = 0; d < 4; d++) {
          const dx = ORTH[d][0];
          const dy = ORTH[d][1];
          let nx = x + dx;
          let ny = y + dy;
          let screen = false;
          while (inBoard(nx, ny)) {
            const j = ny * 9 + nx;
            const q = b[j];
            if (!screen) {
              if (q === 0) {
                if (!capturesOnly) out.push(i * 90 + j);
              } else screen = true;
            } else if (q !== 0) {
              if (side === RED ? q < 0 : q > 0) out.push(i * 90 + j);
              break;
            }
            nx += dx;
            ny += dy;
          }
        }
        break;
      }
      case PAWN: {
        const dy = side === RED ? -1 : 1;
        const ny = y + dy;
        if (inBoard(x, ny)) {
          const j = ny * 9 + x;
          const q = b[j];
          if (q === 0 || (side === RED ? q < 0 : q > 0)) {
            if (!capturesOnly || q !== 0) out.push(i * 90 + j);
          }
        }
        if (crossedRiver(y, side)) {
          for (const dx of [-1, 1]) {
            const nx = x + dx;
            if (!inBoard(nx, y)) continue;
            const j = y * 9 + nx;
            const q = b[j];
            if (q === 0 || (side === RED ? q < 0 : q > 0)) {
              if (!capturesOnly || q !== 0) out.push(i * 90 + j);
            }
          }
        }
        break;
      }
    }
  }
  return out;
}

export function findKing(b: Board, side: number): number {
  const target = side === RED ? KING : -KING;
  const lo = side === RED ? 63 : 0;
  const hi = side === RED ? 90 : 27;
  for (let i = lo; i < hi; i++) if (b[i] === target) return i;
  for (let i = 0; i < 90; i++) if (b[i] === target) return i;
  return -1;
}

/** Is square (tx,ty) attacked by any piece of side `by`? */
export function isAttacked(b: Board, tx: number, ty: number, by: number): boolean {
  // Orthogonal rays: rook, cannon (behind a screen), flying general
  for (let d = 0; d < 4; d++) {
    const dx = ORTH[d][0];
    const dy = ORTH[d][1];
    let x = tx + dx;
    let y = ty + dy;
    let screen = false;
    while (x >= 0 && x < 9 && y >= 0 && y < 10) {
      const p = b[y * 9 + x];
      if (p !== 0) {
        const own = by === RED ? p > 0 : p < 0;
        const t = p > 0 ? p : -p;
        if (!screen) {
          if (own) {
            if (t === ROOK) return true;
            if (t === KING && dx === 0) return true; // 白脸将
          }
          screen = true;
        } else {
          if (own && t === CANNON) return true;
          break;
        }
      }
      x += dx;
      y += dy;
    }
  }
  // Horse
  for (let d = 0; d < 8; d++) {
    const dx = HORSE_D[d][0];
    const dy = HORSE_D[d][1];
    const hx = tx + dx;
    const hy = ty + dy;
    if (!inBoard(hx, hy)) continue;
    const p = b[hy * 9 + hx];
    if (p === 0) continue;
    const own = by === RED ? p > 0 : p < 0;
    if (!own || (p > 0 ? p : -p) !== HORSE) continue;
    const lx = Math.abs(dx) === 2 ? hx - dx / 2 : hx;
    const ly = Math.abs(dx) === 2 ? hy : hy - dy / 2;
    if (b[ly * 9 + lx] === 0) return true;
  }
  // Advisor (adjacent diagonal) & Elephant (two-step diagonal)
  for (let d = 0; d < 4; d++) {
    const dx = DIAG[d][0];
    const dy = DIAG[d][1];
    const ax = tx + dx;
    const ay = ty + dy;
    if (inBoard(ax, ay)) {
      const p = b[ay * 9 + ax];
      if (p !== 0 && (by === RED ? p > 0 : p < 0) && (p > 0 ? p : -p) === ADVISOR) return true;
    }
    const ex = tx + dx * 2;
    const ey = ty + dy * 2;
    if (inBoard(ex, ey) && b[(ty + dy) * 9 + (tx + dx)] === 0) {
      const p = b[ey * 9 + ex];
      if (
        p !== 0 &&
        (by === RED ? p > 0 : p < 0) &&
        (p > 0 ? p : -p) === ELEPHANT &&
        ownHalf(ey, by) &&
        ownHalf(ty, by)
      )
        return true;
    }
  }
  // Pawn
  const dir = by === RED ? -1 : 1;
  const py = ty - dir;
  if (py >= 0 && py < 10) {
    const p = b[py * 9 + tx];
    if (p !== 0 && (by === RED ? p > 0 : p < 0) && (p > 0 ? p : -p) === PAWN) return true;
  }
  for (const sx of [tx - 1, tx + 1]) {
    if (sx < 0 || sx > 8) continue;
    const p = b[ty * 9 + sx];
    if (p === 0) continue;
    if ((by === RED ? p > 0 : p < 0) && (p > 0 ? p : -p) === PAWN && crossedRiver(ty, by)) return true;
  }
  return false;
}

export function inCheck(b: Board, side: number): boolean {
  const k = findKing(b, side);
  if (k < 0) return true;
  return isAttacked(b, k % 9, (k / 9) | 0, -side as Side);
}

const scratch: number[][] = Array.from({ length: 64 }, () => []);

export function legalMoves(b: Board, side: number, depth = 0): number[] {
  const buf = scratch[Math.min(depth, 63)];
  genMoves(b, side, buf);
  const res: number[] = [];
  for (let i = 0; i < buf.length; i++) {
    const m = buf[i];
    const cap = makeMove(b, m);
    if (!inCheck(b, side)) res.push(m);
    unmakeMove(b, m, cap);
  }
  return res;
}

export function movesFrom(b: Board, side: number, from: number): number[] {
  return legalMoves(b, side).filter((m) => mFrom(m) === from);
}

/** 0 = ongoing, otherwise the losing side (no legal move => loss in xiangqi) */
export function gameResult(b: Board, sideToMove: number): 0 | 1 | -1 {
  if (legalMoves(b, sideToMove, 40).length > 0) return 0;
  return sideToMove as 1 | -1;
}

/* ---------------- Chinese move notation ---------------- */
const CN_NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

export function moveToText(b: Board, m: number): string {
  const from = mFrom(m);
  const to = mTo(m);
  const p = b[from];
  if (p === 0) return "";
  const side = p > 0 ? RED : BLACK;
  const t = p > 0 ? p : -p;
  const fx = from % 9;
  const fy = (from / 9) | 0;
  const tx = to % 9;
  const ty = (to / 9) | 0;

  const fileChar = (x: number) => (side === RED ? CN_NUM[9 - x] : String(x + 1));
  const numChar = (n: number) => (side === RED ? CN_NUM[n] : String(n));

  const name = charOf(p);

  // disambiguation for doubled pieces on the same file (前/后)
  let prefix = "";
  if (t !== KING) {
    let partner = -1;
    for (let y = 0; y < 10; y++) {
      const j = y * 9 + fx;
      if (j !== from && b[j] === p) partner = y;
    }
    if (partner >= 0) {
      const iAmFront = side === RED ? fy < partner : fy > partner;
      prefix = iAmFront ? "前" : "后";
    }
  }

  let tailPart: string;
  if (fy === ty) {
    tailPart = `平${fileChar(tx)}`;
  } else {
    const forward = side === RED ? ty < fy : ty > fy;
    const word = forward ? "进" : "退";
    const tail = t === HORSE || t === ELEPHANT || t === ADVISOR ? fileChar(tx) : numChar(Math.abs(ty - fy));
    tailPart = `${word}${tail}`;
  }
  return prefix ? `${prefix}${name}${tailPart}` : `${name}${fileChar(fx)}${tailPart}`;
}