import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bot, Crown, Download, Flame, Home, Lightbulb, Pause, Play, RotateCcw, Swords, Sprout,
  Trophy, Undo2, Users, Volume2, VolumeX, Swords as VersusIcon, Medal, Zap, Target, Flag,
} from 'lucide-react';
import {
  Board as EBoard, Color, Difficulty, LegalMove, Move, PType,
  allLegalMoves, charOf, DIFF_MULT, hintMove, initialBoard, isInCheck,
  legalMovesFor, searchBest, SCORE_TABLE, findKing,
} from './game/xiangqi';
import { sfx, setSoundEnabled } from './game/audio';
import { getName, loadScores, qualifies, saveScore, setName, type HighScore } from './game/storage';
import ParticleCanvas, { type ParticleHandle } from './components/ParticleCanvas';
import OnlineGame from './OnlineGame';

type Phase = 'menu' | 'playing' | 'paused' | 'over';
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
interface Cell { id: string; t: PType; c: Color; }
type CellBoard = (Cell | null)[][];
interface HistEntry { move: Move; captured: Cell | null; scoreDelta: number; comboBefore: number; streakBefore: boolean; checkBefore: boolean; noCapBefore: number; }
interface ScorePop { id: number; bx: number; by: number; text: string; color: string; big?: boolean }

const DIFF_META: Record<Difficulty, { name: string; title: string; desc: string; color: string; bg: string; border: string }> = {
  simple: { name: '简单', title: '新手陪练', desc: '随性出招 · 适合热身', color: 'text-emerald-300', bg: 'from-emerald-500/20 to-emerald-900/30', border: 'border-emerald-400/40' },
  medium: { name: '中等', title: '稳扎稳打', desc: '攻守兼备 · 稍加思考', color: 'text-sky-300', bg: 'from-sky-500/20 to-sky-900/30', border: 'border-sky-400/40' },
  advanced: { name: '高级', title: '步步为营', desc: '深度算路 · 颇具压力', color: 'text-orange-300', bg: 'from-orange-500/20 to-red-900/30', border: 'border-orange-400/40' },
  super: { name: '超级', title: '棋圣附体', desc: '极致计算 · 步步杀机', color: 'text-amber-300', bg: 'from-amber-500/25 to-red-900/40', border: 'border-amber-400/50' },
};
const DIFF_ICON: Record<Difficulty, any> = { simple: Sprout, medium: Swords, advanced: Flame, super: Crown };

let uid = 0;
function buildBoard(): CellBoard {
  const eb = initialBoard();
  return eb.map((row) => row.map((p) => (p ? { id: `pc-${uid++}`, t: p.t, c: p.c } : null)));
}
function cloneCells(b: CellBoard): CellBoard {
  return b.map((row) => row.map((c) => (c ? { ...c } : null)));
}

