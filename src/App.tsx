import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ambient from "./components/Ambient";
import BoardCanvas, { type BoardHandlers } from "./components/BoardCanvas";
import { GameOverOverlay, type GameOverStats, HighScores, PauseOverlay, StartScreen } from "./components/Screens";
import {
  IconBtn,
  IconBulb,
  IconFlip,
  IconMute,
  IconPause,
  IconRestart,
  IconSound,
  IconSpark,
  IconSwords,
  IconTrophy,
  IconUndo,
  Panel,
} from "./components/ui";
import OnlineGame from "./OnlineGame";
import DailyPuzzle from "./DailyPuzzle";
import Ladder from "./Ladder";
import ReviewOverlay, { type ReviewInput } from "./ReviewOverlay";
import { sound } from "./audio/sound";
import { AIClient } from "./game/aiClient";
import { Effects } from "./game/effects";
import { CAPTURE_POINTS, type DiffKey, type ScoreEntry, diffByKey, fmtTime, loadScores, saveScore } from "./game/meta";
import { type Layout, type Scene, computeLayout, sqToPx } from "./game/renderer";
import {
  BLACK,
  type Board,
  KING,
  RED,
  charOf,
  encode,
  findKing,
  gameResult,
  inCheck,
  initialBoard,
  isAttacked,
  legalMoves,
  mFrom,
  mTo,
  makeMove,
  moveToText,
  unmakeMove,
} from "./game/xiangqi";
import { cn } from "./utils/cn";

type Phase = "menu" | "playing" | "paused" | "over";
type Result = "win" | "lose" | "draw";

interface LogEntry {
  side: number;
  text: string;
  capture: number;
  check: boolean;
  n: number;
}

interface ScoreBook {
  cap: number;
  check: number;
  result: number;
  time: number;
  mat: number;
  pen: number;
}

const emptyBook = (): ScoreBook => ({ cap: 0, check: 0, result: 0, time: 0, mat: 0, pen: 0 });
const total = (b: ScoreBook) => b.cap + b.check + b.result + b.time + b.mat + b.pen;

function materialOf(b: Board, side: number) {
  let s = 0;
  for (let i = 0; i < 90; i++) {
    const p = b[i];
    if (p === 0) continue;
    if (side > 0 ? p > 0 : p < 0) {
      const t = Math.abs(p);
      if (t !== KING) s += CAPTURE_POINTS[t];
    }
  }
  return s;
}

function posKey(b: Board, turn: number) {
  let s = turn > 0 ? "r" : "b";
  for (let i = 0; i < 90; i++) s += String.fromCharCode(b[i] + 70);
  return s;
}

