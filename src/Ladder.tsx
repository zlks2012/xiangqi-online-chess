import { useCallback, useEffect, useRef, useState } from "react";
import { Btn, IconArrowLeft, IconCrown, IconTrophy } from "./components/ui";
import Ambient from "./components/Ambient";
import { sound } from "./audio/sound";
import { cloud } from "./game/cloud";
import { cn } from "./utils/cn";

/* ------------------------------------------------------------------ */
/* 云端天梯榜（Elo 积分排行）                                            */
/* ------------------------------------------------------------------ */

interface PlayerRow {
  seat: string;
  name: string;
  elo: number;
  wins: number;
  losses: number;
  draws: number;
  streak: number;
}

interface QueryChain {
  select: (c?: string) => QueryChain;
  insert: (v: Record<string, unknown>) => QueryChain;
  update: (v: Record<string, unknown>) => QueryChain;
  eq: (c: string, v: unknown) => QueryChain;
  order: (c: string, d?: unknown) => QueryChain;
  limit: (n: number) => QueryChain;
  maybeSingle: () => Promise<{ data: unknown; error: unknown }>;
  then: (onFulfilled?: (r: { data: unknown; error: unknown }) => unknown, onRejected?: (e: unknown) => unknown) => Promise<unknown>;
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
export function getSeat(): string {
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

/** 读取我的档案（不存在则初始化） */
export async function ensurePlayer(seat: string, name = "棋手"): Promise<PlayerRow> {
  const q = () => cloud.database.from("players") as unknown as QueryChain;
  const { data, error } = await q().select("*").eq("seat", seat).maybeSingle();
  if (!error && data) return data as PlayerRow;
  const { data: created } = await q().insert({ seat, name, elo: 1200, wins: 0, losses: 0, draws: 0, streak: 0 }).select();
  if (created && (created as PlayerRow[]).length) return (created as PlayerRow[])[0];
  return { seat, name, elo: 1200, wins: 0, losses: 0, draws: 0, streak: 0 };
}

/** Elo 更新（K=32）。胜者加分=败者扣分 */
export function eloDelta(mine: number, theirs: number, result: "win" | "lose" | "draw"): number {
  const expected = 1 / (1 + Math.pow(10, (theirs - mine) / 400));
  const actual = result === "win" ? 1 : result === "draw" ? 0.5 : 0;
  return Math.round(32 * (actual - expected));
}

/** 联机对局结束后上报战绩（best-effort） */
export async function reportMatchResult(
  seat: string,
  oppSeat: string,
  result: "win" | "lose" | "draw",
): Promise<void> {
  try {
    const me = await ensurePlayer(seat);
    const opp = await ensurePlayer(oppSeat);
    const d = eloDelta(me.elo, opp.elo, result);
    const q = () => cloud.database.from("players") as unknown as QueryChain;
    const win = result === "win" ? 1 : 0;
    const lose = result === "lose" ? 1 : 0;
    const draw = result === "draw" ? 1 : 0;
    const myStreak = result === "win" ? Math.max(1, me.streak + 1) : 0;
    const oppStreak = result === "lose" ? Math.max(1, opp.streak + 1) : 0;
    await q().update({
      elo: Math.max(100, me.elo + d),
      wins: me.wins + win,
      losses: me.losses + lose,
      draws: me.draws + draw,
      streak: myStreak,
      updated_at: new Date().toISOString(),
    }).eq("seat", seat);
    await q().update({
      elo: Math.max(100, opp.elo - d),
      wins: opp.wins + (result === "lose" ? 1 : 0),
      losses: opp.losses + (result === "win" ? 1 : 0),
      draws: opp.draws + draw,
      streak: oppStreak,
      updated_at: new Date().toISOString(),
    }).eq("seat", oppSeat);
  } catch {
    /* 网络失败忽略：天梯为尽力而为 */
  }
}

/* ---------------- 天梯榜页面 ---------------- */

const LADDER_HUE = "#f2a33c";

export default function Ladder({ onExit }: { onExit: () => void }) {
  const [rows, setRows] = useState<PlayerRow[] | null>(null);
  const [me, setMe] = useState<PlayerRow | null>(null);
  const [netOk, setNetOk] = useState(true);
  const seat = useRef(getSeat()).current;

  const load = useCallback(async () => {
    try {
      const q = (cloud.database.from("players") as unknown as QueryChain)
        .select("*")
        .order("elo", true)
        .limit(50);
      // 8 秒超时：本地跨域/网络异常时显示错误提示（线上同域无此问题）
      const res = await Promise.race([
        q as unknown as Promise<{ data: unknown; error: unknown }>,
        new Promise<{ data: null; error: "timeout" }>((resolve) => window.setTimeout(() => resolve({ data: null, error: "timeout" }), 8000)),
      ]);
      if (res.error) throw res.error;
      const list = ((res.data as PlayerRow[]) ?? []).sort((a, b) => b.elo - a.elo);
      setRows(list);
      const myRow = list.find((r) => r.seat === seat) ?? null;
      setMe(myRow);
      setNetOk(true);
    } catch {
      setNetOk(false);
      setRows([]);
    }
  }, [seat]);

  useEffect(() => {
    void load();
  }, [load]);

  const myRank = me && rows ? rows.findIndex((r) => r.seat === seat) + 1 : 0;

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink-950">
      <Ambient hue={LADDER_HUE} />
      <div className="scroll-cn relative z-10 h-full overflow-y-auto px-4 py-6 pt-[calc(1.5rem+env(safe-area-inset-top,0px))] sm:px-6">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-4">
          <header className="anim-rise flex items-center gap-3">
            <Btn variant="ghost" onClick={onExit} className="px-3 py-2" title="返回主菜单">
              <IconArrowLeft className="h-4 w-4" />
            </Btn>
            <div>
              <p className="mb-0.5 text-[10px] font-bold uppercase tracking-[0.4em] text-gold/50">Ladder</p>
              <h1 className="font-display text-4xl leading-none">
                <span className="shimmer-gold">天梯榜</span>
              </h1>
            </div>
            <button
              onClick={() => {
                sound.play("ui");
                void load();
              }}
              className="ml-auto rounded-lg border border-gold/25 bg-ink-800/70 px-3 py-1.5 text-[11px] text-paper/60 active:scale-95"
            >
              刷新
            </button>
          </header>

          {/* 我的卡片 */}
          <div className="anim-rise rounded-2xl border border-gold/25 bg-gradient-to-b from-ink-850/95 to-ink-900/95 p-4" style={{ animationDelay: "60ms" }}>
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-gold-2/60 bg-gold/15 text-2xl font-black text-gold-2">
                {me ? `#${myRank || "-"}` : "—"}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-paper">{me?.name ?? "未上榜"}</span>
                  {me && me.streak >= 2 && (
                    <span className="rounded bg-cinnabar/20 px-1.5 py-px text-[9px] font-bold text-cinnabar-2">{me.streak} 连胜</span>
                  )}
                </div>
                <div className="mt-0.5 font-mono text-2xl font-black tabular-nums text-gold-2">{me?.elo ?? "—"}</div>
              </div>
              {me && (
                <div className="shrink-0 text-right text-[10px] leading-4 text-paper/45">
                  <div>
                    <span className="font-bold text-jade-2">{me.wins}</span> 胜
                  </div>
                  <div>
                    <span className="font-bold text-cinnabar-2">{me.losses}</span> 负
                  </div>
                  <div>
                    <span className="font-bold text-paper/70">{me.draws}</span> 和
                  </div>
                </div>
              )}
            </div>
            {!me && (
              <p className="mt-2 text-[11px] text-paper/40">完成一场联机对局即可登上天梯</p>
            )}
          </div>

          {!netOk && (
            <div className="rounded-xl border border-cinnabar-2/40 bg-cinnabar/10 px-4 py-3 text-center text-xs text-cinnabar-2">
              天梯加载失败，请检查网络后点「刷新」
            </div>
          )}

          {/* 榜单 */}
          <div className="anim-rise rounded-2xl border border-gold/15 bg-ink-900/70" style={{ animationDelay: "120ms" }}>
            <div className="flex items-center gap-2 border-b border-gold/10 px-4 py-2.5">
              <IconTrophy className="h-4 w-4 text-gold/80" />
              <h3 className="text-[11px] font-bold uppercase tracking-[0.22em] text-gold/70">棋力排行 · Top 50</h3>
              <span className="ml-auto text-[9px] text-paper/30">Elo · K=32</span>
            </div>
            <div className="scroll-cn max-h-[52vh] overflow-y-auto p-2">
              {rows === null ? (
                <p className="py-8 text-center text-xs text-paper/35">载入中…</p>
              ) : rows.length === 0 ? (
                <p className="py-8 text-center text-xs text-paper/35">暂无对局记录 · 等你来开天梯第一局</p>
              ) : (
                <ol className="space-y-1">
                  {rows.map((r, i) => {
                    const mine = r.seat === seat;
                    const rank = i + 1;
                    return (
                      <li
                        key={r.seat}
                        className={cn(
                          "flex items-center gap-2.5 rounded-xl px-3 py-2",
                          mine ? "border border-gold-2/50 bg-gold/12" : "hover:bg-white/[0.04]",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-bold",
                            rank === 1 ? "bg-gold/25 text-gold-2" : rank <= 3 ? "bg-gold/12 text-gold-2/80" : "text-paper/45",
                          )}
                        >
                          {rank <= 3 ? <IconCrown className="h-4 w-4" /> : rank}
                        </span>
                        <span className={cn("min-w-0 flex-1 truncate text-sm", mine ? "font-bold text-gold-2" : "text-paper/80")}>
                          {r.name}
                          {mine && " · 你"}
                        </span>
                        {r.streak >= 2 && (
                          <span className="shrink-0 rounded bg-cinnabar/15 px-1.5 py-px text-[9px] font-bold text-cinnabar-2">{r.streak}连胜</span>
                        )}
                        <span className="shrink-0 font-mono text-[10px] text-paper/35 tabular-nums">
                          {r.wins}-{r.losses}-{r.draws}
                        </span>
                        <span className={cn("shrink-0 font-mono text-base font-black tabular-nums", mine ? "text-gold-2" : "text-paper/75")}>
                          {r.elo}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          <p className="pb-4 text-center text-[10px] leading-5 text-paper/25">
            天梯分基于联机对局结果计算（Elo，K=32），胜者加分恒等于败者扣分。<br />
            完整对局（自然终局）才计入战绩，中途退出不计。
          </p>
        </div>
      </div>
    </div>
  );
}
