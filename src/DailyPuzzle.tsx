import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ambient from "./components/Ambient";
import BoardCanvas, { type BoardHandlers } from "./components/BoardCanvas";
import { Btn, IconArrowLeft, IconBulb, IconRestart, IconTrophy } from "./components/ui";
import { sound } from "./audio/sound";
import { Effects } from "./game/effects";
import { AIClient } from "./game/aiClient";
import {
  BLACK,
  type Board,
  RED,
  encode,
  findKing,
  gameResult,
  inCheck,
  legalMoves,
  mFrom,
  mTo,
  makeMove,
  moveToText,
} from "./game/xiangqi";
import type { Layout, Scene } from "./game/renderer";
import { computeLayout, sqToPx } from "./game/renderer";
import { boardOf, puzzleForDay, todayKey } from "./game/puzzles";
import { cloud } from "./game/cloud";
import { cn } from "./utils/cn";

/* ------------------------------------------------------------------ */
/* 云端答题记录（可失败降级：离线仍可玩，只是不计云端）                   */
/* ------------------------------------------------------------------ */

interface DailyRow {
  seat: string;
  day: string;
  solved: boolean;
  used_hint: boolean;
  moves: number;
}

async function fetchDaily(seat: string, day: string): Promise<DailyRow | null> {
  const q = (cloud.database.from("daily_records") as unknown as QueryChain)
    .select("*")
    .eq("seat", seat)
    .eq("day", day)
    .maybeSingle();
  // 5 秒超时：网络/CORS 异常时降级为离线可玩模式（线上同域无此问题）
  const res = await Promise.race([
    q as Promise<{ data: unknown; error: unknown }>,
    new Promise<{ data: null; error: "timeout" }>((resolve) => window.setTimeout(() => resolve({ data: null, error: "timeout" }), 5000)),
  ]);
  if (res.error && res.error !== "timeout") throw res.error;
  if (res.error === "timeout") throw new Error("timeout");
  return (res.data as DailyRow | null) ?? null;
}

