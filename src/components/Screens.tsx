import { useState } from "react";
import { cn } from "../utils/cn";
import { DIFFS, type DiffKey, type ScoreEntry, diffByKey, fmtDate, fmtTime } from "../game/meta";
import {
  Btn,
  IconBtn,
  IconCrown,
  IconDownload,
  IconKeyboard,
  IconMute,
  IconPlay,
  IconRestart,
  IconSound,
  IconSpark,
  IconSwords,
  IconTrophy,
  IconUsers,
  Panel,
} from "./ui";

/* ------------------------------------------------------------------ */

function Disc({ char, red, size = 44 }: { char: string; red: boolean; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.5,
        color: red ? "#a81f16" : "#241f2b",
        background: "radial-gradient(circle at 32% 28%, #fdf3dc 0%, #f0dcae 42%, #d8bd8a 76%, #ab8a58 100%)",
        boxShadow: "inset 0 0 0 2px rgba(88,58,28,0.55), 0 4px 10px -2px rgba(0,0,0,0.7)",
        textShadow: "0 1px 0 rgba(255,250,232,0.65)",
      }}
    >
      {char}
    </span>
  );
}

function Stars({ n, hue }: { n: number; hue: string }) {
  return (
    <span className="flex gap-1">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className="h-1.5 w-4 rounded-full transition-all"
          style={{
            background: i < n ? hue : "rgba(244,227,189,0.14)",
            boxShadow: i < n ? `0 0 10px ${hue}` : "none",
          }}
        />
      ))}
    </span>
  );
}

/* ------------------------------------------------------------------ */

