// 中国象棋核心引擎：走法生成、将军判定、评估与 AI 搜索
export type Color = 'r' | 'b';
export type PType = 'k' | 'a' | 'b' | 'n' | 'r' | 'c' | 'p';
export interface Piece {
  t: PType;
  c: Color;
}
export type Board = (Piece | null)[][];
export interface Pos {
  x: number;
  y: number;
}
export interface Move {
  fx: number;
  fy: number;
  tx: number;
  ty: number;
}

export const COLS = 9;
export const ROWS = 10;

export function emptyBoard(): Board {
  return Array.from({ length: ROWS }, () => Array<Piece | null>(COLS).fill(null));
}

export function initialBoard(): Board {
  const b = emptyBoard();
  const put = (x: number, y: number, t: PType, c: Color) => {
    b[y][x] = { t, c };
  };
  // 黑方 (顶部)
  put(0, 0, 'r', 'b'); put(1, 0, 'n', 'b'); put(2, 0, 'b', 'b'); put(3, 0, 'a', 'b');
  put(4, 0, 'k', 'b'); put(5, 0, 'a', 'b'); put(6, 0, 'b', 'b'); put(7, 0, 'n', 'b'); put(8, 0, 'r', 'b');
  put(1, 2, 'c', 'b'); put(7, 2, 'c', 'b');
  put(0, 3, 'p', 'b'); put(2, 3, 'p', 'b'); put(4, 3, 'p', 'b'); put(6, 3, 'p', 'b'); put(8, 3, 'p', 'b');
  // 红方 (底部)
  put(0, 9, 'r', 'r'); put(1, 9, 'n', 'r'); put(2, 9, 'b', 'r'); put(3, 9, 'a', 'r');
  put(4, 9, 'k', 'r'); put(5, 9, 'a', 'r'); put(6, 9, 'b', 'r'); put(7, 9, 'n', 'r'); put(8, 9, 'r', 'r');
  put(1, 7, 'c', 'r'); put(7, 7, 'c', 'r');
  put(0, 6, 'p', 'r'); put(2, 6, 'p', 'r'); put(4, 6, 'p', 'r'); put(6, 6, 'p', 'r'); put(8, 6, 'p', 'r');
  return b;
}

export function inBoard(x: number, y: number) {
  return x >= 0 && x < COLS && y >= 0 && y < ROWS;
}

export function inPalace(x: number, y: number, c: Color) {
  if (x < 3 || x > 5) return false;
  if (c === 'b') return y >= 0 && y <= 2;
  return y >= 7 && y <= 9;
}

export function cloneBoard(b: Board): Board {
  return b.map((row) => row.map((p) => (p ? { t: p.t, c: p.c } : null)));
}