export default function App() {
  /* ---------- persistent objects ---------- */
  const fx = useMemo(() => new Effects(), []);
  const ai = useMemo(() => new AIClient(), []);
  const boardRef = useRef<Board>(initialBoard());
  const sceneRef = useRef<Scene>({
    board: boardRef.current,
    turn: RED,
    playerSide: RED,
    selected: null,
    targets: [],
    lastMove: null,
    hint: null,
    checkSide: 0,
    cursor: 4 + 9 * 9,
    showCursor: false,
    anim: null,
    drag: null,
    interactive: false,
    dimmed: false,
    flip: false,
    threat: [],
    intro: 0,
  });
  const handlersRef = useRef<BoardHandlers>({ press: () => false, drop: () => {}, animDone: () => {} });

  /* ---------- react state ---------- */
  const [phase, setPhase] = useState<Phase>("menu");
  const [diff, setDiff] = useState<DiffKey>("medium");
  const [side, setSide] = useState<number>(RED);
  const [, force] = useState(0);
  const sync = useCallback(() => force((v) => v + 1), []);
  const [online, setOnline] = useState(false);
  const [daily, setDaily] = useState(false);
  const [ladder, setLadder] = useState(false);
  const [review, setReview] = useState<ReviewInput | null>(null);

  /* ---------- PWA 安装 ---------- */
  const [installPrompt, setInstallPrompt] = useState<{ prompt: () => Promise<void> } | null>(null);
  const [installTip, setInstallTip] = useState("");
  const isNativeApp = typeof window !== "undefined" && !!(window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as unknown as { prompt: () => Promise<void> });
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const handleInstall = useCallback(async () => {
    sound.resume();
    if (isNativeApp) return;
    if (installPrompt) {
      try {
        await installPrompt.prompt();
      } catch {
        /* 忽略 */
      }
      setInstallPrompt(null);
      return;
    }
    const ua = navigator.userAgent;
    const isIOS = /iphone|ipad|ipod/i.test(ua);
    setInstallTip(
      isIOS
        ? "iOS：点浏览器底部「分享」按钮\n选择「添加到主屏幕」"
        : "安卓：点浏览器菜单（⋮）\n选择「添加到桌面 / 安装应用」",
    );
    window.setTimeout(() => setInstallTip(""), 5000);
  }, [installPrompt, isNativeApp]);

  const [scoreBook, setScoreBook] = useState<ScoreBook>(emptyBook);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [captures, setCaptures] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [taken, setTaken] = useState<{ mine: number[]; theirs: number[] }>({ mine: [], theirs: [] });
  const [thinking, setThinking] = useState(false);
  const [aiInfo, setAiInfo] = useState<{ depth: number; nodes: number; score: number } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const [banner, setBanner] = useState<{ text: string; tone: string; id: number } | null>(null);
  const [over, setOver] = useState<GameOverStats | null>(null);
  const [highlightScore, setHighlightScore] = useState<number | undefined>();
  const [showThreat, setShowThreat] = useState(true);
  const [flip, setFlip] = useState(false);
  const [scorePulse, setScorePulse] = useState(0);

  /* ---------- refs mirroring state for imperative handlers ---------- */
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const diffRef = useRef(diff);
  diffRef.current = diff;
  const comboRef = useRef(0);
  const bookRef = useRef<ScoreBook>(emptyBook());
  const histRef = useRef<{ move: number; cap: number; side: number; key: string }[]>([]);
  const startBoardRef = useRef<Board>(initialBoard());
  const repRef = useRef<Map<string, number>>(new Map());
  const searchIdRef = useRef(0);
  const pendingAiRef = useRef<number | null>(null);
  const impactRef = useRef<{ cap: number; to: number; mover: number; text: string } | null>(null);
  const elapsedRef = useRef(0);
  elapsedRef.current = elapsed;
  const capturesRef = useRef(0);
  const maxComboRef = useRef(0);
  const quietRef = useRef(0);
  const showThreatRef = useRef(showThreat);
  showThreatRef.current = showThreat;
  const layoutRef = useRef(computeLayout(360, 420, 1));
  const bannerTimer = useRef<number | null>(null);

  useEffect(() => setScores(loadScores()), []);
  useEffect(() => () => ai.dispose(), [ai]);

  const d = diffByKey(diff);
  const scene = sceneRef.current;
  const playerSide = scene.playerSide;
  const aiSide = -playerSide;

  /** stable identity: BoardCanvas must never rebuild its render loop on re-render */
  const handleLayout = useCallback((l: Layout) => {
    layoutRef.current = l;
  }, []);

  /* ---------- helpers ---------- */
  const flash = useCallback((text: string, tone: string) => {
    setBanner({ text, tone, id: Date.now() });
    if (bannerTimer.current) window.clearTimeout(bannerTimer.current);
    bannerTimer.current = window.setTimeout(() => setBanner(null), 1400);
  }, []);

  const computeThreat = useCallback(() => {
    const s = sceneRef.current;
    if (!showThreatRef.current || s.turn !== s.playerSide) {
      s.threat = [];
      return;
    }
    const b = s.board;
    const enemy = -s.playerSide;
    const out: number[] = [];
    for (let i = 0; i < 90; i++) {
      const p = b[i];
      if (p === 0) continue;
      if (s.playerSide > 0 ? p < 0 : p > 0) continue;
      const x = i % 9;
      const y = (i / 9) | 0;
      if (isAttacked(b, x, y, enemy) && !isAttacked(b, x, y, s.playerSide)) out.push(i);
    }
    s.threat = out.slice(0, 8);
  }, []);

  const refreshCheck = useCallback(() => {
    const s = sceneRef.current;
    s.checkSide = inCheck(s.board, s.turn) ? s.turn : 0;
  }, []);

  /* ---------- game lifecycle ---------- */
  const endGame = useCallback(
    (result: Result) => {
      const s = sceneRef.current;
      s.interactive = false;
      s.selected = null;
      s.targets = [];
      s.hint = null;
      s.threat = [];
      searchIdRef.current++;
      setThinking(false);

      const mult = diffByKey(diffRef.current).mult;
      const book = { ...bookRef.current };
      if (result === "win") {
        book.result = Math.round(800 * mult);
        book.time = Math.max(0, Math.round(620 - elapsedRef.current * 1.7));
        book.mat = Math.round(materialOf(s.board, s.playerSide) * 0.45);
      } else if (result === "draw") {
        book.result = Math.round(220 * mult);
      }
      bookRef.current = book;
      setScoreBook(book);

      const score = Math.max(0, total(book));
      const entry: ScoreEntry = {
        score,
        diff: diffRef.current,
        result,
        moves: histRef.current.length,
        seconds: elapsedRef.current,
        date: Date.now(),
      };
      const prevBest = loadScores()[0]?.score ?? -1;
      const updated = saveScore(entry);
      setScores(updated);
      setHighlightScore(entry.date);

      setOver({
        result,
        score,
        rows: [
          { label: "吃子得分", value: book.cap },
          { label: "将军奖励", value: book.check },
          { label: result === "win" ? "胜局奖励" : result === "draw" ? "和局奖励" : "败局", value: book.result },
          { label: "用时奖励", value: book.time },
          { label: "残余子力", value: book.mat },
          { label: "提示 / 悔棋", value: book.pen },
        ].filter((r) => r.value !== 0 || r.label === "吃子得分"),
        moves: histRef.current.length,
        seconds: elapsedRef.current,
        captures: capturesRef.current,
        diff: diffRef.current,
        isRecord: score > prevBest && score > 0,
      });

      setPhase("over");
      phaseRef.current = "over";
      sound.play(result === "win" ? "win" : result === "draw" ? "draw" : "lose");
      fx.addFlash(0.5, result === "win" ? "255,214,140" : result === "draw" ? "125,144,184" : "255,95,71");
      fx.addShake(result === "win" ? 16 : 12);
      const l = layoutRef.current;
      const k = findKing(s.board, result === "win" ? -s.playerSide : s.playerSide);
      if (k >= 0) {
        const p = sqToPx(l, k, s.flip);
        fx.burst(p.px, p.py, result === "win" ? ["#ffdd9a", "#e9b95c", "#ff5f47", "#fff6df"] : ["#ff5f47", "#8f1f18", "#7d90b8"], 70, 340, l.cell / 40);
        fx.wave(p.px, p.py, l.cell * 5, result === "win" ? "rgba(255,221,154,0.9)" : "rgba(255,95,71,0.9)", 6, 0.9);
      }
    },
    [fx],
  );

  const startAi = useCallback(() => {
    const s = sceneRef.current;
    if (phaseRef.current !== "playing") return;
    if (s.turn === s.playerSide) return;
    const id = ++searchIdRef.current;
    setThinking(true);
    setAiInfo(null);
    const preset = diffByKey(diffRef.current).preset;
    const { promise } = ai.search(s.board, s.turn, preset, (info) => {
      if (searchIdRef.current !== id) return;
      setAiInfo({ depth: info.depth, nodes: info.nodes, score: info.score });
    });
    promise
      .then((res) => {
        if (searchIdRef.current !== id) return;
        setThinking(false);
        if (res.move < 0) {
          endGame("win");
          return;
        }
        if (phaseRef.current === "paused") {
          pendingAiRef.current = res.move;
          return;
        }
        applyMoveRef.current(res.move);
      })
      .catch(() => {
        if (searchIdRef.current === id) setThinking(false);
      });
  }, [ai, endGame]);

  const applyMoveRef = useRef<(m: number) => void>(() => {});

  const applyMove = useCallback(
    (m: number) => {
      const s = sceneRef.current;
      const b = s.board;
      const from = mFrom(m);
      const to = mTo(m);
      const piece = b[from];
      if (piece === 0) return;
      const mover = s.turn;
      const cap = b[to];
      const text = moveToText(b, m);

      histRef.current.push({ move: m, cap, side: mover, key: posKey(b, mover) });
      quietRef.current = cap !== 0 ? 0 : quietRef.current + 1;
      makeMove(b, m);

      s.anim = { piece, from, to, t: 0, dur: cap !== 0 ? 215 : 180 };
      s.lastMove = { from, to };
      s.selected = null;
      s.targets = [];
      s.hint = null;
      s.drag = null;
      s.threat = [];
      s.turn = -mover;
      s.interactive = false;
      impactRef.current = { cap, to, mover, text };
      sound.play("ui");
      sync();
    },
    [sync],
  );
  applyMoveRef.current = applyMove;

  const onAnimDone = useCallback(() => {
    const s = sceneRef.current;
    const im = impactRef.current;
    impactRef.current = null;
    const b = s.board;
    const l = layoutRef.current;

    if (im) {
      const p = sqToPx(l, im.to, s.flip);
      const isPlayer = im.mover === s.playerSide;
      if (im.cap !== 0) {
        const t = Math.abs(im.cap);
        const power = 150 + CAPTURE_POINTS[t] * 0.7;
        fx.burst(p.px, p.py, im.cap > 0 ? ["#ff5f47", "#d6382c", "#ffdd9a", "#f4e3bd"] : ["#9fb4e0", "#4b5a7d", "#e9b95c", "#f4e3bd"], 24 + Math.min(40, t * 6), power, l.cell / 40);
        fx.wave(p.px, p.py, l.cell * 2.1, "rgba(255,221,154,0.85)", 4, 0.5);
        fx.addShake(5 + Math.min(14, CAPTURE_POINTS[t] * 0.045));
        fx.addFlash(0.16, "255,214,140");
        sound.play("capture");

        if (isPlayer) {
          const mult = diffByKey(diffRef.current).mult;
          const c = comboRef.current;
          const gain = Math.round(CAPTURE_POINTS[t] * (1 + Math.min(c, 6) * 0.25) * mult);
          comboRef.current = c + 1;
          setCombo(c + 1);
          if (c + 1 > maxComboRef.current) {
            maxComboRef.current = c + 1;
            setMaxCombo(c + 1);
          }
          capturesRef.current += 1;
          setCaptures(capturesRef.current);
          bookRef.current = { ...bookRef.current, cap: bookRef.current.cap + gain };
          setScoreBook(bookRef.current);
          setScorePulse((v) => v + 1);
          fx.float(p.px, p.py - l.r * 1.2, `+${gain}`, "#ffdd9a", l.cell * 0.52);
          if (c >= 1) {
            fx.float(p.px, p.py - l.r * 2.1, `${c + 1} 连击!`, "#ff5f47", l.cell * 0.34);
            sound.play("combo", c);
          }
        }
        setTaken((prev) =>
          isPlayer ? { ...prev, mine: [...prev.mine, im.cap] } : { ...prev, theirs: [...prev.theirs, im.cap] },
        );
      } else {
        fx.burst(p.px, p.py + l.r * 0.5, ["#c9a978", "#8a6a3c", "#e8d3a4"], 8, 60, l.cell / 46);
        fx.addShake(2.2);
        sound.play("move");
        if (isPlayer && comboRef.current > 0) {
          comboRef.current = 0;
          setCombo(0);
        }
      }

      setLog((prev) => [
        ...prev,
        { side: im.mover, text: im.text, capture: im.cap, check: false, n: prev.length + 1 },
      ]);
    }

    // repetition bookkeeping
    const key = posKey(b, s.turn);
    const n = (repRef.current.get(key) ?? 0) + 1;
    repRef.current.set(key, n);

    refreshCheck();

    if (s.checkSide !== 0) {
      const k = findKing(b, s.checkSide);
      if (k >= 0) {
        const kp = sqToPx(l, k, s.flip);
        fx.wave(kp.px, kp.py, l.cell * 3.4, "rgba(255,95,71,0.95)", 5, 0.7);
        fx.burst(kp.px, kp.py, ["#ff5f47", "#ffdd9a", "#d6382c"], 26, 210, l.cell / 42);
        fx.addShake(11);
        fx.addFlash(0.3, "255,95,71");
      }
      sound.play("check");
      flash("将 军", "#ff5f47");
      if (im && im.mover === s.playerSide) {
        const gain = Math.round(40 * diffByKey(diffRef.current).mult);
        bookRef.current = { ...bookRef.current, check: bookRef.current.check + gain };
        setScoreBook(bookRef.current);
        setScorePulse((v) => v + 1);
      }
      setLog((prev) => (prev.length ? [...prev.slice(0, -1), { ...prev[prev.length - 1], check: true }] : prev));
    }

    const loser = gameResult(b, s.turn);
    if (loser !== 0) {
      endGame(loser === s.playerSide ? "lose" : "win");
      return;
    }
    if (n >= 3 || quietRef.current >= 120) {
      endGame("draw");
      return;
    }

    if (s.turn === s.playerSide) {
      s.interactive = true;
      computeThreat();
      sync();
    } else {
      startAi();
      sync();
    }
  }, [computeThreat, endGame, flash, fx, refreshCheck, startAi, sync]);

  const newGame = useCallback(
    (dk: DiffKey, playerS: number) => {
      searchIdRef.current++;
      pendingAiRef.current = null;
      impactRef.current = null;
      diffRef.current = dk;
      setDiff(dk);
      const b = initialBoard();
      boardRef.current = b;
      const s = sceneRef.current;
      s.board = b;
      s.turn = RED;
      s.playerSide = playerS;
      s.selected = null;
      s.targets = [];
      s.lastMove = null;
      s.hint = null;
      s.checkSide = 0;
      s.anim = null;
      s.drag = null;
      s.threat = [];
      s.flip = playerS === BLACK;
      s.cursor = playerS === RED ? 4 + 9 * 9 : 4;
      s.showCursor = false;
      s.interactive = playerS === RED;
      s.intro = performance.now() / 1000;
      setFlip(playerS === BLACK);
      fx.reset();
      histRef.current = [];
      startBoardRef.current = Int8Array.from(b);
      repRef.current = new Map();
      repRef.current.set(posKey(b, RED), 1);
      quietRef.current = 0;
      comboRef.current = 0;
      capturesRef.current = 0;
      maxComboRef.current = 0;
      bookRef.current = emptyBook();
      setScoreBook(bookRef.current);
      setCombo(0);
      setMaxCombo(0);
      setCaptures(0);
      setLog([]);
      setTaken({ mine: [], theirs: [] });
      setThinking(false);
      setAiInfo(null);
      setElapsed(0);
      elapsedRef.current = 0;
      setOver(null);
      setHighlightScore(undefined);
      setPhase("playing");
      phaseRef.current = "playing";
      sound.resume();
      sound.play("select");
      if (playerS !== RED) window.setTimeout(() => startAi(), 260);
      else computeThreat();
      sync();
    },
    [computeThreat, fx, startAi, sync],
  );

  /* ---------- timer ---------- */
  useEffect(() => {
    if (phase !== "playing") return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  /* ---------- pause / resume ---------- */
  const pause = useCallback(() => {
    if (phaseRef.current !== "playing") return;
    setPhase("paused");
    phaseRef.current = "paused";
    sceneRef.current.interactive = false;
    sound.play("ui");
  }, []);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    setPhase("playing");
    phaseRef.current = "playing";
    const s = sceneRef.current;
    sound.play("ui");
    if (pendingAiRef.current != null) {
      const m = pendingAiRef.current;
      pendingAiRef.current = null;
      applyMoveRef.current(m);
    } else if (s.turn === s.playerSide && !s.anim) {
      s.interactive = true;
      computeThreat();
    } else if (s.turn !== s.playerSide && !thinking && !s.anim) {
      startAi();
    }
    sync();
  }, [computeThreat, startAi, sync, thinking]);

  /* ---------- input handlers ---------- */
  const select = useCallback(
    (sq: number) => {
      const s = sceneRef.current;
      s.selected = sq;
      s.targets = legalMoves(s.board, s.playerSide)
        .filter((m) => mFrom(m) === sq)
        .map(mTo);
      s.hint = null;
      sound.play("select");
      const l = layoutRef.current;
      const p = sqToPx(l, sq, s.flip);
      fx.wave(p.px, p.py, l.r * 1.9, "rgba(255,221,154,0.7)", 2.5, 0.4);
      sync();
    },
    [fx, sync],
  );

  const press = useCallback(
    (sq: number | null) => {
      const s = sceneRef.current;
      if (phaseRef.current !== "playing" || !s.interactive || s.anim || s.turn !== s.playerSide) return false;
      s.showCursor = false;
      if (sq == null) {
        if (s.selected != null) {
          s.selected = null;
          s.targets = [];
          sync();
        }
        return false;
      }
      s.cursor = sq;
      if (s.selected != null && s.targets.includes(sq)) {
        applyMoveRef.current(encode(s.selected, sq));
        return false;
      }
      const code = s.board[sq];
      if (code !== 0 && (s.playerSide > 0 ? code > 0 : code < 0)) {
        select(sq);
        return true;
      }
      if (s.selected != null) {
        s.selected = null;
        s.targets = [];
        sound.play("invalid");
        sync();
      }
      return false;
    },
    [select, sync],
  );

  const drop = useCallback(
    (from: number, to: number | null) => {
      const s = sceneRef.current;
      if (phaseRef.current !== "playing" || s.turn !== s.playerSide) return;
      if (to != null && to !== from && s.targets.includes(to)) {
        applyMoveRef.current(encode(from, to));
        return;
      }
      if (to != null && to !== from) {
        sound.play("invalid");
        fx.addShake(3);
        const l = layoutRef.current;
        const p = sqToPx(l, to, s.flip);
        fx.burst(p.px, p.py, ["#ff5f47", "#8f1f18"], 8, 90, l.cell / 46);
      }
    },
    [fx],
  );

  handlersRef.current = { press, drop, animDone: onAnimDone };

  /* ---------- actions ---------- */
  const spend = useCallback((amount: number) => {
    bookRef.current = { ...bookRef.current, pen: bookRef.current.pen - amount };
    setScoreBook(bookRef.current);
    setScorePulse((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const s = sceneRef.current;
    if (phaseRef.current !== "playing" || s.anim) return;
    if (histRef.current.length === 0) {
      sound.play("invalid");
      return;
    }
    searchIdRef.current++;
    setThinking(false);
    pendingAiRef.current = null;
    impactRef.current = null;
    const b = s.board;
    let undone = 0;
    while (histRef.current.length && undone < 2) {
      const h = histRef.current.pop()!;
      const key = posKey(b, s.turn);
      const c = repRef.current.get(key);
      if (c) repRef.current.set(key, Math.max(0, c - 1));
      unmakeMove(b, h.move, h.cap);
      s.turn = h.side;
      undone++;
      if (h.cap !== 0) {
        if (h.side === s.playerSide) setTaken((p) => ({ ...p, mine: p.mine.slice(0, -1) }));
        else setTaken((p) => ({ ...p, theirs: p.theirs.slice(0, -1) }));
      }
      setLog((prev) => prev.slice(0, -1));
      if (s.turn === s.playerSide) break;
    }
    if (undone === 0) return;
    s.lastMove = histRef.current.length
      ? { from: mFrom(histRef.current[histRef.current.length - 1].move), to: mTo(histRef.current[histRef.current.length - 1].move) }
      : null;
    s.selected = null;
    s.targets = [];
    s.hint = null;
    comboRef.current = 0;
    setCombo(0);
    refreshCheck();
    spend(50);
    sound.play("select");
    fx.addFlash(0.12, "125,144,184");
    if (s.turn === s.playerSide) {
      s.interactive = true;
      computeThreat();
    } else {
      fx.addShake(2);
      startAi();
    }
    sync();
  }, [computeThreat, fx, refreshCheck, spend, startAi, sync]);

  const hint = useCallback(() => {
    const s = sceneRef.current;
    if (phaseRef.current !== "playing" || s.turn !== s.playerSide || s.anim || !s.interactive) {
      sound.play("invalid");
      return;
    }
    spend(60);
    sound.play("select");
    const id = ++searchIdRef.current;
    setThinking(true);
    const { promise } = ai.search(s.board, s.playerSide, { maxDepth: 4, timeMs: 700, randomness: 0, blunder: 0 });
    promise.then((res) => {
      if (searchIdRef.current !== id) return;
      setThinking(false);
      if (res.move >= 0) {
        s.hint = { from: mFrom(res.move), to: mTo(res.move) };
        const l = layoutRef.current;
        const p = sqToPx(l, mTo(res.move), s.flip);
        fx.wave(p.px, p.py, l.cell * 1.6, "rgba(72,166,255,0.9)", 3, 0.6);
        sync();
      }
    });
  }, [ai, fx, spend, sync]);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      sound.setMuted(!m);
      if (m) {
        sound.resume();
        sound.play("ui");
      }
      return !m;
    });
  }, []);

  const resign = useCallback(() => {
    if (phaseRef.current !== "playing" && phaseRef.current !== "paused") return;
    pendingAiRef.current = null;
    endGame("lose");
  }, [endGame]);

  const toMenu = useCallback(() => {
    searchIdRef.current++;
    setThinking(false);
    setPhase("menu");
    phaseRef.current = "menu";
    sceneRef.current.interactive = false;
    sound.play("ui");
  }, []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "m" || k === "M") {
        toggleMute();
        return;
      }
      if (phaseRef.current === "menu") {
        if (k === "Enter" || k === " ") {
          e.preventDefault();
          newGame(diffRef.current, sceneRef.current.playerSide || RED);
        }
        return;
      }
      if (phaseRef.current === "over") {
        if (k === "r" || k === "R" || k === "Enter" || k === " ") {
          e.preventDefault();
          newGame(diffRef.current, sceneRef.current.playerSide);
        }
        if (k === "Escape") toMenu();
        return;
      }
      if (k === "Escape") {
        e.preventDefault();
        const s = sceneRef.current;
        if (phaseRef.current === "playing" && s.selected != null) {
          s.selected = null;
          s.targets = [];
          sync();
        } else if (phaseRef.current === "paused") resume();
        else pause();
        return;
      }
      if (phaseRef.current === "paused") {
        if (k === "p" || k === "P") resume();
        return;
      }
      if (k === "p" || k === "P") {
        pause();
        return;
      }
      if (k === "r" || k === "R") {
        newGame(diffRef.current, sceneRef.current.playerSide);
        return;
      }
      if (k === "u" || k === "U") {
        undo();
        return;
      }
      if (k === "h" || k === "H") {
        hint();
        return;
      }
      if (k === "f" || k === "F") {
        setFlip((f) => {
          sceneRef.current.flip = !f;
          return !f;
        });
        return;
      }
      const s = sceneRef.current;
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        ArrowDown: [0, 1],
        ArrowLeft: [-1, 0],
        ArrowRight: [1, 0],
      };
      if (dirs[k]) {
        e.preventDefault();
        s.showCursor = true;
        const cur = s.cursor ?? 85;
        let cx = cur % 9;
        let cy = (cur / 9) | 0;
        if (s.flip) {
          cx = 8 - cx;
          cy = 9 - cy;
        }
        cx = Math.max(0, Math.min(8, cx + dirs[k][0]));
        cy = Math.max(0, Math.min(9, cy + dirs[k][1]));
        if (s.flip) {
          cx = 8 - cx;
          cy = 9 - cy;
        }
        s.cursor = cy * 9 + cx;
        sound.play("ui");
        sync();
        return;
      }
      if (k === "Enter" || k === " ") {
        e.preventDefault();
        s.showCursor = true;
        press(s.cursor);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [hint, newGame, pause, press, resume, sync, toMenu, toggleMute, undo]);

  /* ---------- derived ---------- */
  const score = Math.max(0, total(scoreBook));
  const myMat = materialOf(scene.board, playerSide);
  const aiMat = materialOf(scene.board, aiSide);
  const matDiff = myMat - aiMat;
  const matPct = Math.max(6, Math.min(94, 50 + (matDiff / 900) * 50));
  const isMyTurn = phase === "playing" && scene.turn === playerSide && !thinking && !scene.anim;

  useEffect(() => {
    scene.flip = flip;
  }, [flip, scene]);
  useEffect(() => {
    if (phase !== "playing") return;
    computeThreat();
  }, [showThreat, phase, computeThreat]);

  /* ---------- render ---------- */
  if (review) {
    return (
      <ReviewOverlay
        input={review}
        onExit={() => setReview(null)}
      />
    );
  }
  if (online) {
    return <OnlineGame onExit={() => setOnline(false)} />;
  }
  if (daily) {
    return <DailyPuzzle onExit={() => setDaily(false)} />;
  }
  if (ladder) {
    return <Ladder onExit={() => setLadder(false)} />;
  }
  if (phase === "menu") {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-ink-950">
        <Ambient hue={d.hue} />
        <StartScreen
          diff={diff}
          setDiff={(k) => {
            setDiff(k);
            sound.resume();
            sound.play("ui");
          }}
          side={side}
          setSide={(sv) => {
            setSide(sv);
            sceneRef.current.playerSide = sv;
            sound.resume();
            sound.play("select");
          }}
          onStart={() => newGame(diff, side)}
          scores={scores}
          muted={muted}
          toggleMute={toggleMute}
          onOnline={() => {
            setOnline(true);
            sound.resume();
            sound.play("ui");
          }}
          onDaily={() => {
            setDaily(true);
            sound.resume();
            sound.play("ui");
          }}
          onLadder={() => {
            setLadder(true);
            sound.resume();
            sound.play("ui");
          }}
          onInstall={!isNativeApp ? handleInstall : undefined}
          installTip={installTip}
        />
      </div>
    );
  }

  const renderStrip = (who: "me" | "ai") => {
    const mine = who === "me";
    const s = mine ? playerSide : aiSide;
    const active = scene.turn === s && phase === "playing";
    const list = mine ? taken.mine : taken.theirs;
    const gain = mine ? matDiff : -matDiff;
    return (
      <div
        className={cn(
          "flex shrink-0 items-center gap-2.5 rounded-xl border px-2.5 py-1.5 transition-all duration-300",
          active
            ? s === RED
              ? "border-cinnabar-2/50 bg-cinnabar/12 shadow-[0_0_24px_-8px_rgba(255,95,71,0.8)]"
              : "border-steel/50 bg-steel/12 shadow-[0_0_24px_-8px_rgba(125,144,184,0.8)]"
            : "border-gold/10 bg-ink-900/50",
        )}
      >
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-base font-bold"
          style={{
            color: s === RED ? "#a81f16" : "#241f2b",
            background: "radial-gradient(circle at 32% 28%, #fdf3dc, #d8bd8a 72%, #ab8a58)",
            boxShadow: active
              ? `0 0 0 2px ${s === RED ? "#ff5f47" : "#7d90b8"}, 0 0 16px -2px ${s === RED ? "#ff5f47" : "#7d90b8"}`
              : "inset 0 0 0 1.5px rgba(88,58,28,0.5)",
          }}
        >
          {s === RED ? "帅" : "将"}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-bold text-paper/85">{mine ? "你" : "电脑"}</span>
            {!mine && (
              <span
                className="rounded px-1 py-px text-[9px] font-bold"
                style={{ color: d.hue, background: `${d.hue}22` }}
              >
                {d.name}
              </span>
            )}
            {gain > 0 && <span className="font-mono text-[10px] font-bold text-jade">+{gain}</span>}
          </div>
          <div className="flex h-4 items-center gap-px overflow-hidden">
            {list.length === 0 ? (
              <span className="text-[9px] text-paper/20">未吃子</span>
            ) : (
              list.slice(-14).map((c, i) => (
                <span
                  key={i}
                  className="text-[11px] leading-none"
                  style={{ color: c > 0 ? "#e06a5c" : "#93a4c8" }}
                  title={charOf(c)}
                >
                  {charOf(c)}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="ml-auto shrink-0 text-right">
          {!mine && thinking ? (
            <span className="flex items-center gap-1 text-[10px] font-bold text-gold-2">
              <span className="flex gap-0.5">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1 w-1 rounded-full bg-gold-2"
                    style={{ animation: `tick 0.9s ease-in-out ${i * 0.15}s infinite` }}
                  />
                ))}
              </span>
              思考中
            </span>
          ) : active ? (
            <span className="text-[10px] font-bold tracking-widest text-gold-2">行棋</span>
          ) : (
            <span className="text-[10px] text-paper/20">等待</span>
          )}
          {!mine && aiInfo && (
            <div className="font-mono text-[9px] tabular-nums text-paper/30">
              d{aiInfo.depth} · {(aiInfo.nodes / 1000).toFixed(0)}k
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-ink-950">
      <Ambient hue={d.hue} />

      {/* ---- top bar ---- */}
      <header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-gold/12 bg-ink-950/70 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] backdrop-blur-md">
        <button
          onClick={toMenu}
          className="group flex items-center gap-2 rounded-lg px-1 py-0.5 transition-colors hover:bg-white/5"
          title="返回主菜单"
        >
          <span className="font-display text-2xl leading-none text-gold-2 transition-transform group-hover:scale-110">
            象棋
          </span>
        </button>
        <span
          className="hidden rounded-md px-1.5 py-0.5 text-[10px] font-bold sm:inline"
          style={{ color: d.hue, background: `${d.hue}20` }}
        >
          {d.name} ×{d.mult}
        </span>

        <div className="ml-auto flex items-center gap-2.5">
          <div className="text-right leading-none">
            <div className="text-[9px] uppercase tracking-[0.2em] text-paper/30">Score</div>
            <div
              key={scorePulse}
              className="font-mono text-xl font-black tabular-nums text-gold-2"
              style={{ animation: scorePulse ? "tick 0.4s ease-out" : undefined }}
            >
              {score.toLocaleString()}
            </div>
          </div>
          {combo > 1 && (
            <span
              key={combo}
              className="anim-stamp rounded-md border border-cinnabar-2/60 bg-cinnabar/20 px-1.5 py-1 text-[10px] font-black text-cinnabar-2"
            >
              {combo}连 ×{(1 + Math.min(combo, 6) * 0.25).toFixed(2)}
            </span>
          )}
          <div className="hidden text-right leading-none sm:block">
            <div className="text-[9px] uppercase tracking-[0.2em] text-paper/30">Time</div>
            <div className="font-mono text-base font-bold tabular-nums text-paper/70">{fmtTime(elapsed)}</div>
          </div>
          <IconBtn title={muted ? "开启音效 (M)" : "静音 (M)"} onClick={toggleMute} active={!muted}>
            {muted ? <IconMute className="h-5 w-5" /> : <IconSound className="h-5 w-5" />}
          </IconBtn>
          <IconBtn title="暂停 (Esc)" onClick={phase === "paused" ? resume : pause}>
            <IconPause className="h-5 w-5" />
          </IconBtn>
        </div>
      </header>

      {/* ---- main ---- */}
      <main className="anim-fade relative z-10 grid min-h-0 flex-1 gap-3 p-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom,0px))] lg:grid-cols-[minmax(0,1fr)_21rem] lg:p-3">
        <div className="flex min-h-0 flex-col gap-2">
          {renderStrip("ai")}

          <div className="relative min-h-0 flex-1">
            <BoardCanvas
              sceneRef={sceneRef}
              fx={fx}
              handlers={handlersRef}
              onLayout={handleLayout}
            />
            {banner && (
              <div
                key={banner.id}
                className="anim-stamp pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 select-none font-display text-[clamp(3rem,11vw,5.5rem)] leading-none"
                style={{ color: banner.tone, textShadow: `0 0 34px ${banner.tone}, 0 6px 18px rgba(0,0,0,0.85)` }}
              >
                {banner.text}
              </div>
            )}
            {!isMyTurn && phase === "playing" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                <span className="rounded-full border border-gold/20 bg-ink-950/75 px-3 py-1 text-[10px] tracking-[0.25em] text-paper/45 backdrop-blur">
                  {thinking ? "电脑思考中…" : "落子中…"}
                </span>
              </div>
            ) : log.length === 0 && phase === "playing" ? (
              <div className="pointer-events-none absolute inset-x-0 bottom-1 flex justify-center">
                <span className="anim-tick rounded-full border border-jade/30 bg-ink-950/75 px-3 py-1 text-[10px] tracking-[0.2em] text-jade-2 backdrop-blur">
                  点击或拖动棋子 · 绿点为可落点
                </span>
              </div>
            ) : null}
          </div>

          {renderStrip("me")}

          {/* material bar */}
          <div className="relative h-1.5 shrink-0 overflow-hidden rounded-full bg-ink-800">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${matPct}%`,
                background: playerSide === RED ? "linear-gradient(90deg,#8f1f18,#ff5f47)" : "linear-gradient(90deg,#4b5a7d,#9fb4e0)",
              }}
            />
            <div className="absolute inset-y-0 left-1/2 w-px bg-gold/50" />
          </div>

          {/* action bar */}
          <div className="grid shrink-0 grid-cols-6 gap-1.5">
            {[
              { icon: <IconUndo className="h-4 w-4" />, label: "悔棋", on: undo, hint: "U" },
              { icon: <IconBulb className="h-4 w-4" />, label: "提示", on: hint, hint: "H" },
              {
                icon: <IconSpark className="h-4 w-4" />,
                label: "危位",
                on: () => {
                  setShowThreat((v) => !v);
                  sound.play("ui");
                },
                active: showThreat,
              },
              {
                icon: <IconFlip className="h-4 w-4" />,
                label: "翻转",
                on: () => {
                  setFlip((f) => !f);
                  sound.play("ui");
                },
              },
              { icon: <IconRestart className="h-4 w-4" />, label: "重开", on: () => newGame(diff, playerSide), hint: "R" },
              { icon: <IconPause className="h-4 w-4" />, label: "暂停", on: pause, hint: "Esc" },
            ].map((a) => (
              <button
                key={a.label}
                onClick={a.on}
                title={a.hint ? `${a.label} (${a.hint})` : a.label}
                className={cn(
                  "flex flex-col items-center gap-0.5 rounded-xl border py-1.5 transition-all duration-150 active:scale-95",
                  a.active
                    ? "border-gold/50 bg-gold/15 text-gold-2"
                    : "border-gold/15 bg-ink-850/80 text-paper/60 hover:border-gold/40 hover:text-gold-2",
                )}
              >
                {a.icon}
                <span className="text-[9px] font-bold tracking-wide">{a.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ---- side rail (desktop) ---- */}
        <aside className="hidden min-h-0 flex-col gap-3 lg:flex">
          <Panel title="战况" icon={<IconSwords className="h-4 w-4" />}>
            <div className="grid grid-cols-3 gap-2 p-3">
              {[
                { k: "得分", v: score.toLocaleString(), c: "text-gold-2" },
                { k: "吃子", v: String(captures), c: "text-jade" },
                {
                  k: `连击 (峰 ${maxCombo})`,
                  v: `×${(1 + Math.min(combo, 6) * 0.25).toFixed(2)}`,
                  c: "text-cinnabar-2",
                },
                { k: "手数", v: String(log.length), c: "text-paper/80" },
                { k: "用时", v: fmtTime(elapsed), c: "text-paper/80" },
                { k: "子力", v: `${matDiff >= 0 ? "+" : ""}${matDiff}`, c: matDiff >= 0 ? "text-jade" : "text-cinnabar-2" },
              ].map((x) => (
                <div key={x.k} className="rounded-lg border border-gold/10 bg-ink-900/60 px-2 py-1.5">
                  <div className="text-[9px] uppercase tracking-[0.16em] text-paper/30">{x.k}</div>
                  <div className={cn("font-mono text-base font-bold tabular-nums", x.c)}>{x.v}</div>
                </div>
              ))}
            </div>
            {aiInfo && (
              <div className="border-t border-gold/10 px-3 py-2 font-mono text-[10px] tabular-nums text-paper/35">
                引擎 · 深度 {aiInfo.depth} · {(aiInfo.nodes / 1000).toFixed(1)}k 节点 · 评估{" "}
                {(-aiInfo.score / 100).toFixed(2)}
                {!ai.threaded && <span className="ml-1 text-amber/70">(单线程)</span>}
              </div>
            )}
          </Panel>

          <Panel title="棋谱" icon={<IconTrophy className="h-4 w-4" />} className="flex min-h-0 flex-1 flex-col">
            <div className="scroll-cn min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {log.length === 0 ? (
                <p className="py-6 text-center text-xs text-paper/25">尚未落子</p>
              ) : (
                <ol className="space-y-0.5">
                  {Array.from({ length: Math.ceil(log.length / 2) }, (_, i) => {
                    const a = log[i * 2];
                    const b = log[i * 2 + 1];
                    return (
                      <li key={i} className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-white/[0.04]">
                        <span className="w-5 shrink-0 text-right font-mono text-[10px] text-paper/25">{i + 1}</span>
                        <span
                          className={cn(
                            "w-[4.5rem] shrink-0 font-bold",
                            a.side === RED ? "text-cinnabar-2" : "text-steel",
                            a.capture && "underline decoration-gold/60 underline-offset-2",
                          )}
                        >
                          {a.text}
                          {a.check && <span className="ml-0.5 text-gold-2">将</span>}
                        </span>
                        <span
                          className={cn(
                            "w-[4.5rem] shrink-0 font-bold",
                            b ? (b.side === RED ? "text-cinnabar-2" : "text-steel") : "text-transparent",
                            b?.capture && "underline decoration-gold/60 underline-offset-2",
                          )}
                        >
                          {b?.text ?? "—"}
                          {b?.check && <span className="ml-0.5 text-gold-2">将</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </Panel>

          <HighScores entries={scores} highlight={highlightScore} compact />
        </aside>
      </main>

      {phase === "paused" && (
        <PauseOverlay
          onResume={resume}
          onRestart={() => newGame(diff, playerSide)}
          onMenu={toMenu}
          onResign={resign}
          muted={muted}
          toggleMute={toggleMute}
          diff={diff}
          moves={log.length}
          seconds={elapsed}
        />
      )}
      {phase === "over" && over && (
        <GameOverOverlay
          stats={over}
          scores={scores}
          highlight={highlightScore}
          onRestart={() => newGame(diff, playerSide)}
          onMenu={toMenu}
          onReview={
            histRef.current.length > 0
              ? () => {
                  const rec = Int8Array.from(histRef.current.map((h) => h.move));
                  void rec;
                  setReview({
                    moves: histRef.current.map((h) => ({ move: h.move, side: h.side, cap: h.cap })),
                    startBoard: startBoardRef.current,
                    result: over.result,
                    title: `${diffByKey(over.diff).name}难度 · 人机对局`,
                  });
                }
              : undefined
          }
        />
      )}

    </div>
  );
}