export default function App() {
  const [phase, setPhase] = useState<Phase>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('simple');
  const [board, setBoard] = useState<CellBoard>(() => buildBoard());
  const [turn, setTurn] = useState<Color>('r');
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [legal, setLegal] = useState<LegalMove[]>([]);
  const [cursor, setCursor] = useState({ x: 4, y: 9 });
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [history, setHistory] = useState<HistEntry[]>([]);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [streak, setStreak] = useState(false);
  const [moveCount, setMoveCount] = useState(0);
  const [capCount, setCapCount] = useState(0);
  const [checkCount, setCheckCount] = useState(0);
  const [noCap, setNoCap] = useState(0);
  const [checkR, setCheckR] = useState(false);
  const [checkB, setCheckB] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [hint, setHint] = useState<Move | null>(null);
  const [shake, setShake] = useState('');
  const [pops, setPops] = useState<ScorePop[]>([]);
  const [comboFlash, setComboFlash] = useState<string | null>(null);
  const [winner, setWinner] = useState<Color | 'draw' | null>(null);
  const [winReason, setWinReason] = useState('');
  const [scores, setScores] = useState<HighScore[]>(() => loadScores());
  const [playerName, setPlayerName] = useState(() => getName());
  const [saved, setSaved] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showHow, setShowHow] = useState(false);
  const [startAnim, setStartAnim] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installTip, setInstallTip] = useState('');
  const [onlineMode, setOnlineMode] = useState(false);

  const particles = useRef<ParticleHandle>(null);
  const boardBox = useRef<HTMLDivElement>(null);
  const gameId = useRef(0);
  const aiTimer = useRef<number | undefined>(undefined);
  const hintTimer = useRef<number | undefined>(undefined);
  const shakeTimer = useRef<number | undefined>(undefined);
  const popId = useRef(0);
  const boardRef = useRef(board);
  boardRef.current = board;
  const turnRef = useRef(turn);
  turnRef.current = turn;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const diffRef = useRef(difficulty);
  diffRef.current = difficulty;
  const scoreRef = useRef(score);
  scoreRef.current = score;
  const comboRef = useRef(combo);
  comboRef.current = combo;
  const streakRef = useRef(streak);
  streakRef.current = streak;
  const noCapRef = useRef(noCap);
  noCapRef.current = noCap;
  const moveCountRef = useRef(moveCount);
  moveCountRef.current = moveCount;
  const capCountRef = useRef(capCount);
  capCountRef.current = capCount;
  const lockRef = useRef(false);

  const mult = DIFF_MULT[difficulty];
  const isNativeApp = !!(window as any).Capacitor?.isNativePlatform?.() || /Capacitor/i.test(navigator.userAgent);

  // ---------- helpers ----------
  const triggerShake = useCallback((kind: 'shake-sm' | 'shake-lg') => {
    setShake('');
    requestAnimationFrame(() => {
      setShake(kind);
      window.clearTimeout(shakeTimer.current);
      shakeTimer.current = window.setTimeout(() => setShake(''), kind === 'shake-lg' ? 520 : 360);
    });
  }, []);

  const cellClient = useCallback((x: number, y: number) => {
    const el = boardBox.current;
    if (!el) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = el.getBoundingClientRect();
    return { x: r.left + ((x + 0.5) / 9) * r.width, y: r.top + ((y + 0.5) / 10) * r.height };
  }, []);

  const addPop = useCallback((bx: number, by: number, text: string, color = '#ffd76a', big = false) => {
    const id = ++popId.current;
    setPops((p) => [...p.slice(-6), { id, bx, by, text, color, big }]);
    window.setTimeout(() => setPops((p) => p.filter((o) => o.id !== id)), 1150);
  }, []);

  const burstAt = useCallback((x: number, y: number, big: boolean, isRedCapture: boolean) => {
    const pt = cellClient(x, y);
    if (big) {
      particles.current?.burst(pt.x, pt.y, { count: 46, power: 9, size: 5, colors: isRedCapture ? ['#ffd76a', '#ff9d3c', '#ff5252', '#fff6d8'] : ['#9db4ff', '#ff6b6b', '#e0e0e0', '#ffd76a'] });
      particles.current?.ring(pt.x, pt.y, isRedCapture ? '#ffd76a' : '#ff6b6b');
    } else {
      particles.current?.burst(pt.x, pt.y, { count: 18, power: 5.5, size: 3.5 });
    }
  }, [cellClient]);

  const refreshCheck = useCallback((b: CellBoard) => {
    setCheckR(isInCheck(b as unknown as EBoard, 'r'));
    setCheckB(isInCheck(b as unknown as EBoard, 'b'));
  }, []);

  // ---------- 游戏流程 ----------
  const newGame = useCallback((d?: Difficulty) => {
    const nd = d ?? diffRef.current;
    gameId.current++;
    window.clearTimeout(aiTimer.current);
    window.clearTimeout(hintTimer.current);
    lockRef.current = false;
    turnRef.current = 'r';
    const fresh = buildBoard();
    boardRef.current = fresh;
    setDifficulty(nd);
    setBoard(fresh);
    setTurn('r');
    setSelected(null);
    setLegal([]);
    setCursor({ x: 4, y: 9 });
    setLastMove(null);
    setHistory([]);
    setScore(0);
    setCombo(0);
    setStreak(false);
    setMoveCount(0);
    setCapCount(0);
    setCheckCount(0);
    setNoCap(0);
    setCheckR(false);
    setCheckB(false);
    setThinking(false);
    setHint(null);
    setWinner(null);
    setWinReason('');
    setPops([]);
    setComboFlash(null);
    setSaved(false);
    setPhase('playing');
    setStartAnim(true);
    window.setTimeout(() => setStartAnim(false), 600);
    sfx.click();
  }, []);

  const endGame = useCallback((w: Color | 'draw', reason: string, finalBoard: CellBoard, finalScore: number, finalMoves: number, finalCaps: number) => {
    gameId.current++;
    window.clearTimeout(aiTimer.current);
    const multL = DIFF_MULT[diffRef.current];
    let bonus = 0;
    if (w === 'r') bonus = Math.round(1000 * multL);
    else if (w === 'draw') bonus = Math.round(300 * multL);
    const total = finalScore + bonus;
    setScore(total);
    if (bonus > 0) {
      addPop(4, 4, `+${bonus} ${w === 'r' ? '获胜奖励' : '和棋奖励'}`, '#7df9ff', true);
    }
    setWinner(w);
    setWinReason(bonus > 0 ? `${reason} · +${bonus}奖励` : reason);
    setThinking(false);
    setPhase('over');
    setScores(loadScores());
    setSaved(false);
    const cx = window.innerWidth / 2, cy = window.innerHeight * 0.35;
    if (w === 'r') {
      sfx.win();
      particles.current?.confetti();
      particles.current?.burst(cx, cy, { count: 80, power: 10, size: 5 });
      particles.current?.ring(cx, cy, '#ffd76a');
      triggerShake('shake-sm');
      if (navigator.vibrate) navigator.vibrate([60, 40, 80]);
    } else if (w === 'b') {
      sfx.lose();
      triggerShake('shake-lg');
      if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
    } else {
      sfx.draw();
    }
    void finalBoard; void finalMoves; void finalCaps;
  }, [triggerShake, addPop]);

  const applyMove = useCallback((b: CellBoard, m: Move, byAI: boolean, sc: number, cb: number, st: boolean, nc: number, mv: number, cc: number): {
    nb: CellBoard; nsc: number; ncb: number; nst: boolean; nnc: number; nmv: number; ncc: number; gaveCheck: boolean; captured: Cell | null; ended: boolean;
  } | null => {
    const nb = cloneCells(b);
    const mover = nb[m.fy][m.fx];
    if (!mover) return null;
    const captured = nb[m.ty][m.tx];
    nb[m.ty][m.tx] = mover;
    nb[m.fy][m.fx] = null;

    let nsc = sc, ncb = cb, nst = st, ncc = cc;
    const multL = DIFF_MULT[diffRef.current];
    const isPlayer = !byAI;
    let delta = 0;

    if (captured) {
      if (isPlayer) {
        ncc += 1;
        const base = Math.round(SCORE_TABLE[captured.t] * multL);
        let newCombo = 1;
        if (st) newCombo = cb + 1;
        ncb = newCombo;
        nst = true;
        const bonus = newCombo >= 2 ? Math.round(base * 0.5 * (newCombo - 1)) : 0;
        delta = base + bonus;
        nsc += delta;
        if (newCombo >= 2) {
          setComboFlash(`连吃 x${newCombo}！ +${delta}`);
          window.setTimeout(() => setComboFlash(null), 1400);
        }
        addPop(m.tx, m.ty, `+${delta}`, newCombo >= 2 ? '#ff9d3c' : '#ffd76a', true);
      } else {
        nst = false;
        ncb = 0;
        addPop(m.tx, m.ty, '被吃', '#ff7b7b', false);
      }
    } else {
      if (isPlayer) { ncb = 0; nst = false; }
    }

    const nnc = captured ? 0 : nc + 1;
    const nmv = isPlayer ? mv + 1 : mv;

    // 将军判定
    const next: Color = byAI ? 'r' : 'b';
    const gaveCheck = isInCheck(nb as unknown as EBoard, next);
    if (gaveCheck && isPlayer) {
      const chk = Math.round(50 * multL);
      nsc += chk;
      delta += chk;
      setCheckCount((c) => c + 1);
      addPop(m.tx, m.ty - 0.6 < 0 ? m.ty : m.ty - 0.001, '将军! +50', '#7df9ff', false);
    }

    return { nb, nsc, ncb, nst, nnc, nmv, ncc, gaveCheck, captured, ended: false };
  }, [addPop]);

  const checkTerminal = useCallback((b: CellBoard, sideToMove: Color, noCapN: number): { over: boolean; w: Color | 'draw'; reason: string } => {
    const eb = b as unknown as EBoard;
    const rk = findKing(eb, 'r');
    const bk = findKing(eb, 'b');
    if (!rk) return { over: true, w: 'b', reason: '帅被擒获' };
    if (!bk) return { over: true, w: 'r', reason: '直捣黄龙 · 擒获敌将' };
    const moves = allLegalMoves(eb, sideToMove);
    if (moves.length === 0) {
      const inChk = isInCheck(eb, sideToMove);
      if (sideToMove === 'r') {
        return { over: true, w: 'b', reason: inChk ? '绝杀 · 无路可走' : '困毙 · 无子可动' };
      }
      return { over: true, w: 'r', reason: inChk ? '绝杀取胜！' : '困毙取胜！' };
    }
    if (noCapN >= 120) return { over: true, w: 'draw', reason: '连续 60 回合无吃子 · 和棋' };
    return { over: false, w: 'draw', reason: '' };
  }, []);

  const doAIMove = useCallback((gid: number) => {
    const b = boardRef.current;
    const eb = b as unknown as EBoard;
    // 深拷贝给搜索（搜索会改棋盘再还原，但为保险用克隆）
    const searchBoard = eb.map((row) => row.map((p) => (p ? { ...p } : null))) as EBoard;
    let best: LegalMove | null = null;
    try {
      best = searchBest(searchBoard, 'b', diffRef.current);
    } catch {
      const all = allLegalMoves(searchBoard, 'b');
      best = all.length ? all[(Math.random() * all.length) | 0] : null;
    }
    if (gid !== gameId.current || phaseRef.current !== 'playing') return;
    if (!best) {
      endGame('r', '黑方无棋可走 · 获胜！', boardRef.current, scoreRef.current, moveCountRef.current, capCountRef.current);
      return;
    }
    // 应用 AI 走法（用 ref 取最新分数，避免闭包过期覆盖玩家得分）
    const curScore = scoreRef.current;
    const curCombo = comboRef.current;
    const curStreak = streakRef.current;
    const curNoCap = noCapRef.current;
    const curMoves = moveCountRef.current;
    const curCaps = capCountRef.current;
    const r = applyMove(boardRef.current, best!, true, curScore, curCombo, curStreak, curNoCap, curMoves, curCaps);
    if (!r) {
      setThinking(false);
      lockRef.current = false;
      turnRef.current = 'r';
      return;
    }
    boardRef.current = r.nb;
    setBoard(r.nb);
    setScore(r.nsc); setCombo(r.ncb); setStreak(r.nst); setNoCap(r.nnc); setMoveCount(r.nmv); setCapCount(r.ncc);
    setLastMove({ fx: best!.fx, fy: best!.fy, tx: best!.tx, ty: best!.ty });
    setHistory((h) => [...h, { move: { fx: best!.fx, fy: best!.fy, tx: best!.tx, ty: best!.ty }, captured: r.captured, scoreDelta: r.nsc - curScore, comboBefore: curCombo, streakBefore: curStreak, checkBefore: false, noCapBefore: curNoCap }]);
    refreshCheck(r.nb);
    if (r.captured) {
      sfx.capture();
      triggerShake('shake-sm');
      burstAt(best!.tx, best!.ty, r.captured.t === 'r' || r.captured.t === 'c' || r.captured.t === 'n', false);
      if (navigator.vibrate) navigator.vibrate(35);
    } else {
      sfx.move();
    }
    if (r.gaveCheck) {
      sfx.check();
      triggerShake('shake-sm');
      const pt = cellClient(best!.tx, best!.ty);
      particles.current?.ring(pt.x, pt.y, '#ff5252');
      if (navigator.vibrate) navigator.vibrate([30, 40, 30]);
    }
    setTurn('r');
    turnRef.current = 'r';
    lockRef.current = false;
    setCursor({ x: best!.tx, y: best!.ty });
    const t = checkTerminal(r.nb, 'r', r.nnc);
    if (t.over) {
      window.setTimeout(() => endGame(t.w, t.reason, r.nb, r.nsc, r.nmv, r.ncc), 550);
    }
    setThinking(false);
  }, [applyMove, burstAt, cellClient, checkTerminal, endGame, refreshCheck, triggerShake]);

  const scheduleAI = useCallback(() => {
    setThinking(true);
    const gid = gameId.current;
    window.clearTimeout(aiTimer.current);
    const delay = diffRef.current === 'super' ? 550 : diffRef.current === 'advanced' ? 500 : 420;
    aiTimer.current = window.setTimeout(() => {
      // 让出 UI 一帧再算，避免卡顿感
      requestAnimationFrame(() => window.setTimeout(() => doAIMove(gid), 30));
    }, delay);
  }, [doAIMove]);

  const playerMove = useCallback((fx: number, fy: number, tx: number, ty: number) => {
    if (phaseRef.current !== 'playing' || turnRef.current !== 'r' || lockRef.current) return;
    lockRef.current = true;
    turnRef.current = 'b';
    const prev = boardRef.current;
    const m: Move = { fx, fy, tx, ty };
    const r = applyMove(prev, m, false, score, combo, streak, noCap, moveCount, capCount);
    if (!r) { lockRef.current = false; turnRef.current = 'r'; return; }
    const gid = gameId.current;
    void gid;
    boardRef.current = r.nb;
    setBoard(r.nb);
    setScore(r.nsc); setCombo(r.ncb); setStreak(r.nst); setNoCap(r.nnc); setMoveCount(r.nmv); setCapCount(r.ncc);
    setLastMove({ ...m });
    setHistory((h) => [...h, { move: { ...m }, captured: r.captured, scoreDelta: r.nsc - score, comboBefore: combo, streakBefore: streak, checkBefore: false, noCapBefore: noCap }]);
    setSelected(null); setLegal([]); setHint(null);
    refreshCheck(r.nb);
    if (r.captured) {
      sfx.capture();
      triggerShake(r.captured.t === 'r' || r.captured.t === 'c' ? 'shake-lg' : 'shake-sm');
      burstAt(tx, ty, true, true);
      setCapCount(r.ncc);
      if (navigator.vibrate) navigator.vibrate(25);
    } else {
      sfx.move();
      burstAt(tx, ty, false, true);
      if (navigator.vibrate) navigator.vibrate(8);
    }
    if (r.gaveCheck) {
      window.setTimeout(() => sfx.check(), 120);
      triggerShake('shake-sm');
      const pt = cellClient(tx, ty);
      particles.current?.ring(pt.x, pt.y, '#ffd76a');
    }
    // 终局？
    const t = checkTerminal(r.nb, 'b', r.nnc);
    if (t.over) {
      setTurn('b');
      lockRef.current = false;
      window.setTimeout(() => endGame(t.w, t.reason, r.nb, r.nsc, r.nmv, r.ncc), 600);
      return;
    }
    setTurn('b');
    scheduleAI();
  }, [applyMove, burstAt, capCount, cellClient, checkTerminal, combo, endGame, history, moveCount, noCap, refreshCheck, scheduleAI, score, streak, triggerShake]);

  // ---------- 点选 ----------
  const tapCell = useCallback((x: number, y: number) => {
    if (phase !== 'playing' || turn !== 'r' || thinking) return;
    setCursor({ x, y });
    const pc = board[y][x];
    if (selected) {
      if (selected.x === x && selected.y === y) {
        setSelected(null); setLegal([]); sfx.click();
        return;
      }
      const dest = legal.find((m) => m.tx === x && m.ty === y);
      if (dest) {
        playerMove(selected.x, selected.y, x, y);
        return;
      }
      if (pc && pc.c === 'r') {
        const ms = legalMovesFor(board as unknown as EBoard, x, y);
        setSelected({ x, y }); setLegal(ms); sfx.select();
        const pt = cellClient(x, y);
        particles.current?.burst(pt.x, pt.y, { count: 8, power: 3, size: 2.5, colors: ['#ffd76a', '#fff6d8'] });
        return;
      }
      setSelected(null); setLegal([]);
      return;
    }
    if (pc && pc.c === 'r') {
      const ms = legalMovesFor(board as unknown as EBoard, x, y);
      if (ms.length === 0) { sfx.illegal(); return; }
      setSelected({ x, y }); setLegal(ms); sfx.select();
      const pt = cellClient(x, y);
      particles.current?.burst(pt.x, pt.y, { count: 8, power: 3, size: 2.5, colors: ['#ffd76a', '#fff6d8'] });
    }
  }, [phase, turn, thinking, board, selected, legal, playerMove, cellClient]);

  // ---------- 悔棋 ----------
  const undo = useCallback(() => {
    if (thinking || lockRef.current) return;
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'over') return;
    const h0 = [...history];
    if (h0.length === 0) return;
    let nb = cloneCells(boardRef.current);
    let h = h0;
    let nsc = scoreRef.current, ncb = comboRef.current, nst = streakRef.current;
    let steps = 1;
    if (phaseRef.current === 'playing' && turnRef.current === 'r' && h.length >= 2) steps = 2;
    else if (phaseRef.current === 'over' && h.length >= 2) steps = 2;
    steps = Math.min(steps, h.length);
    for (let i = 0; i < steps; i++) {
      const e = h[h.length - 1];
      h = h.slice(0, -1);
      const mover = nb[e.move.ty][e.move.tx];
      nb[e.move.fy][e.move.fx] = mover;
      nb[e.move.ty][e.move.tx] = e.captured ? { ...e.captured } : null;
      nsc -= e.scoreDelta;
      ncb = e.comboBefore;
      nst = e.streakBefore;
    }
    boardRef.current = nb;
    setBoard(nb);
    setHistory(h);
    setScore(Math.max(0, nsc)); setCombo(ncb); setStreak(nst);
    setLastMove(h.length ? { ...h[h.length - 1].move } : null);
    setSelected(null); setLegal([]); setHint(null);
    setTurn('r'); turnRef.current = 'r';
    lockRef.current = false;
    setThinking(false);
    refreshCheck(nb);
    let redMoves = 0;
    h.forEach((_, idx) => { if (idx % 2 === 0) redMoves++; });
    let playerCaps = 0;
    h.forEach((e, idx) => { if (e.captured && idx % 2 === 0) playerCaps++; });
    setCapCount(playerCaps);
    setMoveCount(redMoves);
    let nc = 0;
    for (let i = h.length - 1; i >= 0; i--) {
      if (h[i].captured) break;
      nc++;
    }
    setNoCap(nc);
    if (phaseRef.current === 'over') { setWinner(null); setPhase('playing'); }
    sfx.click();
  }, [history, refreshCheck]);

  const requestHint = useCallback(() => {
    if (phase !== 'playing' || turn !== 'r' || thinking) return;
    sfx.click();
    const eb = boardRef.current as unknown as EBoard;
    const b = eb.map((row) => row.map((p) => (p ? { ...p } : null))) as EBoard;
    const h = hintMove(b, 'r');
    if (!h) return;
    setHint({ fx: h.fx, fy: h.fy, tx: h.tx, ty: h.ty });
    window.clearTimeout(hintTimer.current);
    hintTimer.current = window.setTimeout(() => setHint(null), 3200);
  }, [phase, turn, thinking]);

  // ---------- 键盘 ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phase === 'menu') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); newGame(); }
        return;
      }
      if (phase === 'over') {
        if (e.key === 'Enter' || e.key === 'r' || e.key === 'R') { e.preventDefault(); newGame(); }
        if (e.key === 'Escape') setPhase('menu');
        return;
      }
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        if (phase === 'playing') { setPhase('paused'); window.clearTimeout(aiTimer.current); setThinking(false); sfx.click(); }
        else if (phase === 'paused') {
          setPhase('playing'); sfx.click();
          if (turnRef.current === 'b') scheduleAI();
        }
        return;
      }
      if (phase !== 'playing') {
        if ((phase === 'paused') && (e.key === 'Enter' || e.key === ' ')) { setPhase('playing'); if (turnRef.current === 'b') scheduleAI(); }
        return;
      }
      const k = e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      if (k === 'ArrowUp' || k === 'w' || k === 'W') setCursor((c) => ({ x: c.x, y: Math.max(0, c.y - 1) }));
      else if (k === 'ArrowDown' || k === 's' || k === 'S') setCursor((c) => ({ x: c.x, y: Math.min(9, c.y + 1) }));
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') setCursor((c) => ({ x: Math.max(0, c.x - 1), y: c.y }));
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') setCursor((c) => ({ x: Math.min(8, c.x + 1), y: c.y }));
      else if (k === 'Enter' || k === ' ') tapCell(cursor.x, cursor.y);
      else if (k === 'u' || k === 'U' || k === 'z' || k === 'Z') undo();
      else if (k === 'h' || k === 'H') requestHint();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, cursor, tapCell, undo, requestHint, newGame, scheduleAI]);

  // 进入菜单时刷新榜单
  useEffect(() => {
    if (phase === 'menu') setScores(loadScores());
  }, [phase]);

  useEffect(() => {
    setSoundEnabled(soundOn);
  }, [soundOn]);

  // ---------- 安装到桌面 ----------
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => { setInstallPrompt(null); setInstallTip('✓ 已安装到桌面'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // 桌面快捷方式「快速对弈」：?quick=1 直接开局
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('quick') !== '1') return;
    const t = window.setTimeout(() => newGame(), 150);
    return () => window.clearTimeout(t);
  }, [newGame]);

  const handleInstall = async () => {
    sfx.click();
    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome === 'accepted') setInstallPrompt(null);
      } catch {
        setInstallTip('安装被浏览器拦截，请使用浏览器菜单安装。');
      }
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setInstallTip(isIOS
      ? 'iPhone / iPad：点击底部「分享」按钮 → 选择「添加到主屏幕」\n（请用 Safari 打开本页面）'
      : '安卓 / 电脑：点击浏览器右上角菜单（⋮）→「安装应用」或「添加到主屏幕」\n推荐使用 Chrome / Edge 浏览器');
  };

  // ---------- 派生 ----------
  const pieces = useMemo(() => {
    const list: (Cell & { x: number; y: number })[] = [];
    for (let y = 0; y < 10; y++) for (let x = 0; x < 9; x++) {
      const c = board[y][x];
      if (c) list.push({ ...c, x, y });
    }
    return list;
  }, [board]);

  const capturedByRed = useMemo(() => {
    const arr: Cell[] = [];
    history.forEach((h, i) => {
      // 偶数步是红方（先手）
      const isRedMove = i % 2 === 0;
      if (h.captured && isRedMove) arr.push(h.captured);
    });
    return arr;
  }, [history]);
  const capturedByBlack = useMemo(() => {
    const arr: Cell[] = [];
    history.forEach((h, i) => {
      const isRedMove = i % 2 === 0;
      if (h.captured && !isRedMove) arr.push(h.captured);
    });
    return arr;
  }, [history]);

  const canSave = winner !== null && !saved && qualifies(score);
  const handleSave = () => {
    setName(playerName.trim() || '无名棋手');
    const res = winner === 'draw' ? 'draw' : winner === 'r' ? 'win' : 'lose';
    const top = saveScore({ name: playerName.trim() || '无名棋手', score, difficulty: DIFF_META[difficulty].name, result: res, moves: moveCount, captures: capCount });
    setScores(top);
    setSaved(true);
    sfx.click();
  };

  // =================================================================
  // 渲染：联机对战（独立模块）
  // =================================================================
  if (onlineMode) return <OnlineGame onExit={() => setOnlineMode(false)} />;

  // =================================================================
  // 渲染：开始菜单
  // =================================================================
  if (phase === 'menu') {
    return (
      <div className="bg-palace bg-grain min-h-[100dvh] relative overflow-hidden">
        <ParticleCanvas ref={particles} />
        {/* 顶部光晕 +  floating 棋子 */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          {['將', '帥', '炮', '馬', '俥'].map((ch, i) => (
            <div key={i} className="float-y absolute font-black opacity-[0.07] text-[#ffdf8a]"
              style={{ left: `${8 + i * 19}%`, top: `${6 + (i % 3) * 26}%`, fontSize: `${90 + (i % 3) * 40}px`, ['--rot' as any]: `${(i - 2) * 8}deg`, animationDelay: `${i * 0.7}s` }}>
              {ch}
            </div>
          ))}
        </div>

        <div className="relative z-10 mx-auto max-w-md px-5 pt-10 pb-8 sm:pt-14">
          <div className="text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[11px] tracking-[0.2em] text-amber-200/90">
              <Zap size={12} /> 掌 上 对 弈 · 60FPS 丝 滑
            </div>
            <h1 className="gold-text mt-4 text-[52px] sm:text-6xl font-black leading-none tracking-wide">中国象棋</h1>
            <p className="mt-3 text-sm tracking-[0.35em] text-stone-400">楚 河 汉 界 · 谁 主 沉 浮</p>
            <div className="mx-auto mt-4 h-px w-48 bg-gradient-to-r from-transparent via-amber-300/60 to-transparent" />
            <p className="mt-3 text-[13px] text-stone-300/80">红方先行 · 吃子得分 · 将军加分 · 连吃有 Combo！</p>
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2.5">
            {(Object.keys(DIFF_META) as Difficulty[]).map((d) => {
              const Icon = DIFF_ICON[d];
              const active = difficulty === d;
              return (
                <button key={d} onClick={() => { setDifficulty(d); sfx.select(); }}
                  className={`card-up group relative overflow-hidden rounded-2xl border p-3 text-left transition-all active:scale-95 ${active ? `${DIFF_META[d].border} bg-gradient-to-br ${DIFF_META[d].bg} shadow-[0_0_24px_rgba(255,200,90,0.18)]` : 'border-white/10 bg-white/[0.04] hover:bg-white/[0.07]'}`}>
                  {active && <div className="absolute inset-y-0 w-16 bg-gradient-to-r from-transparent via-white/15 to-transparent banner-sweep" />}
                  <div className="flex items-center gap-2">
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-xl ${active ? 'red-seal text-amber-100' : 'bg-white/10 text-stone-300'}`}>
                      <Icon size={15} />
                    </span>
                    <div className="min-w-0">
                      <div className={`whitespace-nowrap text-[13px] font-bold leading-tight ${active ? DIFF_META[d].color : 'text-stone-200'}`}>{DIFF_META[d].name} · {DIFF_META[d].title}</div>
                      <div className="text-[11px] text-stone-400">{DIFF_META[d].desc}</div>
                    </div>
                  </div>
                  {active && <div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-amber-300 text-[12px] font-black text-red-900">✓</div>}
                </button>
              );
            })}
          </div>

          <button onClick={() => newGame()}
            className="red-seal group relative mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-2xl py-4 text-lg font-black tracking-[0.3em] text-amber-100 transition-transform active:scale-[0.98]">
            <Play size={20} className="transition-transform group-active:scale-125" /> 开始对弈
            <span className="absolute inset-y-0 w-20 bg-gradient-to-r from-transparent via-white/25 to-transparent banner-sweep" />
          </button>
          <p className="mt-2 text-center text-[11px] text-stone-500">点击即开局 · 红方先行 · 十秒上手</p>

          <div className="mt-4 grid grid-cols-2 gap-2.5">
            <button onClick={() => { setShowHow((v) => !v); sfx.click(); }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-[13px] text-stone-200 active:scale-95">
              <Target size={15} /> 玩法说明
            </button>
            <button onClick={() => { const el = document.getElementById('hs'); el?.scrollIntoView({ behavior: 'smooth' }); sfx.click(); }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.05] py-2.5 text-[13px] text-stone-200 active:scale-95">
              <Trophy size={15} /> 高分榜
            </button>
          </div>

          <button onClick={() => { setOnlineMode(true); sfx.click(); }}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-300/30 bg-sky-400/[0.09] py-2.5 text-[13px] font-bold text-sky-100 active:scale-95">
            <Users size={15} /> 联机对战 · 建房 / 加入
          </button>

          {!isNativeApp && (
            <>
              <button onClick={handleInstall}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-amber-300/25 bg-amber-400/[0.07] py-2.5 text-[13px] font-bold text-amber-200 active:scale-95">
                <Download size={15} /> 安装到手机桌面
              </button>
              {installTip && (
                <div className="pop-in mt-2 whitespace-pre-line rounded-xl border border-amber-200/20 bg-black/40 p-3 text-center text-[12px] leading-5 text-stone-300">
                  {installTip}
                </div>
              )}
            </>
          )}

          {showHow && (
            <div className="pop-in mt-3 rounded-2xl border border-amber-200/20 bg-black/40 p-4 text-[12.5px] leading-6 text-stone-300">
              <div className="mb-1 font-bold text-amber-200">📱 手机操作</div>
              点击己方棋子选中（发光+走位提示），再点目标落子。吃子有爆炸+震屏+加分。<br />
              <div className="mt-1 font-bold text-amber-200">⌨️ 键盘操作</div>
              方向键/WASD 移动光标，回车选中/落子，U 悔棋，H 提示，Esc 暂停。<br />
              <div className="mt-1 font-bold text-amber-200">🏆 计分</div>
              兵100 · 士象150 · 马炮300 · 车500 · 将1000（×难度系数），将军+50，连吃加成50%/连，胜利+1000×系数。
            </div>
          )}

          <div id="hs" className="mt-5 rounded-2xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-center gap-2 text-amber-200">
              <Trophy size={16} /> <span className="text-sm font-bold tracking-widest">本地高分榜</span>
              <span className="ml-auto text-[11px] text-stone-500">TOP 10 · 本机保存</span>
            </div>
            <ScoreTable scores={scores} />
          </div>

          <p className="mt-4 text-center text-[11px] text-stone-600">键盘 Enter 快速开局 · 支持触屏 + 键盘双操</p>
        </div>
      </div>
    );
  }

  // =================================================================
  // 渲染：对局
  // =================================================================
  const DiffIcon = DIFF_ICON[difficulty];
  return (
    <div className="bg-palace bg-grain min-h-[100dvh] relative flex flex-col">
      <ParticleCanvas ref={particles} />

      {/* 顶栏 */}
      <header className="relative z-20 mx-auto flex w-full max-w-md items-center gap-2 px-3 pt-3" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
        <button onClick={() => { setPhase('menu'); window.clearTimeout(aiTimer.current); setThinking(false); sfx.click(); }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-stone-200 active:scale-90">
          <Home size={16} />
        </button>
        <div className="flex-1 rounded-2xl border border-amber-200/20 bg-gradient-to-r from-red-950/60 via-black/50 to-black/40 px-3 py-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] tracking-widest text-stone-400">得分</span>
              <span key={score} className="pop-in text-xl font-black text-amber-300 tabular-nums">{score}</span>
              <span className="text-[10px] text-stone-500">×{mult}</span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-stone-400">
              <Flag size={11} /> 第 {moveCount + 1} 手
            </div>
          </div>
        </div>
        <button onClick={() => setSoundOn((v) => !v)} className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-stone-200 active:scale-90">
          {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </button>
        <button onClick={() => { if (phase === 'playing') { setPhase('paused'); window.clearTimeout(aiTimer.current); setThinking(false); sfx.click(); } }}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-stone-200 active:scale-90">
          <Pause size={16} />
        </button>
      </header>

      {/* 黑方信息条 */}
      <div className="relative z-20 mx-auto mt-2 flex w-full max-w-md items-center gap-2.5 px-4">
        <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${turn === 'b' ? 'border-amber-300 shadow-[0_0_16px_rgba(255,200,90,0.5)]' : 'border-white/15'} bg-gradient-to-br from-zinc-700 to-zinc-900`}>
          <Bot size={20} className="text-stone-200" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-bold text-stone-100">AI 黑方</span>
            <span className={`flex items-center gap-1 rounded-full border px-1.5 py-px text-[10px] ${DIFF_META[difficulty].border} bg-gradient-to-r ${DIFF_META[difficulty].bg} ${DIFF_META[difficulty].color}`}>
              <DiffIcon size={10} /> {DIFF_META[difficulty].name}
            </span>
            {thinking && (
              <span className="flex items-center gap-1 text-[11px] text-amber-300">
                思考中
                {[0, 1, 2].map((i) => <span key={i} className="thinking-dot inline-block h-1 w-1 rounded-full bg-amber-300" style={{ animationDelay: `${i * 0.15}s` }} />)}
              </span>
            )}
          </div>
          <MiniCaptured list={capturedByRed} dark />
        </div>
        {turn === 'b' && <span className="rounded-full bg-amber-300/15 px-2 py-1 text-[10px] text-amber-300">对方行棋</span>}
      </div>

      {/* 棋盘区 */}
      <main className="relative z-20 mx-auto w-full max-w-md flex-1 px-3 py-2">
        <div className={`${shake} ${startAnim ? 'pop-in' : ''}`}>
          <div className="board-wood rounded-[22px] p-2.5 sm:p-3">
            <div ref={boardBox} className="board-inner relative aspect-[9/10] w-full overflow-hidden rounded-[14px] select-none" onContextMenu={(e) => e.preventDefault()}>
              {/* SVG 棋盘线 */}
              <svg viewBox="0 0 9 10" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                {/* 外框 */}
                <rect x="0.5" y="0.5" width="8" height="9" fill="none" stroke="#7a3c0d" strokeWidth="0.07" />
                <rect x="0.56" y="0.56" width="7.88" height="8.88" fill="none" stroke="#7a3c0d" strokeWidth="0.025" opacity="0.7" />
                {/* 横线 */}
                {Array.from({ length: 10 }, (_, y) => (
                  <line key={`h${y}`} x1="0.5" y1={y + 0.5} x2="8.5" y2={y + 0.5} stroke="#7a3c0d" strokeWidth={y === 0 || y === 9 ? 0.06 : 0.032} />
                ))}
                {/* 竖线 */}
                {Array.from({ length: 9 }, (_, x) => (
                  <g key={`v${x}`}>
                    {x === 0 || x === 8 ? (
                      <line x1={x + 0.5} y1="0.5" x2={x + 0.5} y2="9.5" stroke="#7a3c0d" strokeWidth="0.045" />
                    ) : (
                      <>
                        <line x1={x + 0.5} y1="0.5" x2={x + 0.5} y2="4.5" stroke="#7a3c0d" strokeWidth="0.032" />
                        <line x1={x + 0.5} y1="5.5" x2={x + 0.5} y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
                      </>
                    )}
                  </g>
                ))}
                {/* 九宫斜线 */}
                <line x1="3.5" y1="0.5" x2="5.5" y2="2.5" stroke="#7a3c0d" strokeWidth="0.032" />
                <line x1="5.5" y1="0.5" x2="3.5" y2="2.5" stroke="#7a3c0d" strokeWidth="0.032" />
                <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
                <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
                {/* 炮兵位角 */}
                {[[1, 2], [7, 2], [1, 7], [7, 7], [0, 3], [2, 3], [4, 3], [6, 3], [8, 3], [0, 6], [2, 6], [4, 6], [6, 6], [8, 6]].map(([x, y]) => (
                  <g key={`${x}-${y}`} stroke="#7a3c0d" strokeWidth="0.03" opacity="0.9">
                    {x > 0 && <><line x1={x + 0.5 - 0.28} y1={y + 0.5 - 0.28} x2={x + 0.5 - 0.08} y2={y + 0.5 - 0.28} /><line x1={x + 0.5 - 0.28} y1={y + 0.5 - 0.28} x2={x + 0.5 - 0.28} y2={y + 0.5 - 0.08} /><line x1={x + 0.5 - 0.28} y1={y + 0.5 + 0.28} x2={x + 0.5 - 0.08} y2={y + 0.5 + 0.28} /><line x1={x + 0.5 - 0.28} y1={y + 0.5 + 0.08} x2={x + 0.5 - 0.28} y2={y + 0.5 + 0.28} /></>}
                    {x < 8 && <><line x1={x + 0.5 + 0.08} y1={y + 0.5 - 0.28} x2={x + 0.5 + 0.28} y2={y + 0.5 - 0.28} /><line x1={x + 0.5 + 0.28} y1={y + 0.5 - 0.28} x2={x + 0.5 + 0.28} y2={y + 0.5 - 0.08} /><line x1={x + 0.5 + 0.08} y1={y + 0.5 + 0.28} x2={x + 0.5 + 0.28} y2={y + 0.5 + 0.28} /><line x1={x + 0.5 + 0.28} y1={y + 0.5 + 0.08} x2={x + 0.5 + 0.28} y2={y + 0.5 + 0.28} /></>}
                  </g>
                ))}
                {/* 楚河汉界 */}
                <text x="2.3" y="5.28" fontSize="0.42" fill="#7a3c0d" opacity="0.75" fontWeight="700" textAnchor="middle">楚 河</text>
                <text x="6.7" y="5.28" fontSize="0.42" fill="#7a3c0d" opacity="0.75" fontWeight="700" textAnchor="middle">漢 界</text>
              </svg>

              {/* 上一步高亮 */}
              {lastMove && (
                <>
                  <Mark x={lastMove.fx} y={lastMove.fy} color="rgba(255,180,60,0.35)" />
                  <Mark x={lastMove.tx} y={lastMove.ty} color="rgba(255,120,40,0.45)" strong />
                </>
              )}

              {/* 提示箭头 */}
              {hint && (
                <svg className="absolute inset-0 h-full w-full pointer-events-none z-20" viewBox="0 0 9 10" preserveAspectRatio="none">
                  <defs>
                    <marker id="ah" markerWidth="4" markerHeight="4" refX="2" refY="2" orient="auto">
                      <path d="M0,0 L4,2 L0,4 z" fill="#22c55e" />
                    </marker>
                  </defs>
                  <line x1={hint.fx + 0.5} y1={hint.fy + 0.5} x2={hint.tx + 0.5} y2={hint.ty + 0.5}
                    stroke="#22c55e" strokeWidth="0.09" strokeLinecap="round" markerEnd="url(#ah)" opacity="0.95">
                    <animate attributeName="opacity" values="1;0.5;1" dur="0.8s" repeatCount="indefinite" />
                  </line>
                  <circle cx={hint.tx + 0.5} cy={hint.ty + 0.5} r="0.32" fill="none" stroke="#22c55e" strokeWidth="0.06">
                    <animate attributeName="r" values="0.28;0.4;0.28" dur="0.8s" repeatCount="indefinite" />
                  </circle>
                </svg>
              )}

              {/* 走位提示点 */}
              {legal.map((m, i) => {
                const isCap = !!board[m.ty][m.tx];
                return (
                  <button key={i} onClick={() => tapCell(m.tx, m.ty)}
                    className="absolute z-20 -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${((m.tx + 0.5) / 9) * 100}%`, top: `${((m.ty + 0.5) / 10) * 100}%`, width: '10%', aspectRatio: '1' }}>
                    {isCap ? (
                      <span className="dot-pulse block h-full w-full rounded-full border-[3px] border-red-500/90 bg-red-500/15 shadow-[0_0_12px_rgba(255,50,50,0.6)]" />
                    ) : (
                      <span className="dot-pulse mx-auto block h-[38%] w-[38%] rounded-full bg-emerald-600/85 shadow-[0_0_10px_rgba(20,180,100,0.8)] ring-2 ring-white/70" />
                    )}
                  </button>
                );
              })}

              {/* 棋子层（按键稳定，保证位移动画） */}
              {pieces.map((p) => {
                const isSel = selected?.x === p.x && selected?.y === p.y;
                const isRed = p.c === 'r';
                const inChk = (isRed && checkR && p.t === 'k') || (!isRed && checkB && p.t === 'k');
                const isCursor = cursor.x === p.x && cursor.y === p.y && turn === 'r' && phase === 'playing';
                return (
                  <div key={p.id}
                    className={`piece-layer absolute z-10 ${isSel ? 'z-30' : ''}`}
                    style={{ left: `${((p.x + 0.5) / 9) * 100}%`, top: `${((p.y + 0.5) / 10) * 100}%`, width: '10.6%', aspectRatio: '1', transform: 'translate(-50%,-50%)' }}>
                    <button onClick={() => tapCell(p.x, p.y)}
                      className={`piece-body relative flex h-full w-full items-center justify-center rounded-full ${isSel ? 'glow-selected' : ''} ${inChk ? 'check-flash' : ''} ${isCursor && !isSel ? 'ring-2 ring-sky-300/90' : ''}`}
                      style={{
                        background: isRed
                          ? 'radial-gradient(circle at 32% 28%, #fff8e6 0%, #ffe9b8 22%, #f7c873 48%, #d98f2e 78%, #9c5a12 100%)'
                          : 'radial-gradient(circle at 32% 28%, #f2f2f2 0%, #d9d9d9 22%, #a8a8a8 48%, #5a5a5a 78%, #222222 100%)',
                        boxShadow: isSel
                          ? undefined
                          : '0 4px 8px rgba(60,20,0,0.45), inset 0 2px 3px rgba(255,255,255,0.7), inset 0 -3px 6px rgba(90,40,0,0.35)',
                        border: `2px solid ${isRed ? '#8f1d1d' : '#1c1c1e'}`,
                      }}>
                      <span className="absolute inset-[7%] rounded-full border opacity-60" style={{ borderColor: isRed ? '#8f1d1d' : '#333' }} />
                      <span className={`font-black leading-none ${isRed ? 'text-[#a31212]' : 'text-[#171717]'}`}
                        style={{ fontSize: 'clamp(15px, 5.4vw, 24px)', textShadow: isRed ? '0 1px 0 rgba(255,255,255,0.6)' : '0 1px 0 rgba(255,255,255,0.35)' }}>
                        {charOf(p)}
                      </span>
                      {isSel && <span className="absolute -inset-1 rounded-full border-2 border-amber-300/70" />}
                    </button>
                  </div>
                );
              })}

              {/* 隐形点击格（保证空格子易点） */}
              <div className="absolute inset-0 z-[5] grid" style={{ gridTemplateColumns: 'repeat(9,1fr)', gridTemplateRows: 'repeat(10,1fr)' }}>
                {Array.from({ length: 90 }, (_, i) => {
                  const x = i % 9, y = (i / 9) | 0;
                  const hasPiece = !!board[y][x];
                  return <button key={i} aria-label={`cell-${x}-${y}`} onClick={() => tapCell(x, y)} className="relative" style={{ touchAction: 'manipulation' }}>{!hasPiece && cursor.x === x && cursor.y === y && turn === 'r' && phase === 'playing' && <span className="absolute inset-[22%] rounded-md border-2 border-dashed border-sky-300/80 bg-sky-300/10" />}</button>;
                })}
              </div>

              {/* 分数飘字 */}
              {pops.map((p) => (
                <div key={p.id} className="score-float pointer-events-none absolute z-40 font-black"
                  style={{ left: `${((p.bx + 0.5) / 9) * 100}%`, top: `${((p.by + 0.5) / 10) * 100}%`, color: p.color, fontSize: p.big ? 18 : 13, textShadow: '0 2px 8px rgba(0,0,0,0.7)' }}>
                  {p.text}
                </div>
              ))}

              {/* 连吃横幅 */}
              {comboFlash && (
                <div className="pointer-events-none absolute left-1/2 top-[38%] z-40 -translate-x-1/2">
                  <div className="combo-pop rounded-full border border-orange-300/60 bg-gradient-to-r from-red-700 to-orange-600 px-4 py-1.5 text-sm font-black text-amber-100 shadow-[0_8px_30px_rgba(255,120,30,0.5)]">
                    🔥 {comboFlash}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 红方信息条 */}
        <div className="mt-2 flex items-center gap-2.5 rounded-2xl border border-red-300/20 bg-gradient-to-r from-red-950/50 to-black/40 px-3 py-2">
          <div className={`flex h-10 w-10 items-center justify-center rounded-full border-2 ${turn === 'r' ? 'border-red-400 shadow-[0_0_16px_rgba(255,80,80,0.5)]' : 'border-white/15'} bg-gradient-to-br from-red-600 to-red-900 text-lg font-black text-amber-100`}>帅</div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-bold text-stone-100">{playerName}</span>
              <span className="rounded-full bg-red-500/20 px-1.5 py-px text-[10px] text-red-300">红方 · 你</span>
              {turn === 'r' && !thinking && <span className="rounded-full bg-emerald-400/15 px-2 py-px text-[10px] text-emerald-300">轮到你走</span>}
              {checkR && <span className="check-flash rounded-full bg-red-600 px-2 py-px text-[10px] font-bold text-white">被将军!</span>}
              {checkB && <span className="rounded-full bg-amber-400 px-2 py-px text-[10px] font-bold text-red-900">将军!</span>}
            </div>
            <MiniCaptured list={capturedByBlack} />
          </div>
          <div className="text-right">
            <div className="text-[10px] text-stone-500">吃子 {capCount}</div>
            <div className="text-[10px] text-stone-500">连吃 x{combo}</div>
          </div>
        </div>

        {/* 操作条 */}
        <div className="mt-2 grid grid-cols-4 gap-2">
          <CtrlBtn icon={<Undo2 size={17} />} label="悔棋 (U)" onClick={undo} disabled={thinking || history.length === 0} />
          <CtrlBtn icon={<Lightbulb size={17} />} label="提示 (H)" onClick={requestHint} disabled={thinking || turn !== 'r'} />
          <CtrlBtn icon={<RotateCcw size={17} />} label="重开" onClick={() => newGame()} />
          <CtrlBtn icon={<VersusIcon size={17} />} label="换难度" onClick={() => { setPhase('menu'); window.clearTimeout(aiTimer.current); setThinking(false); }} />
        </div>
        <p className="mt-2 text-center text-[10.5px] text-stone-500">点选走子 · 方向键+回车也行 · 将军/吃子有震屏特效</p>
      </main>

      {/* 暂停遮罩 */}
      {phase === 'paused' && (
        <div className="overlay-in fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-6">
          <div className="card-up w-full max-w-xs rounded-3xl border border-amber-200/25 bg-gradient-to-b from-[#221612] to-[#120c0a] p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl red-seal text-amber-100"><Pause size={24} /></div>
            <h2 className="gold-text mt-3 text-2xl font-black tracking-widest">暂停中</h2>
            <p className="mt-1 text-xs text-stone-400">棋局已封存 · 随时回来续战</p>
            <div className="mt-4 space-y-2">
              <button onClick={() => { setPhase('playing'); sfx.click(); if (turnRef.current === 'b') scheduleAI(); }} className="red-seal flex w-full items-center justify-center gap-2 rounded-xl py-3 text-sm font-bold text-amber-100 active:scale-95"><Play size={16} /> 继续对弈</button>
              <button onClick={() => newGame()} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm text-stone-200 active:scale-95"><RotateCcw size={15} /> 重新开始</button>
              <button onClick={() => { setPhase('menu'); sfx.click(); }} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[0.06] py-2.5 text-sm text-stone-200 active:scale-95"><Home size={15} /> 返回主页</button>
            </div>
          </div>
        </div>
      )}

      {/* 结算遮罩 */}
      {phase === 'over' && (
        <div className="overlay-in fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/75 p-5">
          <div className="card-up w-full max-w-sm rounded-3xl border border-amber-200/25 bg-gradient-to-b from-[#251712] to-[#100b09] p-6 text-center shadow-2xl">
            {winner === 'r' ? (
              <>
                <div className="text-4xl">🏆</div>
                <h2 className="gold-text mt-1 text-3xl font-black tracking-widest">大 获 全 胜</h2>
                <p className="mt-1 text-xs text-amber-200/80">{winReason || '棋高一着'} · {DIFF_META[difficulty].name}难度</p>
              </>
            ) : winner === 'b' ? (
              <>
                <div className="text-4xl">🌧️</div>
                <h2 className="mt-1 text-3xl font-black tracking-widest text-stone-200">惜 败 一 着</h2>
                <p className="mt-1 text-xs text-stone-400">{winReason} · {DIFF_META[difficulty].name}难度 · 胜败乃兵家常事</p>
              </>
            ) : (
              <>
                <div className="text-4xl">🤝</div>
                <h2 className="mt-1 text-3xl font-black tracking-widest text-stone-100">握 手 言 和</h2>
                <p className="mt-1 text-xs text-stone-400">{winReason}</p>
              </>
            )}

            <div className="mt-4 rounded-2xl border border-white/10 bg-black/40 p-3">
              <div className="text-[11px] tracking-widest text-stone-500">本 局 得 分</div>
              <div className="gold-text text-4xl font-black tabular-nums">{score}</div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <Stat label="回合" value={`${moveCount}`} />
                <Stat label="吃子" value={`${capCount}`} />
                <Stat label="将军" value={`${checkCount}`} />
              </div>
            </div>

            {canSave ? (
              <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-3">
                <div className="text-xs font-bold text-amber-200">🎉 跻身高分榜！留下你的名字</div>
                <div className="mt-2 flex gap-2">
                  <input value={playerName} onChange={(e) => setPlayerName(e.target.value.slice(0, 8))} placeholder="无名棋手"
                    className="min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2 text-sm text-amber-100 outline-none focus:border-amber-300/60" />
                  <button onClick={handleSave} className="red-seal shrink-0 rounded-xl px-4 py-2 text-sm font-bold text-amber-100 active:scale-95">上榜</button>
                </div>
              </div>
            ) : saved ? (
              <div className="mt-3 rounded-xl bg-emerald-400/10 py-2 text-xs text-emerald-300">✓ 已记入本地高分榜</div>
            ) : null}

            <div className="mt-3 flex gap-2">
              <button onClick={() => newGame()} className="red-seal flex flex-1 items-center justify-center gap-1.5 rounded-xl py-3 text-sm font-black tracking-widest text-amber-100 active:scale-95"><RotateCcw size={15} /> 再来一局</button>
              <button onClick={() => { setPhase('menu'); sfx.click(); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-white/[0.06] py-3 text-sm text-stone-200 active:scale-95"><Home size={15} /> 返回主页</button>
            </div>
            <button onClick={undo} className="mt-2 w-full rounded-xl py-2 text-xs text-stone-400 underline underline-offset-4 active:scale-95">不服？悔棋再战 (U)</button>
          </div>
        </div>
      )}
    </div>
  );
}

function Mark({ x, y, color, strong }: { x: number; y: number; color: string; strong?: boolean }) {
  return (
    <div className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full"
      style={{ left: `${((x + 0.5) / 9) * 100}%`, top: `${((y + 0.5) / 10) * 100}%`, width: '10.6%', aspectRatio: '1', background: color, boxShadow: strong ? '0 0 14px rgba(255,140,40,0.7)' : undefined }} />
  );
}

function CtrlBtn({ icon, label, onClick, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-2xl border py-2.5 text-[11px] transition-all active:scale-90 ${disabled ? 'border-white/5 bg-white/[0.02] text-stone-600' : 'border-white/10 bg-white/[0.06] text-stone-200 hover:bg-white/[0.09]'}`}>
      {icon}<span>{label}</span>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.05] py-1.5">
      <div className="text-base font-black text-stone-100 tabular-nums">{value}</div>
      <div className="text-[10px] text-stone-500">{label}</div>
    </div>
  );
}

function MiniCaptured({ list, dark }: { list: Cell[]; dark?: boolean }) {
  if (list.length === 0) return <div className="mt-0.5 text-[10px] text-stone-600">暂无缴获</div>;
  const order: Record<string, number> = { r: 0, n: 1, c: 1, p: 2, b: 3, a: 3, k: 4 };
  const sorted = [...list].sort((a, b) => (order[a.t] ?? 9) - (order[b.t] ?? 9));
  return (
    <div className="mt-1 flex max-w-full flex-wrap gap-1 overflow-hidden">
      {sorted.slice(0, 12).map((p, i) => (
        <span key={i} className={`flex h-5 w-5 items-center justify-center rounded-full border text-[11px] font-bold ${p.c === 'r' ? 'border-red-800 bg-[#f7d789] text-red-800' : 'border-zinc-600 bg-zinc-300 text-zinc-800'}`}>
          {charOf(p)}
        </span>
      ))}
      {sorted.length > 12 && <span className="text-[10px] text-stone-400">+{sorted.length - 12}</span>}
      {dark ? null : null}
    </div>
  );
}

function ScoreTable({ scores }: { scores: HighScore[] }) {
  if (scores.length === 0) return <div className="py-4 text-center text-xs text-stone-500">虚位以待 · 来下第一盘上榜吧！</div>;
  return (
    <div className="mt-2 space-y-1.5">
      {scores.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-1.5 text-xs">
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${i === 0 ? 'bg-amber-300 text-red-900' : i === 1 ? 'bg-stone-300 text-stone-800' : i === 2 ? 'bg-orange-400 text-red-950' : 'bg-white/10 text-stone-400'}`}>
            {i < 3 ? <Medal size={13} /> : i + 1}
          </span>
          <span className="max-w-[70px] truncate font-bold text-stone-200">{s.name}</span>
          <span className="rounded bg-white/10 px-1 text-[10px] text-stone-400">{s.difficulty}</span>
          <span className={`text-[10px] ${s.result === 'win' ? 'text-emerald-300' : s.result === 'draw' ? 'text-stone-400' : 'text-red-300'}`}>
            {s.result === 'win' ? '胜' : s.result === 'draw' ? '和' : '负'}
          </span>
          <span className="ml-auto font-black text-amber-300 tabular-nums">{s.score}</span>
        </div>
      ))}
    </div>
  );
}