// 伪走法（不考虑自己被将军，包含吃将，用于将军判定）
export function pseudoMoves(board: Board, x: number, y: number): Pos[] {
  const pc = board[y][x];
  if (!pc) return [];
  const res: Pos[] = [];
  const add = (nx: number, ny: number) => {
    if (!inBoard(nx, ny)) return;
    const t = board[ny][nx];
    if (!t || t.c !== pc.c) res.push({ x: nx, y: ny });
  };
  const { t, c } = pc;
  if (t === 'k') {
    add(x + 1, y); add(x - 1, y); add(x, y + 1); add(x, y - 1);
    // 飞将
    const dir = c === 'r' ? -1 : 1;
    let ny = y + dir;
    let blocked = false;
    while (ny >= 0 && ny < ROWS) {
      const p = board[ny][x];
      if (p) {
        if (p.t === 'k' && p.c !== c && !blocked) {
          res.push({ x, y: ny });
        }
        break;
      }
      ny += dir;
    }
    // palace filter for normal king steps
    return res.filter((p) => {
      if (p.x === x && Math.abs(p.y - y) > 1 && board[p.y][p.x]?.t === 'k') return true; // 飞将允许
      return inPalace(p.x, p.y, c);
    });
  }
  if (t === 'a') {
    const ds = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    for (const [dx, dy] of ds) {
      const nx = x + dx, ny = y + dy;
      if (inPalace(nx, ny, c)) add(nx, ny);
    }
    return res;
  }
  if (t === 'b') {
    const ds = [[2, 2], [2, -2], [-2, 2], [-2, -2]];
    for (const [dx, dy] of ds) {
      const nx = x + dx, ny = y + dy;
      if (!inBoard(nx, ny)) continue;
      // 不过河
      if (c === 'r' && ny < 5) continue;
      if (c === 'b' && ny > 4) continue;
      const ex = x + dx / 2, ey = y + dy / 2;
      if (board[ey][ex]) continue; // 塞象眼
      add(nx, ny);
    }
    return res;
  }
  if (t === 'n') {
    const legs: [number, number, number, number][] = [
      [1, 0, 2, 1], [1, 0, 2, -1], [-1, 0, -2, 1], [-1, 0, -2, -1],
      [0, 1, 1, 2], [0, 1, -1, 2], [0, -1, 1, -2], [0, -1, -1, -2],
    ];
    for (const [lx, ly, dx, dy] of legs) {
      if (board[y + ly]?.[x + lx]) continue; // 蹩马腿
      add(x + dx, y + dy);
    }
    return res;
  }
  if (t === 'r') {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      let nx = x + dx, ny = y + dy;
      while (inBoard(nx, ny)) {
        const occ = board[ny][nx];
        if (!occ) res.push({ x: nx, y: ny });
        else {
          if (occ.c !== c) res.push({ x: nx, y: ny });
          break;
        }
        nx += dx; ny += dy;
      }
    }
    return res;
  }
  if (t === 'c') {
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (const [dx, dy] of dirs) {
      let nx = x + dx, ny = y + dy;
      // 不吃子：直走
      while (inBoard(nx, ny) && !board[ny][nx]) {
        res.push({ x: nx, y: ny });
        nx += dx; ny += dy;
      }
      // 找炮架
      if (!inBoard(nx, ny)) continue;
      nx += dx; ny += dy;
      while (inBoard(nx, ny)) {
        const occ = board[ny][nx];
        if (occ) {
          if (occ.c !== c) res.push({ x: nx, y: ny });
          break;
        }
        nx += dx; ny += dy;
      }
    }
    return res;
  }
  if (t === 'p') {
    const fwd = c === 'r' ? -1 : 1;
    add(x, y + fwd);
    const crossed = c === 'r' ? y <= 4 : y >= 5;
    if (crossed) {
      add(x + 1, y); add(x - 1, y);
    }
    return res;
  }
  return res;
}

export function findKing(board: Board, c: Color): Pos | null {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.t === 'k' && p.c === c) return { x, y };
    }
  return null;
}

export function kingsFacing(board: Board): boolean {
  const rk = findKing(board, 'r');
  const bk = findKing(board, 'b');
  if (!rk || !bk) return false;
  if (rk.x !== bk.x) return false;
  const [top, bot] = rk.y < bk.y ? [rk.y, bk.y] : [bk.y, rk.y];
  for (let y = top + 1; y < bot; y++) {
    if (board[y][rk.x]) return false;
  }
  return true;
}

export function isSquareAttacked(board: Board, x: number, y: number, by: Color): boolean {
  for (let sy = 0; sy < ROWS; sy++) {
    for (let sx = 0; sx < COLS; sx++) {
      const p = board[sy][sx];
      if (!p || p.c !== by) continue;
      const ms = pseudoMoves(board, sx, sy);
      for (const m of ms) if (m.x === x && m.y === y) return true;
    }
  }
  return false;
}

export function isInCheck(board: Board, c: Color): boolean {
  const k = findKing(board, c);
  if (!k) return true;
  if (kingsFacing(board)) return true;
  const opp: Color = c === 'r' ? 'b' : 'r';
  return isSquareAttacked(board, k.x, k.y, opp);
}

export function doMove(board: Board, m: Move): Piece | null {
  const mover = board[m.fy][m.fx];
  const cap = board[m.ty][m.tx];
  board[m.ty][m.tx] = mover;
  board[m.fy][m.fx] = null;
  return cap;
}
export function undoMove(board: Board, m: Move, cap: Piece | null) {
  const mover = board[m.ty][m.tx];
  board[m.fy][m.fx] = mover;
  board[m.ty][m.tx] = cap;
}

export interface LegalMove extends Move {
  captured: Piece | null;
}

