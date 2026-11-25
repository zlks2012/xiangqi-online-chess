import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, IconArrowLeft } from "./components/ui";
import { sound } from "./audio/sound";
import { AIClient } from "./game/aiClient";
import {
  BLACK,
  type Board,
  RED,
  charOf,
  gameResult,
  inCheck,
  mFrom,
  mTo,
  makeMove,
  moveToText,
} from "./game/xiangqi";
import { cn } from "./utils/cn";

/* ------------------------------------------------------------------ */
/* 复盘评注：逐步回放 + AI 评估标注 + 形势曲线                          */
/* ------------------------------------------------------------------ */

interface MoveRec {
  move: number;
  side: number; // 1 红 / -1 黑
  cap: number;
}

export interface ReviewInput {
  moves: MoveRec[];
  startBoard: Board;
  result: "win" | "lose" | "draw";
  title: string;
}

interface StepEval {
  /** 红方视角评估（centipawn） */
  score: number;
  /** 该步质量 */
  tag: "best" | "good" | "inaccuracy" | "mistake" | "blunder";
  /** 评注文字 */
  note: string;
}

const TAG_META: Record<StepEval["tag"], { label: string; cls: string; emoji: string }> = {
  best: { label: "妙手", cls: "text-jade-2 bg-jade/15 border-jade/40", emoji: "✦" },
  good: { label: "正着", cls: "text-paper/70 bg-white/5 border-white/15", emoji: "·" },
  inaccuracy: { label: "稍缓", cls: "text-amber bg-amber/15 border-amber/40", emoji: "!" },
  mistake: { label: "失着", cls: "text-cinnabar-2 bg-cinnabar/15 border-cinnabar-2/40", emoji: "?!" },
  blunder: { label: "败着", cls: "text-cinnabar-2 bg-cinnabar/25 border-cinnabar-2/60", emoji: "??" },
};

const MATE = 99900;

