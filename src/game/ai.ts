/* ------------------------------------------------------------------
   象棋 AI — negamax + alpha-beta + quiescence + iterative deepening
------------------------------------------------------------------- */
import {
  ADVISOR,
  BLACK,
  Board,
  CANNON,
  ELEPHANT,
  HORSE,
  KING,
  PAWN,
  RED,
  ROOK,
  crossedRiver,
  findKing,
  genMoves,
  inCheck,
  isAttacked,
  makeMove,
  unmakeMove,
} from "./xiangqi";

const MATE = 100000;
const INF = 1e9;

/* Base material values, indexed by piece type */
const VAL = [0, 0, 250, 250, 550, 1200, 600, 120];

/* Piece-square tables from RED's point of view (row 0 = black's back rank) */
// prettier-ignore
const PST_PAWN = [
   0,  3,  6,  9, 12,  9,  6,  3,  0,
  18, 36, 56, 80,120, 80, 56, 36, 18,
  14, 26, 42, 60, 80, 60, 42, 26, 14,
  10, 20, 30, 34, 40, 34, 30, 20, 10,
   6, 12, 18, 18, 20, 18, 18, 12,  6,
   2,  0,  8,  0,  8,  0,  8,  0,  2,
   0,  0, -2,  0,  4,  0, -2,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
];
// prettier-ignore
const PST_HORSE = [
   0, -4,  0,  0,  0,  0,  0, -4,  0,
   0,  2,  4,  4, -2,  4,  4,  2,  0,
   4,  2,  8,  8,  4,  8,  8,  2,  4,
   2,  6,  8,  6, 10,  6,  8,  6,  2,
   4, 12, 16, 14, 12, 14, 16, 12,  4,
   6, 16, 14, 18, 16, 18, 14, 16,  6,
   8, 24, 18, 24, 20, 24, 18, 24,  8,
  12, 14, 16, 20, 18, 20, 16, 14, 12,
   4, 10, 28, 16,  8, 16, 28, 10,  4,
   4,  8, 16, 12,  4, 12, 16,  8,  4,
];
// prettier-ignore
const PST_ROOK = [
  -6,  6,  4, 12, 12, 12,  4,  6, -6,
   5,  8,  6, 12, 12, 12,  6,  8,  5,
  -2,  8,  4, 12, 12, 12,  4,  8, -2,
   4,  9,  4, 12, 14, 12,  4,  9,  4,
   8, 12, 10, 16, 16, 16, 10, 12,  8,
   8, 12, 12, 18, 18, 18, 12, 12,  8,
   6, 12, 12, 18, 18, 18, 12, 12,  6,
   4,  8, 10, 14, 16, 14, 10,  8,  4,
   8,  6, 10, 12, 14, 12, 10,  6,  8,
  -2, 10,  6, 14, 12, 14,  6, 10, -2,
];
// prettier-ignore
const PST_CANNON = [
   0,  0,  2,  6,  6,  6,  2,  0,  0,
   0,  2,  4,  6,  6,  6,  4,  2,  0,
   4,  0,  8,  6, 10,  6,  8,  0,  4,
   0,  0,  0,  2,  4,  2,  0,  0,  0,
  -2,  0,  4,  2,  6,  2,  4,  0, -2,
   0,  0,  0,  2,  8,  2,  0,  0,  0,
   0,  0, -2,  4, 10,  4, -2,  0,  0,
   2,  2,  0,-10, -8,-10,  0,  2,  2,
   2,  2,  0, -4,-14, -4,  0,  2,  2,
   6,  4,  0,-10,-12,-10,  0,  4,  6,
];
// prettier-ignore
const PST_KING = [
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  1,  5,  1,  0,  0,  0,
   0,  0,  0,  3,  7,  3,  0,  0,  0,
   0,  0,  0, 11, 15, 11,  0,  0,  0,
];
// prettier-ignore
const PST_GUARD = [
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  3,  0,  0,  0,  0,
   0,  0,  0,  3,  0,  3,  0,  0,  0,
];
// prettier-ignore
const PST_ELEPHANT = [
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  2,  0,  0,  0,  2,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  3,  0,  5,  0,  3,  0,  0,
   0,  0,  0,  0,  0,  0,  0,  0,  0,
   0,  0,  2,  0,  0,  0,  2,  0,  0,
];