export function legalMovesFor(board: Board, x: number, y: number): LegalMove[] {
  const pc = board[y][x];
  if (!pc) return [];
  const out: LegalMove[] = [];
  for (const d of pseudoMoves(board, x, y)) {
    const target = board[d.y][d.x];
    // 不能吃将（将帅不能被吃，只能绝杀）
    if (target && target.t === 'k') {
      // 飞将吃将也不允许作为合法走法（靠照面判负/将军）
      continue;
    }
    const m: Move = { fx: x, fy: y, tx: d.x, ty: d.y };
    const cap = doMove(board, m);
    const illegal = isInCheck(board, pc.c);
    undoMove(board, m, cap);
    if (!illegal) out.push({ ...m, captured: target });
  }
  return out;
}

export function allLegalMoves(board: Board, c: Color): LegalMove[] {
  const res: LegalMove[] = [];
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.c === c) {
        const ms = legalMovesFor(board, x, y);
        for (const m of ms) res.push(m);
      }
    }
  return res;
}

export function hasLegalMoves(board: Board, c: Color): boolean {
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.c === c) {
        const ms = legalMovesFor(board, x, y);
        if (ms.length > 0) return true;
      }
    }
  return false;
}

// ---------- 评估 ----------
const VAL: Record<PType, number> = { k: 100000, r: 600, n: 285, c: 300, b: 120, a: 120, p: 60 };

export function pieceValue(t: PType): number {
  return VAL[t] ?? 0;
}

function posBonus(p: Piece, x: number, y: number): number {
  const cx = Math.abs(x - 4);
  if (p.t === 'p') {
    const crossed = p.c === 'r' ? y <= 4 : y >= 5;
    if (!crossed) {
      // 未过河：越靠前越好一点点
      const adv = p.c === 'r' ? (6 - y) * 6 : (y - 3) * 6;
      return adv + (cx <= 1 ? 6 : 0);
    }
    const depth = p.c === 'r' ? (4 - y) * 14 : (y - 5) * 14;
    const center = cx === 0 ? 24 : cx === 1 ? 16 : cx === 2 ? 8 : 0;
    return 70 + depth + center;
  }
  if (p.t === 'n') {
    // 马走日，中央最好
    const dist = Math.abs(x - 4) + Math.abs(y - 4.5);
    return Math.round((9 - dist) * 5);
  }
  if (p.t === 'c') {
    const dist = Math.abs(x - 4) * 0.6 + Math.abs(y - 4.5) * 0.4;
    return Math.round((7 - dist) * 4);
  }
  if (p.t === 'r') {
    // 车占要道：中央文件/横线小加成
    let b = 0;
    if (x === 4) b += 12;
    if (x >= 3 && x <= 5) b += 6;
    if (y === 4 || y === 5) b += 4;
    return b;
  }
  if (p.t === 'k') {
    return (x === 4 ? 10 : 0) + (p.c === 'r' ? (y === 9 ? 6 : 0) : y === 0 ? 6 : 0);
  }
  return 0;
}

// 红方视角：正数红优
export function evaluate(board: Board): number {
  let s = 0;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (!p) continue;
      const v = VAL[p.t] + posBonus(p, x, y);
      s += p.c === 'r' ? v : -v;
    }
  return s;
}

function orderMoves(board: Board, moves: LegalMove[]): LegalMove[] {
  return moves
    .map((m) => {
      let s = 0;
      if (m.captured) {
        s = 10 * pieceValue(m.captured.t) - pieceValue(board[m.fy][m.fx]?.t ?? 'p') / 10;
      }
      // 吃子优先 + 向前
      const adv = board[m.fy][m.fx]?.c === 'r' ? m.fy - m.ty : m.ty - m.fy;
      s += adv * 2;
      return { m, s };
    })
    .sort((a, b) => b.s - a.s)
    .map((o) => o.m);
}

// ---------- AI ----------
export type Difficulty = 'simple' | 'medium' | 'advanced' | 'super';

export const DIFF_CONFIG: Record<Difficulty, { depth: number; noise: number; randomPick: number; quiescence: boolean; label: string }> = {
  simple: { depth: 1, noise: 160, randomPick: 0.35, quiescence: false, label: '简单' },
  medium: { depth: 2, noise: 35, randomPick: 0.08, quiescence: false, label: '中等' },
  advanced: { depth: 3, noise: 0, randomPick: 0, quiescence: false, label: '高级' },
  super: { depth: 4, noise: 0, randomPick: 0, quiescence: true, label: '超级' },
};

const MATE = 1000000;

