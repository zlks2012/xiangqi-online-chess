import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Ambient from "./components/Ambient";
import BoardCanvas, { type BoardHandlers } from "./components/BoardCanvas";
import {
  Btn,
  IconArrowLeft,
  IconCheck,
  IconCopy,
  IconUsers,
  IconWifi,
  IconFlipBoard,
  IconFlip,
  IconPlay,
} from "./components/ui";
import { sound } from "./audio/sound";
import { Effects } from "./game/effects";
import {
  BLACK,
  type Board,
  RED,
  encode,
  findKing,
  gameResult,
  inCheck,
  initialBoard,
  legalMoves,
  mFrom,
  mTo,
  makeMove,
  moveToText,
} from "./game/xiangqi";
import type { Layout, Scene } from "./game/renderer";
import { computeLayout, sqToPx } from "./game/renderer";
import { cloud } from "./game/cloud";
import ReviewOverlay, { type ReviewInput } from "./ReviewOverlay";
import { reportMatchResult } from "./Ladder";
import { cn } from "./utils/cn";

/* ------------------------------------------------------------------ */
/* 云端房间                                                            */
/* ------------------------------------------------------------------ */

type RoomStatus = "waiting" | "playing" | "finished";

interface RoomRow {
  code: string;
  status: RoomStatus;
  moves: number[];
  move_count: number;
  red_seat: string | null;
  black_seat: string | null;
  winner: "r" | "b" | null;
  updated_at: string;
}

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
function genCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}
function msgOf(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e || "");
  if (/duplicate|23505/i.test(m)) return "房间号已存在，请重试";
  if (/permission|42501/i.test(m)) return "权限不足，请稍后重试";
  if (/fetch|network|failed/i.test(m)) return "网络异常，请检查网络后重试";
  return m.slice(0, 80) || "操作失败，请重试";
}

async function fetchRoom(code: string): Promise<RoomRow | null> {
  const { data, error } = await (cloud.database.from("rooms") as unknown as QueryChain)
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (error) throw error;
  return (data as RoomRow | null) ?? null;
}