const PST: number[][] = [[], PST_KING, PST_GUARD, PST_ELEPHANT, PST_HORSE, PST_ROOK, PST_CANNON, PST_PAWN];

/* Pre-computed positional score per piece code per square */
const POS = new Int16Array(15 * 90); // (code+7) * 90 + sq
for (let code = -7; code <= 7; code++) {
  if (code === 0) continue;
  const t = Math.abs(code);
  for (let sq = 0; sq < 90; sq++) {
    const x = sq % 9;
    const y = (sq / 9) | 0;
    const mirrored = code > 0 ? sq : (9 - y) * 9 + x;
    POS[(code + 7) * 90 + sq] = PST[t][mirrored];
  }
}

function evaluate(b: Board, side: number): number {
  let score = 0;
  let redMat = 0;
  let blackMat = 0;
  let redMob = 0;
  let blackMob = 0;

  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (p === 0) continue;
    const t = p > 0 ? p : -p;
    const v = VAL[t] + POS[(p + 7) * 90 + i];
    if (p > 0) {
      score += v;
      if (t !== KING) redMat += VAL[t];
    } else {
      score -= v;
      if (t !== KING) blackMat += VAL[t];
    }
  }

  // mobility for the sliding / leaping attackers
  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (p === 0) continue;
    const t = p > 0 ? p : -p;
    if (t !== ROOK && t !== HORSE && t !== CANNON) continue;
    const x = i % 9;
    const y = (i / 9) | 0;
    let n = 0;
    if (t === HORSE) {
      const dxs = [1, -1, 1, -1, 2, 2, -2, -2];
      const dys = [-2, -2, 2, 2, -1, 1, -1, 1];
      for (let d = 0; d < 8; d++) {
        const nx = x + dxs[d];
        const ny = y + dys[d];
        if (nx < 0 || nx > 8 || ny < 0 || ny > 9) continue;
        const lx = Math.abs(dxs[d]) === 2 ? x + dxs[d] / 2 : x;
        const ly = Math.abs(dxs[d]) === 2 ? y : y + dys[d] / 2;
        if (b[ly * 9 + lx] !== 0) continue;
        const q = b[ny * 9 + nx];
        if (q === 0 || (p > 0 ? q < 0 : q > 0)) n++;
      }
    } else {
      const dxs = [0, 0, -1, 1];
      const dys = [-1, 1, 0, 0];
      for (let d = 0; d < 4; d++) {
        let nx = x + dxs[d];
        let ny = y + dys[d];
        let screen = false;
        while (nx >= 0 && nx < 9 && ny >= 0 && ny < 10) {
          const q = b[ny * 9 + nx];
          if (t === ROOK) {
            if (q === 0) n++;
            else {
              if (p > 0 ? q < 0 : q > 0) n++;
              break;
            }
          } else {
            if (!screen) {
              if (q === 0) n++;
              else screen = true;
            } else if (q !== 0) {
              if (p > 0 ? q < 0 : q > 0) n += 2;
              break;
            }
          }
          nx += dxs[d];
          ny += dys[d];
        }
      }
    }
    if (p > 0) redMob += n;
    else blackMob += n;
  }
  score += (redMob - blackMob) * 3;

  // pawn advance pressure & king shelter
  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (p === 0) continue;
    const t = p > 0 ? p : -p;
    const y = (i / 9) | 0;
    if (t === PAWN && crossedRiver(y, p > 0 ? RED : BLACK)) {
      score += p > 0 ? 12 : -12;
    }
  }

  // exposed-king penalty
  const rk = findKing(b, RED);
  const bk = findKing(b, BLACK);
  if (rk >= 0 && isAttacked(b, rk % 9, (rk / 9) | 0, BLACK)) score -= 24;
  if (bk >= 0 && isAttacked(b, bk % 9, (bk / 9) | 0, RED)) score += 24;

  // advisors/elephants missing => king unsafe when enemy has heavy pieces
  if (redMat > 1400 && blackMat > 1400) {
    let rGuard = 0;
    let bGuard = 0;
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (p === ADVISOR || p === ELEPHANT) rGuard++;
      else if (p === -ADVISOR || p === -ELEPHANT) bGuard++;
    }
    score += (rGuard - bGuard) * 8;
  }

  return side === RED ? score : -score;
}