function quiescence(board: Board, alpha: number, beta: number, turn: Color, ply: number): number {
  const stand = (turn === 'r' ? evaluate(board) : -evaluate(board));
  if (ply >= 4) return stand;
  if (stand >= beta) return beta;
  if (stand > alpha) alpha = stand;
  const moves = orderMoves(board, allLegalMoves(board, turn).filter((m) => m.captured));
  for (const m of moves) {
    const cap = doMove(board, m);
    const score = -quiescence(board, -beta, -alpha, turn === 'r' ? 'b' : 'r', ply + 1);
    undoMove(board, m, cap);
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(board: Board, depth: number, alpha: number, beta: number, turn: Color, ply: number, useQ: boolean): number {
  const moves = orderMoves(board, allLegalMoves(board, turn));
  if (moves.length === 0) {
    // 无棋可走即负（绝杀或困毙）
    return -MATE + ply;
  }
  if (depth <= 0) {
    if (useQ) return quiescence(board, alpha, beta, turn, 0);
    return turn === 'r' ? evaluate(board) : -evaluate(board);
  }
  let best = -Infinity;
  for (const m of moves) {
    const cap = doMove(board, m);
    const score = -negamax(board, depth - 1, -beta, -alpha, turn === 'r' ? 'b' : 'r', ply + 1, useQ);
    undoMove(board, m, cap);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

export function searchBest(board: Board, turn: Color, diff: Difficulty): LegalMove | null {
  const cfg = DIFF_CONFIG[diff];
  const moves = orderMoves(board, allLegalMoves(board, turn));
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  // 简单难度：有概率直接随机
  if (cfg.randomPick > 0 && Math.random() < cfg.randomPick) {
    const caps = moves.filter((m) => m.captured);
    const pool = caps.length > 0 && Math.random() < 0.7 ? caps : moves;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // 超级难度自适应：开局子多时用 3层+静态搜索保证速度，残局子少时用 4层深度
  let effDepth = cfg.depth;
  let useQ = cfg.quiescence;
  if (diff === 'super') {
    if (moves.length > 30) {
      effDepth = 3;
      useQ = true;
    } else if (moves.length > 18) {
      effDepth = 3;
      useQ = true;
    } else {
      effDepth = 4;
      useQ = true;
    }
    // 限制根节点广度防止手机卡顿：只搜前 28 招（已按吃子排序）
    if (moves.length > 28 && effDepth >= 3) {
      moves.length = 28;
    }
  }
  // 高级难度残局也限广度
  if (diff === 'advanced' && moves.length > 34) {
    moves.length = 34;
  }

  let best: LegalMove | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;

  const ordered = [...moves];

  for (const m of ordered) {
    const cap = doMove(board, m);
    let score = -negamax(board, effDepth - 1, -beta, -alpha, turn === 'r' ? 'b' : 'r', 1, useQ);
    undoMove(board, m, cap);
    if (cfg.noise > 0) score += (Math.random() * 2 - 1) * cfg.noise;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
    if (score > alpha) alpha = score;
  }
  return best;
}

// 提示：用中等深度给红方找招
export function hintMove(board: Board, turn: Color): LegalMove | null {
  const moves = orderMoves(board, allLegalMoves(board, turn));
  if (!moves.length) return null;
  let best: LegalMove | null = null;
  let bestScore = -Infinity;
  let alpha = -Infinity;
  for (const m of moves) {
    const cap = doMove(board, m);
    const score = -negamax(board, 1, -Infinity, -alpha, turn === 'r' ? 'b' : 'r', 1, false);
    undoMove(board, m, cap);
    if (score > bestScore) { bestScore = score; best = m; }
    if (score > alpha) alpha = score;
  }
  return best;
}

export const SCORE_TABLE: Record<PType, number> = { k: 1000, r: 500, n: 300, c: 300, b: 150, a: 150, p: 100 };
export const DIFF_MULT: Record<Difficulty, number> = { simple: 1, medium: 1.5, advanced: 2, super: 3 };

export function charOf(p: Piece): string {
  if (p.c === 'r') {
    switch (p.t) {
      case 'k': return '帥';
      case 'a': return '仕';
      case 'b': return '相';
      case 'n': return '馬';
      case 'r': return '俥';
      case 'c': return '炮';
      case 'p': return '兵';
    }
  } else {
    switch (p.t) {
      case 'k': return '將';
      case 'a': return '士';
      case 'b': return '象';
      case 'n': return '馬';
      case 'r': return '車';
      case 'c': return '炮';
      case 'p': return '卒';
    }
  }
  return '';
}