export function HighScores({
  entries,
  highlight,
  compact,
}: {
  entries: ScoreEntry[];
  highlight?: number;
  compact?: boolean;
}) {
  const [filter, setFilter] = useState<DiffKey | "all">("all");
  const list = entries.filter((e) => filter === "all" || e.diff === filter).slice(0, compact ? 5 : 8);

  const resultChip = (r: ScoreEntry["result"]) =>
    r === "win"
      ? { t: "胜", c: "text-jade border-jade/40 bg-jade/10" }
      : r === "lose"
        ? { t: "负", c: "text-cinnabar-2 border-cinnabar/40 bg-cinnabar/10" }
        : { t: "和", c: "text-steel border-steel/40 bg-steel/10" };

  return (
    <Panel
      title="龙虎榜"
      icon={<IconTrophy className="h-4 w-4" />}
      right={
        <div className="flex gap-1">
          {(["all", ...DIFFS.map((d) => d.key)] as const).map((k) => (
            <button
              key={k}
              onClick={() => setFilter(k as DiffKey | "all")}
              className={cn(
                "rounded-md px-1.5 py-0.5 text-[10px] font-bold transition-colors",
                filter === k ? "bg-gold/25 text-gold-2" : "text-paper/35 hover:text-paper/70",
              )}
            >
              {k === "all" ? "全" : diffByKey(k as DiffKey).name}
            </button>
          ))}
        </div>
      }
    >
      {list.length === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-paper/35">尚无战绩 · 赢下一局即可留名</p>
      ) : (
        <ol className="scroll-cn max-h-[13.5rem] overflow-y-auto px-1.5 py-1.5">
          {list.map((e, i) => {
            const d = diffByKey(e.diff);
            const rc = resultChip(e.result);
            const isNew = highlight != null && e.date === highlight;
            return (
              <li
                key={`${e.date}-${i}`}
                className={cn(
                  "mb-1 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors",
                  isNew ? "bg-gold/15 ring-1 ring-gold/50" : "hover:bg-white/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "w-5 shrink-0 text-center font-display text-base leading-none",
                    i === 0 ? "text-gold-2" : i === 1 ? "text-paper/70" : i === 2 ? "text-wood-600" : "text-paper/30",
                  )}
                >
                  {i + 1}
                </span>
                <span className="w-14 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-gold-2">
                  {e.score.toLocaleString()}
                </span>
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold"
                  style={{ color: d.hue, background: `${d.hue}1f` }}
                >
                  {d.name}
                </span>
                <span className={cn("shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-bold", rc.c)}>{rc.t}</span>
                <span className="ml-auto shrink-0 font-mono text-[10px] tabular-nums text-paper/35">
                  {e.moves}手 · {fmtTime(e.seconds)} · {fmtDate(e.date)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Panel>
  );
}

/* ------------------------------------------------------------------ */

export function StartScreen({
  diff,
  setDiff,
  side,
  setSide,
  onStart,
  scores,
  muted,
  toggleMute,
  onOnline,
  onInstall,
  installTip,
}: {
  diff: DiffKey;
  setDiff: (d: DiffKey) => void;
  side: number;
  setSide: (s: number) => void;
  onStart: () => void;
  scores: ScoreEntry[];
  muted: boolean;
  toggleMute: () => void;
  onOnline?: () => void;
  onInstall?: () => void;
  installTip?: string;
}) {
  const d = diffByKey(diff);
  return (
    <div className="scroll-cn relative z-10 h-full overflow-y-auto px-4 py-6 sm:px-6">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {/* masthead */}
        <header className="anim-rise relative flex items-end justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.5em] text-gold/50">Chinese Chess</p>
            <h1 className="font-display text-[clamp(3.4rem,13vw,6.5rem)] leading-[0.82] tracking-tight">
              <span className="shimmer-gold">象棋</span>
            </h1>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-paper/50">
              楚河汉界，两军对垒。四档棋力的人机对弈 —— 从初学到国手，落子有声。
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-3">
            <IconBtn title={muted ? "开启音效" : "关闭音效"} onClick={toggleMute} active={!muted}>
              {muted ? <IconMute className="h-5 w-5" /> : <IconSound className="h-5 w-5" />}
            </IconBtn>
            <div className="hidden gap-2 sm:flex">
              <Disc char="帅" red size={46} />
              <Disc char="将" red={false} size={46} />
            </div>
          </div>
        </header>

        {/* difficulty */}
        <section className="anim-rise" style={{ animationDelay: "70ms" }}>
          <h2 className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.3em] text-gold/60">
            <IconSwords className="h-4 w-4" /> 选择难度
          </h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {DIFFS.map((x) => {
              const on = x.key === diff;
              return (
                <button
                  key={x.key}
                  onClick={() => setDiff(x.key)}
                  className={cn(
                    "group relative overflow-hidden rounded-2xl border p-3.5 text-left transition-all duration-200 active:scale-[0.98]",
                    on
                      ? "border-transparent bg-ink-800/90"
                      : "border-gold/12 bg-ink-900/60 hover:border-gold/35 hover:bg-ink-850/80",
                  )}
                  style={
                    on
                      ? { boxShadow: `0 0 0 1.5px ${x.hue}, 0 14px 40px -14px ${x.glow}, inset 0 1px 0 rgba(255,255,255,0.07)` }
                      : undefined
                  }
                >
                  <div
                    className="pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl transition-opacity duration-300"
                    style={{ background: x.hue, opacity: on ? 0.35 : 0.08 }}
                  />
                  <div className="relative flex items-start justify-between">
                    <div>
                      <div
                        className="font-display text-3xl leading-none transition-colors"
                        style={{ color: on ? x.hue : "#f4e3bd" }}
                      >
                        {x.name}
                      </div>
                      <div className="mt-1 text-[9px] font-bold uppercase tracking-[0.24em] text-paper/35">{x.sub}</div>
                    </div>
                    {on && (
                      <span
                        className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-black text-ink-950"
                        style={{ background: x.hue }}
                      >
                        ✓
                      </span>
                    )}
                  </div>
                  <p className="relative mt-2.5 min-h-[2.6rem] text-[11px] leading-relaxed text-paper/45">{x.desc}</p>
                  <div className="relative mt-2.5 flex items-center justify-between border-t border-white/[0.07] pt-2.5">
                    <Stars n={x.stars} hue={x.hue} />
                    <span className="font-mono text-[10px] tabular-nums text-paper/40">
                      {x.depth} · ×{x.mult}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* side + start */}
        <section className="anim-rise grid gap-3 sm:grid-cols-[1fr_auto]" style={{ animationDelay: "140ms" }}>
          <div className="grid grid-cols-2 gap-3">
            {[
              { s: 1, char: "帅", label: "执红先手", note: "你先走" },
              { s: -1, char: "将", label: "执黑后手", note: "电脑先走" },
            ].map((o) => {
              const on = side === o.s;
              return (
                <button
                  key={o.s}
                  onClick={() => setSide(o.s)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-200 active:scale-[0.98]",
                    on
                      ? o.s === 1
                        ? "border-cinnabar-2/70 bg-cinnabar/15 shadow-[0_10px_34px_-14px_rgba(255,95,71,0.9)]"
                        : "border-steel/70 bg-steel/15 shadow-[0_10px_34px_-14px_rgba(125,144,184,0.9)]"
                      : "border-gold/12 bg-ink-900/60 hover:border-gold/30",
                  )}
                >
                  <Disc char={o.char} red={o.s === 1} size={40} />
                  <div>
                    <div className={cn("text-sm font-bold", on ? "text-paper" : "text-paper/70")}>{o.label}</div>
                    <div className="text-[10px] text-paper/40">{o.note}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <Btn
            variant="primary"
            onClick={onStart}
            className="min-h-[64px] px-10 text-lg tracking-[0.3em] sm:min-w-[190px]"
          >
            <IconPlay className="h-5 w-5" /> 开 局
          </Btn>
        </section>

        {/* 联机 + 安装入口 */}
        <section className="anim-rise grid gap-3 sm:grid-cols-2" style={{ animationDelay: "175ms" }}>
          <Btn
            variant="gold"
            onClick={onOnline}
            className="min-h-[54px] py-3 tracking-[0.2em]"
          >
            <IconUsers className="h-5 w-5" /> 联机对战 · 建房邀友
          </Btn>
          {onInstall && (
            <Btn variant="ghost" onClick={onInstall} className="min-h-[54px] py-3 tracking-[0.2em]">
              <IconDownload className="h-5 w-5" /> 安装到手机桌面
            </Btn>
          )}
        </section>
        {installTip && (
          <div className="anim-fade -mt-1 whitespace-pre-line rounded-xl border border-gold/25 bg-gold/10 px-4 py-3 text-center text-[12px] leading-5 text-gold-2">
            {installTip}
          </div>
        )}

        {/* bottom: scores + controls */}
        <section className="anim-rise grid gap-4 lg:grid-cols-2" style={{ animationDelay: "210ms" }}>
          <HighScores entries={scores} />
          <Panel title="操作" icon={<IconKeyboard className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3.5 text-[11px]">
              {[
                ["点击 / 拖拽", "选子并落子"],
                ["方向键", "移动光标"],
                ["空格 / 回车", "选中 · 落子"],
                ["Esc", "取消选择 / 暂停"],
                ["U", "悔棋（−50 分）"],
                ["H", "提示（−60 分）"],
                ["R", "立即重开"],
                ["M", "静音开关"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <kbd className="rounded border border-gold/25 bg-ink-800 px-1.5 py-0.5 font-mono text-[10px] text-gold-2">
                    {k}
                  </kbd>
                  <span className="text-paper/45">{v}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-gold/10 px-4 py-3">
              <p className="text-[11px] leading-relaxed text-paper/40">
                <span className="font-bold text-gold/70">计分：</span>
                吃子得分 × 连击 × 难度系数；将军 +40；胜局按用时与残余子力追加奖励。
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[
                  ["兵/卒", 30],
                  ["士/象", 60],
                  ["马", 120],
                  ["炮", 140],
                  ["车", 260],
                  ["将/帅", 500],
                ].map(([n, v]) => (
                  <span
                    key={n as string}
                    className="rounded-md border border-gold/15 bg-ink-800/70 px-1.5 py-0.5 font-mono text-[10px] text-paper/50"
                  >
                    {n} <span className="text-gold-2">{v}</span>
                  </span>
                ))}
              </div>
            </div>
          </Panel>
        </section>

        <footer className="pb-4 pt-1 text-center text-[10px] tracking-[0.2em] text-paper/20">
          当前难度 · {d.name} · 搜索 {d.depth} · 得分倍率 ×{d.mult}
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function PauseOverlay({
  onResume,
  onRestart,
  onMenu,
  onResign,
  muted,
  toggleMute,
  diff,
  moves,
  seconds,
}: {
  onResume: () => void;
  onRestart: () => void;
  onMenu: () => void;
  onResign: () => void;
  muted: boolean;
  toggleMute: () => void;
  diff: DiffKey;
  moves: number;
  seconds: number;
}) {
  const dd = diffByKey(diff);
  return (
    <div className="anim-fade absolute inset-0 z-40 grid place-items-center bg-ink-950/82 px-6 backdrop-blur-md">
      <div className="anim-rise w-full max-w-sm rounded-3xl border border-gold/25 bg-gradient-to-b from-ink-800/95 to-ink-900/98 p-6 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
        <div className="mb-4 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.45em] text-gold/50">Paused</p>
          <h2 className="font-display text-5xl leading-tight text-gold-2">暂 停</h2>
        </div>
        <div className="mb-4 grid grid-cols-3 gap-2 text-center">
          {[
            { k: "难度", v: dd.name, c: dd.hue },
            { k: "手数", v: String(moves), c: "#f4e3bd" },
            { k: "用时", v: fmtTime(seconds), c: "#f4e3bd" },
          ].map((x) => (
            <div key={x.k} className="rounded-lg border border-gold/12 bg-ink-900/60 py-1.5">
              <div className="text-[9px] uppercase tracking-[0.18em] text-paper/30">{x.k}</div>
              <div className="font-mono text-sm font-bold" style={{ color: x.c }}>
                {x.v}
              </div>
            </div>
          ))}
        </div>
        <div className="grid gap-2.5">
          <Btn variant="gold" onClick={onResume} className="py-3 text-base tracking-[0.2em]">
            <IconPlay className="h-5 w-5" /> 继续对局
          </Btn>
          <div className="grid grid-cols-2 gap-2.5">
            <Btn onClick={onRestart}>
              <IconRestart className="h-4 w-4" /> 重开
            </Btn>
            <Btn onClick={toggleMute}>
              {muted ? <IconMute className="h-4 w-4" /> : <IconSound className="h-4 w-4" />}
              {muted ? "音效关" : "音效开"}
            </Btn>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <Btn variant="danger" onClick={onResign}>
              认输
            </Btn>
            <Btn variant="quiet" onClick={onMenu}>
              主菜单
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export interface GameOverStats {
  result: "win" | "lose" | "draw";
  score: number;
  rows: { label: string; value: number }[];
  moves: number;
  seconds: number;
  captures: number;
  diff: DiffKey;
  isRecord: boolean;
}

export function GameOverOverlay({
  stats,
  scores,
  onRestart,
  onMenu,
  highlight,
}: {
  stats: GameOverStats;
  scores: ScoreEntry[];
  onRestart: () => void;
  onMenu: () => void;
  highlight?: number;
}) {
  const d = diffByKey(stats.diff);
  const win = stats.result === "win";
  const draw = stats.result === "draw";
  const title = win ? "胜" : draw ? "和" : "负";
  const sub = win ? "VICTORY" : draw ? "DRAW" : "DEFEAT";
  const hue = win ? "#e9b95c" : draw ? "#7d90b8" : "#ff5f47";

  return (
    <div className="anim-fade absolute inset-0 z-40 grid place-items-center overflow-y-auto bg-ink-950/85 px-4 py-6 backdrop-blur-md scroll-cn">
      <div className="anim-rise w-full max-w-md">
        <div className="relative overflow-hidden rounded-3xl border border-gold/25 bg-gradient-to-b from-ink-800/96 to-ink-950/98 p-6 shadow-[0_30px_90px_-20px_rgba(0,0,0,0.95)]">
          <div
            className="pointer-events-none absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full blur-3xl"
            style={{ background: hue, opacity: 0.28 }}
          />
          <div className="relative text-center">
            <div
              className="anim-stamp mx-auto grid h-24 w-24 place-items-center rounded-2xl border-4 font-display text-6xl leading-none"
              style={{
                color: hue,
                borderColor: hue,
                background: `${hue}14`,
                boxShadow: `0 0 44px -6px ${hue}`,
              }}
            >
              {title}
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.45em]" style={{ color: `${hue}bb` }}>
              {sub}
            </p>
            {stats.isRecord && (
              <p className="anim-tick mt-2 inline-flex items-center gap-1.5 rounded-full border border-gold/50 bg-gold/15 px-3 py-1 text-[11px] font-bold text-gold-2">
                <IconCrown className="h-3.5 w-3.5" /> 新纪录
              </p>
            )}
          </div>

          <div className="relative mt-5 rounded-2xl border border-gold/15 bg-ink-900/70 p-4">
            <div className="flex items-end justify-between border-b border-gold/10 pb-3">
              <span className="text-[11px] uppercase tracking-[0.25em] text-paper/40">总分</span>
              <span className="font-mono text-4xl font-black tabular-nums text-gold-2">
                {stats.score.toLocaleString()}
              </span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {stats.rows.map((r) => (
                <li key={r.label} className="flex items-center justify-between text-xs">
                  <span className="text-paper/45">{r.label}</span>
                  <span
                    className={cn(
                      "font-mono font-bold tabular-nums",
                      r.value >= 0 ? "text-jade" : "text-cinnabar-2",
                    )}
                  >
                    {r.value >= 0 ? "+" : ""}
                    {r.value.toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gold/10 pt-3 text-[10px]">
              {[
                [<IconSwords key="a" className="h-3 w-3" />, `${stats.moves} 手`],
                [<IconSpark key="b" className="h-3 w-3" />, `吃子 ${stats.captures}`],
                [<IconTrophy key="c" className="h-3 w-3" />, fmtTime(stats.seconds)],
              ].map(([ic, t], i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded-md border border-gold/15 bg-ink-800/70 px-2 py-1 text-paper/55"
                >
                  {ic}
                  {t}
                </span>
              ))}
              <span
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-bold"
                style={{ color: d.hue, background: `${d.hue}1c` }}
              >
                {d.name} ×{d.mult}
              </span>
            </div>
          </div>

          <div className="relative mt-4 grid gap-2.5">
            <Btn variant="primary" onClick={onRestart} className="py-3 text-base tracking-[0.25em]">
              <IconRestart className="h-5 w-5" /> 再 战
            </Btn>
            <Btn variant="quiet" onClick={onMenu}>
              换难度 / 主菜单
            </Btn>
          </div>
        </div>

        <div className="mt-4">
          <HighScores entries={scores} highlight={highlight} compact />
        </div>
      </div>
    </div>
  );
}