/** SDK 查询构建器是链式的（select/insert/update/eq/maybeSingle/select 结果） */
interface QueryChain {
  select: (c?: string) => QueryChain;
  insert: (v: Record<string, unknown>) => QueryChain;
  update: (v: Record<string, unknown>) => QueryChain;
  eq: (c: string, v: unknown) => QueryChain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (onFulfilled?: (r: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
}

/* ------------------------------------------------------------------ */

const OPP_HUE = "#48a6ff";

export default function OnlineGame({ onExit }: { onExit: () => void }) {
  const seat = useRef(getSeat()).current;
  const [codeInput, setCodeInput] = useState("");
  const [room, setRoom] = useState<RoomRow | null>(null);
  const [myColor, setMyColor] = useState<"r" | "b" | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [netOk, setNetOk] = useState(true);
  const [winner, setWinner] = useState<"r" | "b" | null>(null);
  const [review, setReview] = useState<ReviewInput | null>(null);
  const [, force] = useState(0);
  const sync = useCallback(() => force((v) => v + 1), []);

  /* ---------- Canvas 场景（与 App.tsx 相同的模式） ---------- */
  const fx = useMemo(() => new Effects(), []);
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
  const layoutRef = useRef<Layout>(computeLayout(360, 420, 1));

  /* ---------- refs 镜像 ---------- */
  const appliedRef = useRef(0);
  const busyRef = useRef(false);
  const roomRef = useRef<RoomRow | null>(null);
  roomRef.current = room;
  const myColorRef = useRef<"r" | "b" | null>(null);
  myColorRef.current = myColor;
  const winnerRef = useRef<"r" | "b" | null>(null);
  const impactRef = useRef<{ cap: number; to: number; mover: number; text: string } | null>(null);
  const modeRef = useRef<"local" | "remote">("local"); // 落子动画归属：本地主动 or 远端同步

  const scene = sceneRef.current;
  const mySide = myColor === "b" ? BLACK : RED;
  const turn: "r" | "b" = scene.turn === RED ? "r" : "b";
  const moveN = appliedRef.current;
  const waitingFriend = !!room && !room.black_seat;
  const myTurn = turn === myColor && !winner && !!room && !waitingFriend;

  const handleLayout = useCallback((l: Layout) => {
    layoutRef.current = l;
  }, []);

  /* ---------- 通用：以动画方式应用一枚棋步 ---------- */
  const animateMove = useCallback(
    (m: number, isLocal: boolean) => {
      const s = sceneRef.current;
      const b = s.board;
      const from = mFrom(m);
      const to = mTo(m);
      const piece = b[from];
      if (piece === 0) return;
      const mover = s.turn;
      const cap = b[to];
      const text = moveToText(b, m);
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
      modeRef.current = isLocal ? "local" : "remote";
      sound.play("ui");
      sync();
    },
    [sync],
  );



  /* ---------- 终局判定 ---------- */
  const reportedRef = useRef(false);
  const settle = useCallback((b: Board, count: number, r: RoomRow | null) => {
    const sideToMove: number = count % 2 === 0 ? RED : BLACK;
    const loser = gameResult(b, sideToMove);
    if (loser !== 0) {
      const w: "r" | "b" = loser === RED ? "b" : "r";
      winnerRef.current = w;
      setWinner(w);
      if (w === myColorRef.current) sound.play("win");
      else sound.play("lose");
      if (r && r.status !== "finished") {
        void (cloud.database.from("rooms") as unknown as QueryChain)
          .update({ status: "finished", winner: w })
          .eq("code", r.code)
          .eq("status", "playing")
          .then(() => undefined, () => undefined);
      }
      // 天梯上报（完整对局才计分，每房一次）
      if (r && r.red_seat && r.black_seat && !reportedRef.current) {
        reportedRef.current = true;
        const mySeat = seat;
        const oppSeat = r.red_seat === seat ? r.black_seat : r.red_seat;
        void reportMatchResult(mySeat, oppSeat, w === myColorRef.current ? "win" : "lose");
      }
    }
  }, [seat]);

  /* ---------- 应用远端棋步（追赶模式，逐枚动画） ---------- */
  const applyRemote = useCallback(
    (r: RoomRow) => {
      if (r.moves.length <= appliedRef.current) return;
      const s = sceneRef.current;
      if (s.anim) return; // 动画中暂缓，轮询下一拍再追
      const m = r.moves[appliedRef.current];
      if (typeof m === "number" && m >= 0 && m < 8100) {
        animateMove(m, false);
        appliedRef.current += 1;
      } else {
        appliedRef.current += 1;
        return;
      }
      settle(s.board, r.moves.length, r);
    },
    [animateMove, settle],
  );

    /* ---------- 轮询房间 ---------- */
  useEffect(() => {
    if (!room?.code) return;
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetchRoom(room.code);
        if (!alive || !r) return;
        setNetOk(true);
        roomRef.current = r;
        setRoom(r);
        if (r.winner && r.status === "finished" && !winnerRef.current) {
          winnerRef.current = r.winner;
          setWinner(r.winner);
        }
        const s = sceneRef.current;
        // 朋友就位后，若轮到我且无动画，立即开放交互（覆盖 onAnimDone 之外的场景：
        // 例如房主在等待期间、或加入者刚坐下）
        if (r.black_seat && s.turn === s.playerSide && !s.anim && !winnerRef.current && !s.interactive) {
          s.interactive = true;
        }
        applyRemote(r);
        sync();
      } catch {
        if (alive) setNetOk(false);
      }
    };
    void tick();
    const id = window.setInterval(() => void tick(), 900);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [room?.code, applyRemote, sync]);

  /* ---------- 创建 / 加入 ---------- */
  const resetLocal = useCallback((color: "r" | "b") => {
    const b = initialBoard();
    boardRef.current = b;
    const s = sceneRef.current;
    s.board = b;
    s.turn = RED;
    s.playerSide = color === "b" ? BLACK : RED;
    s.selected = null;
    s.targets = [];
    s.lastMove = null;
    s.hint = null;
    s.checkSide = 0;
    s.anim = null;
    s.drag = null;
    s.threat = [];
    s.flip = color === "b";
    s.cursor = color === "r" ? 4 + 9 * 9 : 4;
    s.showCursor = false;
    s.interactive = false;
    s.intro = performance.now() / 1000;
    fx.reset();
    appliedRef.current = 0;
    winnerRef.current = null;
    reportedRef.current = false;
    setWinner(null);
    myColorRef.current = color;
    setMyColor(color);
  }, [fx]);

  const createRoom = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg("正在创建房间…");
    sound.resume();
    sound.play("select");
    try {
      let created: RoomRow | null = null;
      for (let i = 0; i < 6; i++) {
        const code = genCode();
        const { data, error } = await (cloud.database.from("rooms") as unknown as QueryChain)
          .insert({ code, status: "waiting", moves: [], move_count: 0, red_seat: seat, black_seat: null, winner: null })
          .select();
        if (!error && data && (data as RoomRow[]).length) {
          created = (data as RoomRow[])[0];
          break;
        }
        if (error && !/duplicate|23505/i.test(String((error as { message?: string }).message ?? ""))) throw error;
      }
      if (!created) throw new Error("房间号生成失败，请重试");
      resetLocal("r");
      roomRef.current = created;
      setRoom(created);
      setMsg("房间创建成功，把房间号告诉朋友吧");
      setNetOk(true);
    } catch (e) {
      setMsg(msgOf(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const joinRoom = async () => {
    const code = codeInput.trim();
    if (!/^\d{6}$/.test(code)) {
      setMsg("请输入 6 位房间号");
      sound.play("invalid");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMsg("正在加入房间…");
    sound.resume();
    sound.play("select");
    try {
      const r = await fetchRoom(code);
      if (!r) throw new Error("房间不存在，请检查房间号");
      if (r.red_seat === seat) throw new Error("这是你创建的房间，请把房间号发给朋友");
      if (r.black_seat && r.black_seat !== seat) throw new Error("房间已满，请换一个房间号");
      const { data, error } = await (cloud.database.from("rooms") as unknown as QueryChain)
        .update({ black_seat: seat, status: "playing" })
        .eq("code", code)
        .select();
      if (error) throw error;
      if (!data || !(data as RoomRow[]).length) throw new Error("加入失败，请重试");
      const joined = (data as RoomRow[])[0];
      resetLocal("b");
      roomRef.current = joined;
      setRoom(joined);
      setMsg("加入成功，你执黑方");
      setNetOk(true);
    } catch (e) {
      setMsg(msgOf(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  /* ---------- 落子并同步 ---------- */
  const commitMove = useCallback(
    async (m: number) => {
      const r = roomRef.current;
      if (!r || busyRef.current || winnerRef.current) return;
      busyRef.current = true;
      setBusy(true);
      try {
        const latest = await fetchRoom(r.code);
        if (!latest) throw new Error("房间已解散");
        if (latest.status === "finished") {
          winnerRef.current = latest.winner;
          setWinner(latest.winner);
          return;
        }
        const count = latest.moves.length;
        const side: "r" | "b" = count % 2 === 0 ? "r" : "b";
        if (side !== myColorRef.current) {
          setMsg("还没轮到你走棋");
          return;
        }
        const { data, error } = await (cloud.database.from("rooms") as unknown as QueryChain)
          .update({ moves: [...latest.moves, m], move_count: count + 1, updated_at: new Date().toISOString() })
          .eq("code", r.code)
          .eq("move_count", count)
          .select();
        if (error) throw error;
        if (!data || !(data as RoomRow[]).length) {
          setMsg("棋步冲突，正在同步最新棋局…");
          const fresh = await fetchRoom(r.code);
          if (fresh) {
            roomRef.current = fresh;
            setRoom(fresh);
          }
          return;
        }
        animateMove(m, true);
        appliedRef.current = count + 1;
        setMsg("");
        const updated = (data as RoomRow[])[0];
        roomRef.current = updated;
        setRoom(updated);
        settle(sceneRef.current.board, count + 1, updated);
      } catch (e) {
        setMsg(msgOf(e));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [animateMove, settle],
  );

  /* ---------- 输入（点击 / 拖拽 / 键盘共用） ---------- */
  const press = useCallback(
    (sq: number | null) => {
      const s = sceneRef.current;
      if (!myTurn || s.anim || busyRef.current) return false;
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
        void commitMove(encode(s.selected, sq));
        return false;
      }
      const code = s.board[sq];
      const mine = s.playerSide > 0 ? code > 0 : code < 0;
      if (code !== 0 && mine) {
        s.selected = sq;
        s.targets = legalMoves(s.board, s.playerSide).filter((mm) => mFrom(mm) === sq).map(mTo);
        s.hint = null;
        sound.play("select");
        const l = layoutRef.current;
        const p = sqToPx(l, sq, s.flip);
        fx.wave(p.px, p.py, l.r * 1.9, "rgba(255,221,154,0.7)", 2.5, 0.4);
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
    [commitMove, fx, myTurn, sync],
  );

  const drop = useCallback(
    (from: number, to: number | null) => {
      const s = sceneRef.current;
      if (!myTurn || busyRef.current) return;
      if (to != null && to !== from && s.targets.includes(to)) {
        void commitMove(encode(from, to));
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
    [commitMove, fx, myTurn],
  );

  /* ---------- 动画完成：特效 / 将军 / 交互权 ---------- */
  const onAnimDone = useCallback(() => {
    const s = sceneRef.current;
    const im = impactRef.current;
    impactRef.current = null;
    const l = layoutRef.current;
    const isLocal = modeRef.current === "local";

    if (im) {
      const p = sqToPx(l, im.to, s.flip);
      if (im.cap !== 0) {
        const t = Math.abs(im.cap);
        fx.burst(
          p.px,
          p.py,
          im.cap > 0 ? ["#ff5f47", "#d6382c", "#ffdd9a", "#f4e3bd"] : ["#9fb4e0", "#4b5a7d", "#e9b95c", "#f4e3bd"],
          24 + Math.min(40, t * 6),
          150 + t * 30,
          l.cell / 40,
        );
        fx.wave(p.px, p.py, l.cell * 2.1, "rgba(255,221,154,0.85)", 4, 0.5);
        fx.addShake(5 + Math.min(14, t * 2));
        fx.addFlash(0.16, "255,214,140");
        sound.play("capture");
      } else {
        fx.burst(p.px, p.py + l.r * 0.5, ["#c9a978", "#8a6a3c", "#e8d3a4"], 8, 60, l.cell / 46);
        fx.addShake(2.2);
        sound.play("move");
      }
      void isLocal;
    }

    s.checkSide = inCheck(s.board, s.turn) ? s.turn : 0;
    if (s.checkSide !== 0) {
      const k = findKing(s.board, s.checkSide);
      if (k >= 0) {
        const kp = sqToPx(l, k, s.flip);
        fx.wave(kp.px, kp.py, l.cell * 3.4, "rgba(255,95,71,0.95)", 5, 0.7);
        fx.burst(kp.px, kp.py, ["#ff5f47", "#ffdd9a", "#d6382c"], 26, 210, l.cell / 42);
        fx.addShake(11);
        fx.addFlash(0.3, "255,95,71");
      }
      sound.play("check");
    }

    if (winnerRef.current) {
      s.interactive = false;
      sync();
      return;
    }

    // 轮到我且朋友已就位才开放交互
    if (s.turn === s.playerSide && roomRef.current?.black_seat) {
      s.interactive = true;
      sync();
    } else {
      s.interactive = false;
      sync();
    }
  }, [fx, sync]);

  handlersRef.current = { press, drop, animDone: onAnimDone };

  /* ---------- 键盘 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!roomRef.current) return;
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
      if (k === "f" || k === "F") {
        s.flip = !s.flip;
        sound.play("ui");
        sync();
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press, sync]);

  /* ---------- 复制 / 离开 ---------- */
  const copyCode = async () => {
    if (!room) return;
    try {
      await navigator.clipboard.writeText(room.code);
    } catch {
      /* 忽略 */
    }
    setCopied(true);
    sound.play("ui");
    window.setTimeout(() => setCopied(false), 1600);
  };

  /* ---------- 复盘：重建每步（含吃子与走子方） ---------- */
  const openReview = useCallback(async () => {
    const r = roomRef.current;
    if (!r || !r.moves.length) return;
    const b = initialBoard();
    const recs: { move: number; side: number; cap: number }[] = [];
    let side = RED;
    for (const m of r.moves) {
      const cap = b[mTo(m)];
      recs.push({ move: m, side, cap });
      makeMove(b, m);
      side = -side;
    }
    setReview({
      moves: recs,
      startBoard: initialBoard(),
      result: winnerRef.current === myColorRef.current ? "win" : "lose",
      title: `联机对局 · 房间 ${r.code}`,
    });
  }, []);

  const leave = () => {
    roomRef.current = null;
    setRoom(null);
    myColorRef.current = null;
    setMyColor(null);
    winnerRef.current = null;
    setWinner(null);
    appliedRef.current = 0;
    setMsg("");
    setCodeInput("");
    sound.play("ui");
    onExit();
  };

  /* ================= 大厅 ================= */
  if (!room) {
    return (
      <div className="relative h-[100dvh] w-full overflow-hidden bg-ink-950">
        <Ambient hue={OPP_HUE} />
        <div className="scroll-cn relative z-10 h-full overflow-y-auto px-4 py-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:px-6">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
            <header className="anim-rise flex items-center gap-3">
              <Btn variant="ghost" onClick={leave} className="px-3 py-2" title="返回主菜单">
                <IconArrowLeft className="h-4 w-4" />
              </Btn>
              <div>
                <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.4em] text-gold/50">Online Battle</p>
                <h1 className="font-display text-4xl leading-none">
                  <span className="shimmer-gold">联机对战</span>
                </h1>
              </div>
            </header>

            <section className="anim-rise" style={{ animationDelay: "70ms" }}>
              <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-gold/60">
                <IconUsers className="h-4 w-4" /> 创建房间
              </h2>
              <div className="rounded-2xl border border-cinnabar-2/30 bg-ink-900/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm leading-relaxed text-paper/55">
                    创建后生成 6 位房间号，告诉朋友即可加入。
                  </p>
                  <span className="ml-3 shrink-0 rounded-md border border-cinnabar-2/40 bg-cinnabar/15 px-2 py-1 text-[10px] font-bold text-cinnabar-2">
                    你执红先手
                  </span>
                </div>
                <Btn variant="primary" onClick={createRoom} disabled={busy} className="mt-3 w-full py-3 tracking-[0.3em]">
                  <IconPlay className="h-4 w-4" /> 创建房间
                </Btn>
              </div>
            </section>

            <section className="anim-rise" style={{ animationDelay: "140ms" }}>
              <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-gold/60">
                <IconWifi className="h-4 w-4" /> 加入房间
              </h2>
              <div className="rounded-2xl border border-azure/30 bg-ink-900/70 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-paper/55">输入朋友发来的 6 位房间号。</p>
                  <span className="ml-3 shrink-0 rounded-md border border-azure/40 bg-azure/10 px-2 py-1 text-[10px] font-bold text-azure">
                    你执黑后手
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  <input
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void joinRoom();
                    }}
                    inputMode="numeric"
                    placeholder="000000"
                    aria-label="房间号输入"
                    className="min-w-0 flex-1 rounded-xl border border-gold/25 bg-ink-950/80 px-3 py-3 text-center font-mono text-2xl font-black tracking-[0.5em] text-gold-2 outline-none transition-colors focus:border-gold-2/70"
                  />
                  <Btn variant="gold" onClick={joinRoom} disabled={busy} className="shrink-0 px-6">
                    加入
                  </Btn>
                </div>
              </div>
            </section>

            {msg && (
              <div className="anim-fade rounded-xl border border-gold/25 bg-gold/10 px-4 py-3 text-center text-sm text-gold-2">
                {msg}
              </div>
            )}

            <section className="anim-rise rounded-2xl border border-gold/12 bg-ink-900/50 p-4 text-[11px] leading-relaxed text-paper/40" style={{ animationDelay: "210ms" }}>
              <div className="mb-1 font-bold text-gold/70">玩法说明</div>
              房主执红先走，朋友执黑。棋步自动同步，轮到谁走会明确提示；支持点击 / 拖拽 / 键盘方向键 + 回车三种操作。
              无需注册登录，房间号就是凭据，请勿公开给陌生人。
            </section>
          </div>
        </div>
      </div>
    );
  }

  /* ================= 对局 ================= */
  const oppLabel = myColor === "r" ? "朋友 · 执黑" : "朋友 · 执红";
  const myLabel = myColor === "r" ? "你 · 执红" : "你 · 执黑";

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-ink-950">
      <Ambient hue={OPP_HUE} />

      {/* 顶栏 */}
      <header className="relative z-20 flex shrink-0 items-center gap-2 border-b border-gold/12 bg-ink-950/70 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))] backdrop-blur-md">
        <button
          onClick={leave}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-ink-800/70 text-paper/70 transition-all active:scale-90 hover:border-gold/60 hover:text-gold-2"
          title="返回大厅"
        >
          <IconArrowLeft className="h-4 w-4" />
        </button>
        <button
          onClick={copyCode}
          className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-xl border border-gold/30 bg-gold/10 px-3 py-1.5 transition-all active:scale-[0.98]"
          title="点击复制房间号"
        >
          <span className="text-[9px] uppercase tracking-[0.3em] text-gold/60">房间</span>
          <span className="font-mono text-xl font-black tracking-[0.3em] text-gold-2 tabular-nums">{room.code}</span>
          {copied ? <IconCheck className="h-4 w-4 shrink-0 text-jade" /> : <IconCopy className="h-4 w-4 shrink-0 text-gold/70" />}
        </button>
        <div
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-xl border bg-ink-800/70",
            netOk ? "border-jade/40 text-jade" : "border-cinnabar-2/50 text-cinnabar-2 animate-pulse",
          )}
          title={netOk ? "同步正常" : "连接异常"}
        >
          <IconWifi className="h-4 w-4" />
        </div>
      </header>

      {/* 对手条 */}
      <div className="relative z-10 mx-auto mt-2 flex w-full max-w-xl items-center gap-2.5 px-3">
        <div
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 border-steel/60 bg-gradient-to-br from-ink-700 to-ink-900 text-sm font-bold",
            turn !== myColor && !winner && "shadow-[0_0_18px_-4px_rgba(125,144,184,0.9)]",
          )}
        >
          <IconUsers className="h-4 w-4 text-steel" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-bold text-paper/85">{oppLabel}</span>
            {waitingFriend ? (
              <span className="rounded bg-amber/15 px-1.5 py-px text-[9px] font-bold text-amber">等待加入…</span>
            ) : turn !== myColor && !winner ? (
              <span className="rounded bg-amber/15 px-1.5 py-px text-[9px] font-bold text-amber">行棋中</span>
            ) : null}
          </div>
          <div className="text-[9px] text-paper/30">
            第 {Math.floor(moveN / 2) + 1} 回合 · 棋步自动同步
          </div>
        </div>
        <button
          onClick={() => {
            sceneRef.current.flip = !sceneRef.current.flip;
            sound.play("ui");
            sync();
          }}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-gold/20 bg-ink-800/70 text-paper/60 transition-all active:scale-90 hover:text-gold-2"
          title="翻转棋盘 (F)"
        >
          <IconFlipBoard className="h-4 w-4" />
        </button>
      </div>

      {/* 棋盘 */}
      <main className="relative z-10 mx-auto flex min-h-0 w-full max-w-xl flex-1 px-2 py-2">
        <BoardCanvas sceneRef={sceneRef} fx={fx} handlers={handlersRef} onLayout={handleLayout} />
        {winner && (
          <div className="anim-stamp pointer-events-none absolute left-1/2 top-[38%] z-20 -translate-x-1/2 select-none font-display text-[clamp(3rem,11vw,5.5rem)] leading-none"
            style={{
              color: winner === myColor ? "#ffdd9a" : "#93a4c8",
              textShadow: "0 0 34px currentColor, 0 6px 18px rgba(0,0,0,0.85)",
            }}>
            {winner === myColor ? "胜" : "败"}
          </div>
        )}
        {!winner && waitingFriend && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <span className="anim-pulse-ring rounded-full border border-gold/30 bg-ink-950/80 px-5 py-2.5 text-xs tracking-[0.3em] text-gold-2 backdrop-blur">
              等待朋友加入 · 房间号 {room.code}
            </span>
          </div>
        )}
        {!winner && !waitingFriend && !myTurn && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center">
            <span className="rounded-full border border-steel/30 bg-ink-950/75 px-3 py-1 text-[10px] tracking-[0.25em] text-paper/45 backdrop-blur">
              朋友行棋中…
            </span>
          </div>
        )}
        {myTurn && moveN === 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-1 z-20 flex justify-center">
            <span className="anim-tick rounded-full border border-jade/30 bg-ink-950/75 px-3 py-1 text-[10px] tracking-[0.2em] text-jade-2 backdrop-blur">
              点击或拖动棋子 · 绿点为可落点
            </span>
          </div>
        )}
      </main>

      {/* 我的条 */}
      <div className="relative z-10 mx-auto mb-2 flex w-full max-w-xl items-center gap-2.5 px-3">
        <div
          className={cn(
            "grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 text-sm font-bold transition-shadow",
            myColor === "r" ? "border-cinnabar-2/60 bg-gradient-to-br from-cinnabar/30 to-ink-900 text-cinnabar-2" : "border-steel/40 bg-gradient-to-br from-ink-700 to-ink-900 text-steel",
            myTurn && "shadow-[0_0_18px_-4px_rgba(255,95,71,0.9)]",
          )}
        >
          {myColor === "r" ? "帅" : "将"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-paper/85">{myLabel}</span>
            {myTurn && <span className="rounded bg-jade/15 px-1.5 py-px text-[9px] font-bold text-jade-2">轮到你走</span>}
            {scene.checkSide === mySide && <span className="rounded bg-cinnabar px-1.5 py-px text-[9px] font-bold text-paper">被将军!</span>}
          </div>
          <div className="truncate text-[9px] text-paper/35">{msg || "方向键 + 回车 · 点击 · 拖拽 均可落子"}</div>
        </div>
        <Btn variant="ghost" onClick={copyCode} className="shrink-0 px-3 py-2 text-xs">
          {copied ? <IconCheck className="h-4 w-4 text-jade" /> : <IconCopy className="h-4 w-4" />}
          {copied ? "已复制" : "房间号"}
        </Btn>
        {winner && room?.moves?.length ? (
          <Btn variant="gold" onClick={() => void openReview()} className="shrink-0 px-3 py-2 text-xs">
            复盘
          </Btn>
        ) : null}
        <Btn variant="danger" onClick={leave} className="shrink-0 px-3 py-2 text-xs">
          <IconFlip className="h-4 w-4" /> 离开
        </Btn>
      </div>
      {review && (
        <ReviewOverlay input={review} onExit={() => setReview(null)} />
      )}
      <div className="h-[env(safe-area-inset-bottom,0px)]" />
    </div>
  );
}
