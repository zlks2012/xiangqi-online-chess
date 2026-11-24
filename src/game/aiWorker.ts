/// <reference lib="webworker" />
import { findBestMove, type SearchOptions } from "./ai";

self.onmessage = (e: MessageEvent) => {
  const d = e.data as {
    type: string;
    id: number;
    board: number[];
    side: number;
    opts: SearchOptions;
  };
  if (d.type !== "search") return;
  try {
    const res = findBestMove(d.board, d.side, d.opts, (info) => {
      (self as unknown as Worker).postMessage({ type: "info", id: d.id, info });
    });
    (self as unknown as Worker).postMessage({ type: "result", id: d.id, result: res });
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: "result",
      id: d.id,
      result: { move: -1, score: 0, depth: 0, nodes: 0, timeMs: 0, error: String(err) },
    });
  }
};