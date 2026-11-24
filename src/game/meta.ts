import { DIFFICULTY_PRESETS, type SearchOptions } from "./ai";

export type DiffKey = "easy" | "medium" | "hard" | "super";

export interface DiffDef {
  key: DiffKey;
  name: string;
  sub: string;
  desc: string;
  mult: number;
  depth: string;
  stars: number;
  hue: string;
  glow: string;
  preset: SearchOptions;
}

export const DIFFS: DiffDef[] = [
  {
    key: "easy",
    name: "简单",
    sub: "NOVICE",
    desc: "对手随性落子，偶有疏漏。适合熟悉走法与规则。",
    mult: 1,
    depth: "2 层",
    stars: 1,
    hue: "#35c39a",
    glow: "rgba(53,195,154,0.55)",
    preset: DIFFICULTY_PRESETS.easy,
  },
  {
    key: "medium",
    name: "中等",
    sub: "ADEPT",
    desc: "懂得捉子与防守，会抓住明显的失着。",
    mult: 1.6,
    depth: "3 层",
    stars: 2,
    hue: "#48a6ff",
    glow: "rgba(72,166,255,0.55)",
    preset: DIFFICULTY_PRESETS.medium,
  },
  {
    key: "hard",
    name: "高级",
    sub: "MASTER",
    desc: "算度深远，攻守兼备，弃子争先毫不留情。",
    mult: 2.4,
    depth: "4 层",
    stars: 3,
    hue: "#f2a33c",
    glow: "rgba(242,163,60,0.55)",
    preset: DIFFICULTY_PRESETS.hard,
  },
  {
    key: "super",
    name: "超级",
    sub: "GRANDMASTER",
    desc: "迭代深搜至七层，中局缠斗滴水不漏。慎入。",
    mult: 3.5,
    depth: "7 层",
    stars: 4,
    hue: "#ff5f47",
    glow: "rgba(255,95,71,0.6)",
    preset: DIFFICULTY_PRESETS.super,
  },
];

export const diffByKey = (k: DiffKey) => DIFFS.find((d) => d.key === k) ?? DIFFS[0];

/* -------- scoring -------- */
export const CAPTURE_POINTS = [0, 500, 60, 60, 120, 260, 140, 30];

/* -------- local high scores -------- */
export interface ScoreEntry {
  score: number;
  diff: DiffKey;
  result: "win" | "lose" | "draw";
  moves: number;
  seconds: number;
  date: number;
}

const KEY = "xiangqi.highscores.v2";

export function loadScores(): ScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ScoreEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((e) => typeof e?.score === "number").slice(0, 40);
  } catch {
    return [];
  }
}

export function saveScore(e: ScoreEntry): ScoreEntry[] {
  const all = [...loadScores(), e].sort((a, b) => b.score - a.score).slice(0, 40);
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable — keep in-memory only */
  }
  return all;
}

export function clearScores(): ScoreEntry[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  return [];
}

export function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export function fmtDate(ts: number) {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}