export default function ReviewOverlay({ input, onExit }: { input: ReviewInput; onExit: () => void }) {
  const [idx, setIdx] = useState(0); // 当前展示到第几步（已应用步数）
  const [evals, setEvals] = useState<StepEval[] | null>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const ai = useMemo(() => new AIClient(), []);

  const boardRef = useRef<Board>(Int8Array.from(input.startBoard));
  const [, force] = useState(0);
  const sync = useCallback(() => force((v) => v + 1), []);

  const n = input.moves.length;

  /* ---------- 逐步重建到第 idx 步 ---------- */
  const rebuild = useCallback(
    (k: number) => {
      const b = Int8Array.from(input.startBoard);
      for (let i = 0; i < k; i++) makeMove(b, input.moves[i].move);
      boardRef.current = b;
      setIdx(k);
      sync();
    },
    [input, sync],
  );

  useEffect(() => {
    rebuild(0);
    return () => ai.dispose();
  }, [ai, rebuild]);

  /* ---------- AI 批量评估 ---------- */
  const analyze = useCallback(async () => {
    if (busy || evals) return;
    setBusy(true);
    setProgress(0);
    const out: StepEval[] = [];
    const b = Int8Array.from(input.startBoard);

    // 记录每步前后的静态评估（用短搜索保证速度）
    const evalAt = async (board: Board, sideToMove: number): Promise<number> => {
      const { promise } = ai.search(board, sideToMove, { maxDepth: 4, timeMs: 160, randomness: 0, blunder: 0 });
      const r = await promise;
      // score 为 sideToMove 视角 → 转红方视角
      return sideToMove === RED ? r.score : -r.score;
    };

    let prevScore = await evalAt(b, RED);
    for (let i = 0; i < n; i++) {
      const mv = input.moves[i];
      const side = mv.side;
      makeMove(b, mv.move);
      const nextToMove = -side;
      // 局终判定：无步可走时评估为 ±MATE
      if (gameResult(b, nextToMove) !== 0) {
        const winner = nextToMove === RED ? BLACK : RED;
        out.push({
          score: winner === RED ? MATE : -MATE,
          tag: "best",
          note: `${charOf(Math.abs(mv.cap) || 1) && ""}将杀！${side === RED ? "红方" : "黑方"}取胜`,
        });
        prevScore = winner === RED ? MATE : -MATE;
        setProgress(Math.round(((i + 1) / n) * 100));
        continue;
      }
      const curScore = await evalAt(b, nextToMove);
      // 走子方视角的损失：走子前该方优势 - 走子后该方优势
      const before = side === RED ? prevScore : -prevScore;
      const after = side === RED ? curScore : -curScore;
      const loss = before - after;
      let tag: StepEval["tag"] = "good";
      let note = "";
      if (mv.cap !== 0) note = `吃${charOf(mv.cap)} · `;
      if (loss <= 15) tag = "best";
      else if (loss <= 60) tag = "good";
      else if (loss <= 150) {
        tag = "inaccuracy";
        note += "此步略缓，优势缩小 ";
      } else if (loss <= 350) {
        tag = "mistake";
        note += "失着！损失明显 ";
      } else {
        tag = "blunder";
        note += "败着！局面逆转 ";
      }
      if (tag === "inaccuracy" || tag === "mistake" || tag === "blunder") note += `${(loss / 100).toFixed(1)} 分`;
      if (inCheck(b, nextToMove)) note += " · 将军";
      out.push({ score: curScore, tag, note: note || "稳健" });
      prevScore = curScore;
      setProgress(Math.round(((i + 1) / n) * 100));
    }
    setEvals(out);
    setBusy(false);
    sound.play("ui");
  }, [ai, busy, evals, input, n]);

  /* ---------- 键盘翻页 ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") rebuild(Math.max(0, idx - 1));
      if (e.key === "ArrowRight") rebuild(Math.min(n, idx + 1));
      if (e.key === "Home") rebuild(0);
      if (e.key === "End") rebuild(n);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [idx, n, rebuild]);

  /* ---------- 棋子清单（渲染迷你棋盘） ---------- */
  const pieces = useMemo(() => {
    const list: { sq: number; code: number }[] = [];
    const b = boardRef.current;
    for (let i = 0; i < 90; i++) if (b[i] !== 0) list.push({ sq: i, code: b[i] });
    return list;
  }, [idx, sync]);

  const last = idx > 0 ? input.moves[idx - 1] : null;
  const lastFrom = last ? mFrom(last.move) : -1;
  const lastTo = last ? mTo(last.move) : -1;
  const curEval = evals && idx > 0 ? evals[idx - 1] : null;

  /* ---------- 形势曲线数据 ---------- */
  const curve = useMemo(() => {
    if (!evals) return [];
    return evals.map((e) => Math.max(-1, Math.min(1, e.score / 800)));
  }, [evals]);

  const pos = (sq: number) => ({ x: sq % 9, y: (sq / 9) | 0 });

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-ink-950/98 backdrop-blur-sm">
      {/* 顶栏 */}
      <header className="flex shrink-0 items-center gap-2 border-b border-gold/12 bg-ink-900/80 px-3 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top,0px))]">
        <button
          onClick={() => {
            sound.play("ui");
            onExit();
          }}
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-gold/25 bg-ink-800 text-paper/70 active:scale-90"
          title="关闭复盘"
        >
          <IconArrowLeft className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display text-xl text-gold-2">对局复盘</div>
          <div className="truncate text-[10px] text-paper/40">
            {input.title} · {n} 步 · {input.result === "win" ? "你获胜" : input.result === "lose" ? "你落败" : "和棋"}
          </div>
        </div>
        <Btn variant="gold" onClick={() => void analyze()} disabled={busy || !!evals} className="shrink-0 px-3 py-2 text-xs">
          {busy ? `分析中 ${progress}%` : evals ? "已分析" : "AI 评注"}
        </Btn>
      </header>

      {/* 主体：棋盘 + 侧栏 */}
      <div className="scroll-cn flex min-h-0 flex-1 overflow-y-auto lg:overflow-hidden">
        {/* 迷你棋盘 */}
        <div className="mx-auto flex w-full max-w-md shrink-0 flex-col p-3 lg:max-w-lg">
          <div className="board-mini relative aspect-[9/10] w-full overflow-hidden rounded-xl border border-gold/20 bg-wood-900">
            <svg viewBox="0 0 9 10" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
              {Array.from({ length: 10 }, (_, y) => (
                <line key={`h${y}`} x1="0.5" y1={y + 0.5} x2="8.5" y2={y + 0.5} stroke="#7a3c0d" strokeWidth={y === 0 || y === 9 ? 0.06 : 0.032} />
              ))}
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
              <line x1="3.5" y1="0.5" x2="5.5" y2="2.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <line x1="5.5" y1="0.5" x2="3.5" y2="2.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" stroke="#7a3c0d" strokeWidth="0.032" />
              <text x="2.3" y="5.28" fontSize="0.42" fill="#7a3c0d" opacity="0.75" fontWeight="700" textAnchor="middle">楚 河</text>
              <text x="6.7" y="5.28" fontSize="0.42" fill="#7a3c0d" opacity="0.75" fontWeight="700" textAnchor="middle">漢 界</text>
            </svg>

            {/* 上一步高亮 */}
            {last && (
              <>
                <div className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${((pos(lastFrom).x + 0.5) / 9) * 100}%`, top: `${((pos(lastFrom).y + 0.5) / 10) * 100}%`, width: "10%", aspectRatio: "1", background: "rgba(255,180,60,0.3)" }} />
                <div className="pointer-events-none absolute z-[6] -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${((pos(lastTo).x + 0.5) / 9) * 100}%`, top: `${((pos(lastTo).y + 0.5) / 10) * 100}%`, width: "10%", aspectRatio: "1", background: "rgba(255,120,40,0.4)", boxShadow: "0 0 12px rgba(255,140,40,0.6)" }} />
              </>
            )}

            {/* 棋子 */}
            {pieces.map((p) => {
              const { x, y } = pos(p.sq);
              const red = p.code > 0;
              return (
                <div key={p.sq} className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${((x + 0.5) / 9) * 100}%`, top: `${((y + 0.5) / 10) * 100}%`, width: "10.4%", aspectRatio: "1" }}>
                  <span className="grid h-full w-full place-items-center rounded-full font-bold"
                    style={{
                      fontSize: "clamp(13px, 4.6vw, 26px)",
                      color: red ? "#a81f16" : "#241f2b",
                      background: "radial-gradient(circle at 32% 28%, #fdf3dc 0%, #f0dcae 42%, #d8bd8a 76%, #ab8a58 100%)",
                      boxShadow: "inset 0 0 0 2px rgba(88,58,28,0.55), 0 4px 10px -2px rgba(0,0,0,0.7)",
                    }}>
                    {charOf(p.code)}
                  </span>
                </div>
              );
            })}
          </div>

          {/* 步进控制 */}
          <div className="mt-3 flex items-center gap-2">
            <Btn variant="ghost" onClick={() => rebuild(0)} disabled={idx === 0} className="px-3 py-2 text-xs">|&lt;</Btn>
            <Btn variant="ghost" onClick={() => rebuild(Math.max(0, idx - 1))} disabled={idx === 0} className="px-3 py-2 text-xs">上一步</Btn>
            <div className="flex-1 text-center font-mono text-sm font-bold tabular-nums text-gold-2">
              {idx} / {n}
            </div>
            <Btn variant="ghost" onClick={() => rebuild(Math.min(n, idx + 1))} disabled={idx >= n} className="px-3 py-2 text-xs">下一步</Btn>
            <Btn variant="ghost" onClick={() => rebuild(n)} disabled={idx >= n} className="px-3 py-2 text-xs">&gt;|</Btn>
          </div>

          {/* 当前步评注 */}
          <div className="mt-2 min-h-[3.2rem] rounded-xl border border-gold/15 bg-ink-900/70 p-3">
            {last ? (
              <div className="flex items-start gap-2">
                <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold", last.side === RED ? "text-cinnabar-2" : "text-steel")}>
                  {idx}.{last.side === RED ? "" : "…"} {(() => { const b = Int8Array.from(input.startBoard); for (let i = 0; i < idx - 1; i++) makeMove(b, input.moves[i].move); return moveToText(b, last.move); })()}
                </span>
                {curEval ? (
                  <span className={cn("shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold", TAG_META[curEval.tag].cls)}>
                    {TAG_META[curEval.tag].emoji} {TAG_META[curEval.tag].label}
                  </span>
                ) : null}
                <span className="text-[11px] leading-4 text-paper/60">{curEval?.note ?? "点击「AI 评注」生成本局分析"}</span>
              </div>
            ) : (
              <p className="text-center text-[11px] text-paper/40">初始局面 · ←/→ 键或按钮翻页</p>
            )}
          </div>
        </div>

        {/* 右侧：棋谱 + 曲线（桌面）/ 下方（移动） */}
        <div className="mx-auto flex w-full max-w-md flex-col gap-3 p-3 lg:max-w-sm lg:overflow-y-auto">
          {/* 形势曲线 */}
          {evals && (
            <div className="rounded-2xl border border-gold/15 bg-ink-900/70 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/70">形势曲线</span>
                <span className="text-[9px] text-paper/40">红优 ↑ / 黑优 ↓</span>
              </div>
              <svg viewBox={`0 0 ${Math.max(n * 8, 40)} 60`} className="h-16 w-full" preserveAspectRatio="none">
                <rect x="0" y="0" width={Math.max(n * 8, 40)} height="60" fill="#0d0a10" rx="4" />
                <line x1="0" y1="30" x2={Math.max(n * 8, 40)} y2="30" stroke="#e9b95c" strokeWidth="0.6" opacity="0.5" />
                <line x1={idx * 8} y1="0" x2={idx * 8} y2="60" stroke="#ffdd9a" strokeWidth="1" opacity="0.9" />
                <path
                  d={curve.map((v, i) => `${i === 0 ? "M" : "L"}${i * 8},${30 - v * 26}`).join(" ")}
                  fill="none"
                  stroke="#ff5f47"
                  strokeWidth="1.6"
                />
              </svg>
            </div>
          )}

          {/* 棋谱列表 */}
          <div className="scroll-cn min-h-0 flex-1 overflow-y-auto rounded-2xl border border-gold/15 bg-ink-900/70 p-2">
            {n === 0 ? (
              <p className="py-6 text-center text-xs text-paper/30">本局未落子</p>
            ) : (
              <ol className="space-y-0.5">
                {Array.from({ length: Math.ceil(n / 2) }, (_, i) => {
                  const a = input.moves[i * 2];
                  const b2 = input.moves[i * 2 + 1];
                  const stepA = i * 2 + 1;
                  const stepB = i * 2 + 2;
                  const tagA = evals?.[stepA - 1];
                  const tagB = evals?.[b2 ? stepB - 1 : -1];
                  const active = idx === stepA || (b2 && idx === stepB);
                  return (
                    <li key={i} className={cn("flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs hover:bg-white/[0.05]", active && "bg-gold/10")}
                      onClick={() => rebuild(stepA)}>
                      <span className="w-5 shrink-0 text-right font-mono text-[10px] text-paper/25">{i + 1}</span>
                      <span className={cn("flex w-[6.2rem] shrink-0 items-center gap-1 font-bold", a.side === RED ? "text-cinnabar-2" : "text-steel")}
                        onClick={(e) => { e.stopPropagation(); rebuild(stepA); }}>
                        {aSideText(input, stepA)}
                        {tagA && tagA.tag !== "good" && tagA.tag !== "best" && <sup className="text-[9px]">{TAG_META[tagA.tag].emoji}</sup>}
                      </span>
                      {b2 ? (
                        <span className={cn("flex w-[6.2rem] shrink-0 items-center gap-1 font-bold", b2.side === RED ? "text-cinnabar-2" : "text-steel")}
                          onClick={(e) => { e.stopPropagation(); rebuild(stepB); }}>
                          {aSideText(input, stepB)}
                          {tagB && tagB.tag !== "good" && tagB.tag !== "best" && <sup className="text-[9px]">{TAG_META[tagB.tag].emoji}</sup>}
                        </span>
                      ) : (
                        <span className="w-[6.2rem] text-transparent">—</span>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>

          {/* 图例 */}
          {evals && (
            <div className="flex flex-wrap gap-1.5 rounded-xl border border-gold/10 bg-ink-900/50 p-2">
              {(["best", "good", "inaccuracy", "mistake", "blunder"] as const).map((t) => (
                <span key={t} className={cn("rounded-md border px-1.5 py-0.5 text-[9px] font-bold", TAG_META[t].cls)}>
                  {TAG_META[t].emoji} {TAG_META[t].label}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 生成第 k 步（1 起）的中文记谱 */
function aSideText(input: ReviewInput, k: number): string {
  const b = Int8Array.from(input.startBoard);
  for (let i = 0; i < k - 1; i++) makeMove(b, input.moves[i].move);
  return moveToText(b, input.moves[k - 1].move);
}
