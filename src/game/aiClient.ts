import AIWorker from "./aiWorker?worker&inline";
import { findBestMove, type SearchInfo, type SearchOptions, type SearchResult } from "./ai";
import type { Board } from "./xiangqi";

export type { SearchInfo, SearchOptions, SearchResult };

/**
 * Runs the AI off the main thread when workers are available so the
 * 60fps render loop never stalls; falls back to a deferred synchronous
 * search if worker construction fails (e.g. restrictive CSP).
 */
export class AIClient {
  private worker: Worker | null = null;
  private broken = false;
  private seq = 0;
  private pending = new Map<
    number,
    { resolve: (r: SearchResult) => void; onInfo?: (i: SearchInfo) => void }
  >();

  constructor() {
    this.init();
  }

  private init() {
    if (this.worker || this.broken) return;
    try {
      const w: Worker = new AIWorker();
      w.onmessage = (e: MessageEvent) => {
        const d = e.data as { type: string; id: number; result?: SearchResult; info?: SearchInfo };
        const entry = this.pending.get(d.id);
        if (!entry) return;
        if (d.type === "info" && d.info) entry.onInfo?.(d.info);
        else if (d.type === "result" && d.result) {
          this.pending.delete(d.id);
          entry.resolve(d.result);
        }
      };
      w.onerror = () => {
        this.broken = true;
        this.worker = null;
        // resolve anything in flight with a synchronous fallback
        for (const [id, entry] of this.pending) {
          this.pending.delete(id);
          entry.resolve({ move: -1, score: 0, depth: 0, nodes: 0, timeMs: 0 });
        }
      };
      this.worker = w;
    } catch {
      this.broken = true;
      this.worker = null;
    }
  }

  get threaded() {
    return this.worker !== null;
  }

  search(
    board: Board,
    side: number,
    opts: SearchOptions,
    onInfo?: (i: SearchInfo) => void,
  ): { promise: Promise<SearchResult>; cancel: () => void } {
    this.init();
    const id = ++this.seq;
    const w = this.worker;
    if (w) {
      const promise = new Promise<SearchResult>((resolve) => {
        this.pending.set(id, { resolve, onInfo });
      });
      w.postMessage({ type: "search", id, board: Array.from(board), side, opts });
      return {
        promise,
        cancel: () => {
          this.pending.delete(id);
        },
      };
    }
    // Fallback: yield a frame so the "thinking" UI paints, then search inline.
    let cancelled = false;
    const promise = new Promise<SearchResult>((resolve) => {
      setTimeout(() => {
        if (cancelled) return resolve({ move: -1, score: 0, depth: 0, nodes: 0, timeMs: 0 });
        resolve(findBestMove(board, side, { ...opts, timeMs: Math.min(opts.timeMs, 900) }));
      }, 30);
    });
    return {
      promise,
      cancel: () => {
        cancelled = true;
      },
    };
  }

  dispose() {
    this.pending.clear();
    this.worker?.terminate();
    this.worker = null;
  }
}