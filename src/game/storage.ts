export interface HighScore {
  id: string;
  name: string;
  score: number;
  difficulty: string;
  result: 'win' | 'lose' | 'draw';
  moves: number;
  captures: number;
  date: number;
}

const KEY = 'xq-highscores-v1';
const NAME_KEY = 'xq-player-name';

export function loadScores(): HighScore[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as HighScore[];
    return Array.isArray(arr) ? arr.sort((a, b) => b.score - a.score).slice(0, 10) : [];
  } catch {
    return [];
  }
}

export function saveScore(s: Omit<HighScore, 'id' | 'date'>): HighScore[] {
  const entry: HighScore = {
    ...s,
    id: Math.random().toString(36).slice(2) + Date.now().toString(36),
    date: Date.now(),
  };
  const list = loadScores();
  list.push(entry);
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, 10);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch { /* ignore */ }
  return top;
}

export function qualifies(score: number): boolean {
  if (score <= 0) return false;
  const list = loadScores();
  if (list.length < 10) return true;
  return score > list[list.length - 1].score;
}

export function getName(): string {
  try {
    return localStorage.getItem(NAME_KEY) || '无名棋手';
  } catch {
    return '无名棋手';
  }
}
export function setName(n: string) {
  try {
    localStorage.setItem(NAME_KEY, n);
  } catch { /* ignore */ }
}