/* ---------------- search state ---------------- */
let nodes = 0;
let deadline = 0;
let aborted = false;
const killers: Int32Array = new Int32Array(64 * 2);
const history = new Int32Array(90 * 90);
const moveBuf: number[][] = Array.from({ length: 96 }, () => []);
const scoreBuf: number[][] = Array.from({ length: 96 }, () => []);

function orderMoves(b: Board, moves: number[], scores: number[], ply: number) {
  const k0 = killers[ply * 2];
  const k1 = killers[ply * 2 + 1];
  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const from = (m / 90) | 0;
    const to = m % 90;
    const victim = b[to];
    let s: number;
    if (victim !== 0) {
      const vt = victim > 0 ? victim : -victim;
      const at = b[from] > 0 ? b[from] : -b[from];
      s = 1000000 + VAL[vt] * 16 - VAL[at];
    } else if (m === k0) s = 900000;
    else if (m === k1) s = 800000;
    else s = history[from * 90 + to];
    scores[i] = s;
  }
  // insertion sort (move lists are small)
  for (let i = 1; i < moves.length; i++) {
    const m = moves[i];
    const s = scores[i];
    let j = i - 1;
    while (j >= 0 && scores[j] < s) {
      moves[j + 1] = moves[j];
      scores[j + 1] = scores[j];
      j--;
    }
    moves[j + 1] = m;
    scores[j + 1] = s;
  }
}

function quiesce(b: Board, alpha: number, beta: number, side: number, ply: number): number {
  nodes++;
  if ((nodes & 2047) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return alpha;

  const stand = evaluate(b, side);
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  if (ply >= 8) return alpha;

  const moves = moveBuf[48 + Math.min(ply, 40)];
  const scores = scoreBuf[48 + Math.min(ply, 40)];
  genMoves(b, side, moves, true);
  orderMoves(b, moves, scores, 0);

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const cap = makeMove(b, m);
    if (inCheck(b, side)) {
      unmakeMove(b, m, cap);
      continue;
    }
    const sc = -quiesce(b, -beta, -alpha, -side, ply + 1);
    unmakeMove(b, m, cap);
    if (aborted) return alpha;
    if (sc >= beta) return beta;
    if (sc > alpha) alpha = sc;
  }
  return alpha;
}

function negamax(b: Board, depth: number, alpha: number, beta: number, side: number, ply: number): number {
  nodes++;
  if ((nodes & 1023) === 0 && Date.now() > deadline) aborted = true;
  if (aborted) return alpha;

  const checked = inCheck(b, side);
  if (checked) depth++; // check extension

  if (depth <= 0) return quiesce(b, alpha, beta, side, 0);
  if (ply >= 46) return evaluate(b, side);

  const moves = moveBuf[Math.min(ply, 47)];
  const scores = scoreBuf[Math.min(ply, 47)];
  genMoves(b, side, moves);
  orderMoves(b, moves, scores, ply);

  let best = -INF;
  let legal = 0;

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const from = (m / 90) | 0;
    const to = m % 90;
    const cap = makeMove(b, m);
    if (inCheck(b, side)) {
      unmakeMove(b, m, cap);
      continue;
    }
    legal++;
    const sc = -negamax(b, depth - 1, -beta, -alpha, -side, ply + 1);
    unmakeMove(b, m, cap);
    if (aborted) return best > -INF ? best : alpha;

    if (sc > best) {
      best = sc;
      if (sc > alpha) {
        alpha = sc;
        if (alpha >= beta) {
          if (b[to] === 0) {
            killers[ply * 2 + 1] = killers[ply * 2];
            killers[ply * 2] = m;
            history[from * 90 + to] += depth * depth;
          }
          break;
        }
      }
    }
  }

  if (legal === 0) return -MATE + ply * 100;
  return best;
}

export interface SearchOptions {
  maxDepth: number;
  timeMs: number;
  /** centipawn window; a random move within this window of best is chosen */
  randomness: number;
  /** probability [0..1] of a deliberate inaccuracy */
  blunder: number;
}

