// 每日一题题库：经典杀棋残局（全部经引擎验证可解）
// 板面编码与 xiangqi.ts 一致：90 格 Int8Array，sq = y*9 + x
// 正数红（1帅2仕3相4马5车6炮7兵），负数黑
// 解答目标：红方在 mateIn 回合内将杀黑方（红先走，每回合红一步黑一步）

export interface PuzzleDef {
  id: string;
  title: string;
  /** 红方获胜所需回合数（红走+黑应=1回合） */
  mateIn: number;
  /** 非空格列表 [sq, piece] */
  pieces: [number, number][];
  hint: string;
}

export const PUZZLES: PuzzleDef[] = [
  {
    id: "p1",
    title: "双車错",
    mateIn: 2,
    pieces: [
      [4, 1], // 红帅 (4,0)
      [3, -1], // 黑将 (3,0)
      [36, 5], // 红車 (0,4)
      [33, 5], // 红車 (6,3)
      [66, 7], // 红兵 (3,7)
    ],
    hint: "双車轮流将军，锁定将门",
  },
  {
    id: "p2",
    title: "马后炮",
    mateIn: 2,
    pieces: [
      [3, 1], // 红帅 (3,0)
      [13, -1], // 黑将 (4,1)
      [33, 4], // 红马 (6,3)
      [40, 6], // 红炮 (4,4)
      [44, 7], // 红兵 (8,4)
    ],
    hint: "马跳将军位，炮镇将门",
  },
  {
    id: "p3",
    title: "重炮",
    mateIn: 2,
    pieces: [
      [4, 1], // 红帅 (4,0)
      [5, -1], // 黑将 (5,0)
      [12, 6], // 红炮 (3,1)
      [30, 6], // 红炮 (3,3)
      [47, 5], // 红車 (2,5)
    ],
    hint: "双炮同线，前炮将后炮杀",
  },
  {
    id: "p4",
    title: "铁门栓",
    mateIn: 1,
    pieces: [
      [4, 1], // 红帅 (4,0)
      [5, -1], // 黑将 (5,0)
      [15, 6], // 红炮 (6,1)
      [49, 5], // 红車 (4,5)
      [20, 4], // 红马 (2,4)
    ],
    hint: "車沉底线，一步成杀",
  },
  {
    id: "p5",
    title: "闷宫",
    mateIn: 2,
    pieces: [
      [3, 1], // 红帅 (3,0)
      [13, -1], // 黑将 (4,1)
      [14, -2], // 黑士 (5,1)
      [30, 6], // 红炮 (3,3)
      [48, 6], // 红炮 (3,5)
      [24, 5], // 红車 (2,6)
    ],
    hint: "双炮迭进，闷杀宫中",
  },
  {
    id: "p6",
    title: "卧槽马",
    mateIn: 2,
    pieces: [
      [4, 1], // 红帅 (4,0)
      [5, -1], // 黑将 (5,0)
      [29, 4], // 红马 (2,3)
      [44, 5], // 红車 (8,4)
      [1, 2], // 红仕 (1,0)
    ],
    hint: "马卧将军位，車守归路",
  },
  {
    id: "p7",
    title: "天地炮",
    mateIn: 2,
    pieces: [
      [3, 1], // 红帅 (3,0)
      [13, -1], // 黑将 (4,1)
      [14, -2], // 黑士 (5,1)
      [30, 6], // 红炮 (3,3)
      [48, 6], // 红炮 (3,5)
      [6, 5], // 红車 (0,6)
    ],
    hint: "炮镇天地线，車马成杀",
  },
];

/** 根据日期取题（2026-01-01 起循环） */
export function puzzleForDay(day: string): PuzzleDef {
  const base = Date.UTC(2026, 0, 1);
  const [y, m, d] = day.split("-").map(Number);
  const cur = Date.UTC(y, m - 1, d);
  const idx = Math.max(0, Math.floor((cur - base) / 86400000)) % PUZZLES.length;
  return PUZZLES[idx];
}

export function todayKey(): string {
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/** 题面 -> 棋盘 */
export function boardOf(p: PuzzleDef): Int8Array {
  const b = new Int8Array(90);
  for (const [sq, pc] of p.pieces) b[sq] = pc;
  return b;
}