interface QueryChain {
  select: (c?: string) => QueryChain;
  insert: (v: Record<string, unknown>) => QueryChain;
  update: (v: Record<string, unknown>) => QueryChain;
  eq: (c: string, v: unknown) => QueryChain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (onFulfilled?: (r: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
}

/* ------------------------------------------------------------------ */

const PUZZLE_HUE = "#35c39a";

export default function DailyPuzzle({ onExit }: { onExit: () => void }) {
  const day = useRef(todayKey()).current;
  const puzzle = useRef(puzzleForDay(day)).current;
  const seat = useRef(getSeat()).current;

  const [phase, setPhase] = useState<"loading" | "playing" | "solved">("loading");
  const [solvedCloud, setSolvedCloud] = useState<boolean | null>(null);
  const [msg, setMsg] = useState("");
  const [step, setStep] = useState(0); // 已完成回合数（红+黑）
  const [thinking, setThinking] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [usedHint, setUsedHint] = useState(false);
  const [wrong, setWrong] = useState(0);
  const [, force] = useState(0);
  const sync = useCallback(() => force((v) => v + 1), []);

  /* ---------- Canvas 场景 ---------- */
  const fx = useMemo(() => new Effects(), []);
  const ai = useMemo(() => new AIClient(), []);
  const boardRef = useRef<Board>(boardOf(puzzle));
  const sceneRef = useRef<Scene>({
    board: boardRef.current,
    turn: RED,
    playerSide: RED,
    selected: null,
    targets: [],
    lastMove: null,
    hint: null,
    checkSide: 0,
    cursor: 40,
    showCursor: false,
    anim: null,
    drag: null,
    interactive: false,
    dimmed: false,
    flip: false,
    threat: [],
    intro: performance.now() / 1000,
  });
  const handlersRef = useRef<BoardHandlers>({ press: () => false, drop: () => {}, animDone: () => {} });
  const layoutRef = useRef<Layout>(computeLayout(360, 420, 1));
  const pendingRef = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const movesRef = useRef(0);
  const finishedRef = useRef(false);
  const impactRef = useRef<{ cap: number; to: number; mover: number } | null>(null);

  const scene = sceneRef.current;

  const handleLayout = useCallback((l: Layout) => {
    layoutRef.current = l;
  }, []);

  /* ---------- 载入云端记录 ---------- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const r = await fetchDaily(seat, day);
        if (!alive) return;
        if (r?.solved) {
          setSolvedCloud(true);
          setUsedHint(r.used_hint);
          movesRef.current = r.moves;
          setPhase("solved");
        } else {
          setSolvedCloud(false);
          setPhase("playing");
          sceneRef.current.interactive = true;
        }
      } catch {
        if (alive) {
          setSolvedCloud(null); // 离线：可玩不计分
          setPhase("playing");
          sceneRef.current.interactive = true;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [seat, day]);

  useEffect(() => () => ai.dispose(), [ai]);

  useEffect(() => {
    if (phase !== "solved" || solvedCloud === null || solvedCloud) return;
    // 今日首次通关：写云端（best-effort）
    const write = async () => {
      try {
        const existing = await fetchDaily(seat, day);
        const q = cloud.database.from("daily_records") as unknown as QueryChain;
        if (existing) {
          await q.update({ solved: true, used_hint: usedHint, moves: movesRef.current, updated_at: new Date().toISOString() }).eq("seat", seat).eq("day", day);
        } else {
          await q.insert({ seat, day, solved: true, used_hint: usedHint, moves: movesRef.current });
        }
      } catch {
        /* 离线忽略 */
      }
    };
    void write();
  }, [phase, solvedCloud, seat, day, usedHint]);

  /* ---------- 应用一枚棋步（动画） ---------- */
  const animateMove = useCallback(
    (m: number) => {
      const s = sceneRef.current;
      const b = s.board;
      const from = mFrom(m);
      const to = mTo(m);
      const piece = b[from];
      if (piece === 0) return;
      const mover = s.turn;
      const cap = b[to];
      makeMove(b, m);
      s.anim = { piece, from, to, t: 0, dur: cap !== 0 ? 215 : 180 };
      s.lastMove = { from, to };
      s.selected = null;
      s.targets = [];
      s.hint = null;
      s.drag = null;
      s.turn = -mover;
      s.interactive = false;
      impactRef.current = { cap, to, mover };
      sync();
    },
    [sync],
  );

  /* ---------- 玩家走子 → 校验杀棋 / 引擎应答 ---------- */
  const commitPlayer = useCallback(
    (m: number) => {
      const s = sceneRef.current;
      if (phaseRef.current !== "playing" || s.anim) return;
      // 试走看是否成杀
      const probe = Int8Array.from(s.board);
      makeMove(probe, m);
      const mate = gameResult(probe, BLACK) !== 0;

      animateMove(m);
      movesRef.current += 1;

      if (mate) {
        finishedRef.current = true;
        sound.play("win");
        window.setTimeout(() => {
          setPhase("solved");
          setStep((v) => v + 1);
        }, 500);
        return;
      }

      // 黑方引擎应答（最优防守）
      setThinking(true);
      const { promise } = ai.search(s.board, BLACK, { maxDepth: 9, timeMs: 900, randomness: 0, blunder: 0 });
      void promise.then((res) => {
        setThinking(false);
        if (finishedRef.current || phaseRef.current !== "playing") return;
        if (res.move < 0) {
          // 黑无步（红胜）
          finishedRef.current = true;
          sound.play("win");
          window.setTimeout(() => setPhase("solved"), 400);
          return;
        }
        // 红棋动画已完成（onAnimDone 已先行触发）时直接落黑棋；否则留给 onAnimDone 消费
        const sc = sceneRef.current;
        if (sc.anim) {
          pendingRef.current = res.move;
        } else {
          animateMove(res.move);
          movesRef.current += 1;
          setStep((v) => v + 1);
        }
      });
    },
    [ai, animateMove],
  );

  /* ---------- 动画完成：黑方走 pending 步 ---------- */
  const onAnimDone = useCallback(() => {
    const s = sceneRef.current;
    const im = impactRef.current;
    impactRef.current = null;
    const l = layoutRef.current;

    if (im) {
      const p = sqToPx(l, im.to, s.flip);
      if (im.cap !== 0) {
        fx.burst(p.px, p.py, ["#ff5f47", "#d6382c", "#ffdd9a", "#f4e3bd"], 24, 180, l.cell / 40);
        fx.addShake(7);
        sound.play("capture");
      } else {
        fx.burst(p.px, p.py + l.r * 0.5, ["#c9a978", "#8a6a3c", "#e8d3a4"], 8, 60, l.cell / 46);
        fx.addShake(2.2);
        sound.play("move");
      }
    }

    s.checkSide = inCheck(s.board, s.turn) ? s.turn : 0;
    if (s.checkSide !== 0) {
      sound.play("check");
      const k = findKing(s.board, s.checkSide);
      if (k >= 0) {
        const kp = sqToPx(l, k, s.flip);
        fx.wave(kp.px, kp.py, l.cell * 3, "rgba(255,95,71,0.95)", 4, 0.6);
      }
    }

    // 黑方应答
    const pending = pendingRef.current;
    if (pending != null && !finishedRef.current) {
      pendingRef.current = null;
      animateMove(pending);
      movesRef.current += 1;
      setStep((v) => v + 1);
      return;
    }

    // 轮到红方（玩家）
    if (!finishedRef.current && phaseRef.current === "playing") {
      s.interactive = true;
      sync();
    }
  }, [animateMove, fx, sync]);

  /* ---------- 输入 ---------- */
  const press = useCallback(
    (sq: number | null) => {
      const s = sceneRef.current;
      if (phaseRef.current !== "playing" || s.anim || thinking) return false;
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
        commitPlayer(encode(s.selected, sq));
        return false;
      }
      const code = s.board[sq];
      if (code > 0) {
        s.selected = sq;
        s.targets = legalMoves(s.board, RED).filter((mm) => mFrom(mm) === sq).map(mTo);
        sound.play("select");
        sync();
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
    [commitPlayer, sync, thinking],
  );

  const drop = useCallback(
    (from: number, to: number | null) => {
      const s = sceneRef.current;
      if (phaseRef.current !== "playing" || thinking) return;
      if (to != null && to !== from && s.targets.includes(to)) {
        commitPlayer(encode(from, to));
      }
    },
    [commitPlayer, thinking],
  );

  handlersRef.current = { press, drop, animDone: onAnimDone };

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (phaseRef.current !== "playing") return;
      const k = e.key;
      const s = sceneRef.current;
      if (k === "Escape") {
        if (s.selected != null) {
          s.selected = null;
          s.targets = [];
          sync();
        }
        return;
      }
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
        cx = Math.max(0, Math.min(8, cx + dirs[k][0]));
        cy = Math.max(0, Math.min(9, cy + dirs[k][1]));
        s.cursor = cy * 9 + cx;
        sync();
        return;
      }
      if (k === "Enter" || k === " ") {
        e.preventDefault();
        s.showCursor = true;
        press(s.cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, sync]);

  /* ---------- 提示：高亮一条成杀路线 ---------- */
  const hint = useCallback(() => {
    if (phaseRef.current !== "playing" || usedHint) return;
    const s = sceneRef.current;
    const { promise } = ai.search(s.board, RED, { maxDepth: 9, timeMs: 900, randomness: 0, blunder: 0 });
    void promise.then((res) => {
      if (res.move < 0) return;
      s.hint = { from: mFrom(res.move), to: mTo(res.move) };
      setShowHint(true);
      setUsedHint(true);
      sound.play("ui");
      sync();
    });
  }, [ai, sync, usedHint]);

  /* ---------- 重新开始 ---------- */
  const restart = useCallback(() => {
    const b = boardOf(puzzle);
    boardRef.current = b;
    const s = sceneRef.current;
    s.board = b;
    s.turn = RED;
    s.selected = null;
    s.targets = [];
    s.lastMove = null;
    s.hint = null;
    s.checkSide = 0;
    s.anim = null;
    s.drag = null;
    s.threat = [];
    s.interactive = true;
    s.intro = performance.now() / 1000;
    fx.reset();
    finishedRef.current = false;
    pendingRef.current = null;
    movesRef.current = 0;
    setStep(0);
    setWrong(0);
    setShowHint(false);
    setMsg("");
    setThinking(false);
    sound.play("ui");
    sync();
  }, [fx, puzzle, sync]);

  /* ================= 渲染 ================= */
  const roundsLeft = Math.max(0, puzzle.mateIn - step);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-ink-950">
      <Ambient hue={PUZZLE_HUE} />

      {/* 顶栏 */}
      <header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-gold/12 bg-ink-950/70 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] backdrop-blur-md">
        <button
          onClick={() => {
            sound.play("ui");
            onExit();
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-ink-800/70 text-paper/70 transition-all active:scale-90 hover:text-gold-2"
          title="返回主菜单"
        >
          <IconArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-2xl text-jade-2">每日一题</span>
            <span className="font-mono text-[10px] text-paper/35">{day}</span>
          </div>
          <div className="truncate text-[10px] text-paper/40">
            {puzzle.title} · 红先 · {puzzle.mateIn} 回合内将杀黑方
          </div>
        </div>
        <div
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums",
            phase === "solved" ? "bg-jade/20 text-jade-2" : roundsLeft > 0 ? "bg-gold/15 text-gold-2" : "bg-cinnabar/20 text-cinnabar-2",
          )}
          title="剩余回合"
        >
          {phase === "solved" ? "✓ 已解" : `${roundsLeft} 回合`}
        </div>
      </header>

      {/* 棋盘 */}
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-xl flex-1 px-2 py-2">
        {phase === "loading" ? (
          <div className="grid h-full w-full place-items-center text-sm text-paper/40">载入中…</div>
        ) : (
          <BoardCanvas sceneRef={sceneRef} fx={fx} handlers={handlersRef} onLayout={handleLayout} />
        )}
        {phase === "playing" && thinking && (
          <div className="pointer-events-none absolute inset-x-0 bottom-2 z-20 flex justify-center">
            <span className="rounded-full border border-steel/30 bg-ink-950/75 px-3 py-1 text-[10px] tracking-[0.25em] text-paper/50 backdrop-blur">
              黑方防守中…
            </span>
          </div>
        )}
        {phase === "playing" && showHint && scene.hint && (
          <div className="pointer-events-none absolute inset-x-0 top-2 z-20 flex justify-center">
            <span className="anim-tick rounded-full border border-azure/40 bg-ink-950/85 px-3 py-1.5 text-center text-[11px] text-azure backdrop-blur">
              提示 · {moveToText(scene.board, scene.hint.from * 90 + scene.hint.to)} · {puzzle.hint}
            </span>
          </div>
        )}
      </main>

      {/* 底部操作区 */}
      <div className="relative z-10 mx-auto mb-2 w-full max-w-xl px-3">
        <div className="mb-2 flex items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-jade/50 bg-jade/10 text-sm font-bold text-jade-2">
            帥
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-paper/85">你 · 执红先手</span>
              {phase === "playing" && step === 0 && <span className="rounded bg-jade/15 px-1.5 py-px text-[9px] font-bold text-jade-2">点棋子开始</span>}
            </div>
            <div className="truncate text-[9px] text-paper/35">
              {phase === "solved"
                ? `本日已通关 · 用 ${movesRef.current} 步${usedHint ? "（含提示）" : "（无提示）"}`
                : roundsLeft === 0
                  ? "回合已用尽 · 未能在限定回合内将杀，点「重来」再试"
                  : msg || "点击 / 拖拽 / 方向键+回车 均可落子"}
            </div>
          </div>
        </div>
        {phase === "playing" ? (
          <div className="grid grid-cols-3 gap-2">
            <Btn variant="ghost" onClick={hint} disabled={usedHint} className="py-2.5 text-xs">
              <IconBulb className="h-4 w-4" /> {usedHint ? "已提示" : "提示"}
            </Btn>
            <Btn variant="ghost" onClick={restart} className="py-2.5 text-xs">
              <IconRestart className="h-4 w-4" /> 重来
            </Btn>
            <Btn variant="ghost" onClick={onExit} className="py-2.5 text-xs">
              <IconArrowLeft className="h-4 w-4" /> 返回
            </Btn>
          </div>
        ) : phase === "solved" ? (
          <div className="anim-rise rounded-2xl border border-jade/30 bg-jade/10 p-4 text-center">
            <div className="font-display text-3xl text-jade-2">今日已解</div>
            <p className="mt-1 text-[11px] text-paper/45">
              {puzzle.title} · {movesRef.current} 步{usedHint ? " · 使用了提示" : " · 未用提示，漂亮！"}
              {solvedCloud === null && " ·（离线模式，本次未计入云端）"}
            </p>
            <div className="mt-3 flex justify-center gap-2">
              <Btn variant="ghost" onClick={restart} className="px-4 py-2 text-xs">
                <IconRestart className="h-4 w-4" /> 再玩一次
              </Btn>
              <Btn variant="gold" onClick={onExit} className="px-4 py-2 text-xs">
                <IconTrophy className="h-4 w-4" /> 返回主页
              </Btn>
            </div>
          </div>
        ) : null}
        {wrong > 0 && phase === "playing" && (
          <div className="mt-2 text-center text-[10px] text-cinnabar-2">已错 {wrong} 次提示不影响通关，但会记录</div>
        )}
      </div>
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </div>
  );
}

/* seat 复用联机模块的本地标识 */
function randomSeat(): string {
  try {
    const arr = new Uint8Array(8);
    crypto.getRandomValues(arr);
    return Array.from(arr, (n) => n.toString(16).padStart(2, "0")).join("");
  } catch {
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  }
}
function getSeat(): string {
  try {
    let s = localStorage.getItem("xq2-seat");
    if (!s) {
      s = randomSeat();
      localStorage.setItem("xq2-seat", s);
    }
    return s;
  } catch {
    return randomSeat();
  }
}