export interface SearchResult {
  move: number;
  score: number;
  depth: number;
  nodes: number;
  timeMs: number;
}

export interface SearchInfo {
  depth: number;
  score: number;
  nodes: number;
  bestMove: number;
}

export function findBestMove(
  board: Board | number[],
  side: number,
  opts: SearchOptions,
  onInfo?: (i: SearchInfo) => void,
): SearchResult {
  const b = Int8Array.from(board as ArrayLike<number>);
  const t0 = Date.now();
  deadline = t0 + Math.max(60, opts.timeMs);
  aborted = false;
  nodes = 0;
  killers.fill(0);
  history.fill(0);

  const rootMoves: number[] = [];
  genMoves(b, side, rootMoves);
  const legal: number[] = [];
  for (const m of rootMoves) {
    const cap = makeMove(b, m);
    if (!inCheck(b, side)) legal.push(m);
    unmakeMove(b, m, cap);
  }
  if (legal.length === 0) return { move: -1, score: -MATE, depth: 0, nodes: 0, timeMs: 0 };

  const rootScores = scoreBuf[95];
  let bestMove = legal[0];
  let bestScore = 0;
  let completedDepth = 0;
  const fullWindow = opts.randomness > 0 || opts.blunder > 0;

  for (let depth = 1; depth <= opts.maxDepth; depth++) {
    const order = legal.slice();
    const scores: number[] = new Array(order.length).fill(-INF);
    let alpha = -INF;
    const beta = INF;
    let localBest = -INF;
    let localMove = order[0];

    // put previous best first
    const pi = order.indexOf(bestMove);
    if (pi > 0) {
      order.splice(pi, 1);
      order.unshift(bestMove);
    }

    for (let i = 0; i < order.length; i++) {
      const m = order[i];
      const cap = makeMove(b, m);
      const sc = -negamax(b, depth - 1, -beta, fullWindow ? INF : -alpha, -side, 1);
      unmakeMove(b, m, cap);
      if (aborted) break;
      scores[i] = sc;
      if (sc > localBest) {
        localBest = sc;
        localMove = m;
        if (sc > alpha) alpha = sc;
      }
    }

    if (aborted) break;
    completedDepth = depth;
    bestMove = localMove;
    bestScore = localBest;
    for (let i = 0; i < order.length; i++) {
      const k = legal.indexOf(order[i]);
      if (k >= 0) rootScores[k] = scores[i];
    }
    onInfo?.({ depth, score: localBest, nodes, bestMove: localMove });
    if (Math.abs(localBest) > MATE - 5000) break;
    if (Date.now() - t0 > opts.timeMs * 0.5) break;
  }

  // difficulty flavouring
  if (opts.blunder > 0 && Math.random() < opts.blunder && legal.length > 1) {
    const pool = legal.filter((_, i) => rootScores[i] > -MATE + 5000);
    if (pool.length > 1) {
      const pick = pool[(Math.random() * pool.length) | 0];
      return {
        move: pick,
        score: bestScore,
        depth: completedDepth,
        nodes,
        timeMs: Date.now() - t0,
      };
    }
  }
  if (opts.randomness > 0 && completedDepth > 0) {
    const cands: number[] = [];
    for (let i = 0; i < legal.length; i++) {
      if (rootScores[i] >= bestScore - opts.randomness) cands.push(legal[i]);
    }
    if (cands.length > 1) bestMove = cands[(Math.random() * cands.length) | 0];
  }

  return {
    move: bestMove,
    score: bestScore,
    depth: completedDepth,
    nodes,
    timeMs: Date.now() - t0,
  };
}

export const DIFFICULTY_PRESETS: Record<string, SearchOptions> = {
  easy: { maxDepth: 2, timeMs: 350, randomness: 120, blunder: 0.24 },
  medium: { maxDepth: 3, timeMs: 700, randomness: 40, blunder: 0.07 },
  hard: { maxDepth: 4, timeMs: 1100, randomness: 0, blunder: 0 },
  super: { maxDepth: 7, timeMs: 2300, randomness: 0, blunder: 0 },
};