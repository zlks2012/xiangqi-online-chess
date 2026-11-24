import { useEffect, useRef } from "react";
import { Effects } from "../game/effects";
import {
  type Layout,
  type Scene,
  clearSpriteCache,
  computeLayout,
  drawScene,
  invalidateBoardCache,
  pxToSq,
  sqToPx,
} from "../game/renderer";

export interface BoardHandlers {
  /** returns true when a drag should begin from this square */
  press: (sq: number | null) => boolean;
  drop: (from: number, to: number | null) => void;
  animDone: () => void;
}

interface Props {
  sceneRef: React.RefObject<Scene>;
  fx: Effects;
  handlers: React.RefObject<BoardHandlers>;
  onLayout?: (l: Layout) => void;
}

export default function BoardCanvas({ sceneRef, fx, handlers, onLayout }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const layoutRef = useRef<Layout>(computeLayout(360, 420, 1));
  const pointerId = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let raf = 0;
    let last = -1;
    let running = true;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(200, rect.width);
      const h = Math.max(220, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      layoutRef.current = computeLayout(w, h, dpr);
      invalidateBoardCache();
      onLayout?.(layoutRef.current);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    if (typeof document !== "undefined" && "fonts" in document) {
      document.fonts.ready
        .then(() => {
          invalidateBoardCache();
          clearSpriteCache();
        })
        .catch(() => undefined);
    }

    const frame = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(frame);
      const dt = last < 0 ? 0 : Math.max(0, Math.min(0.05, (now - last) / 1000));
      last = now;
      const s = sceneRef.current;
      if (!s) return;
      const l = layoutRef.current;

      fx.update(dt);
      if (s.anim) {
        s.anim.t += dt * 1000;
        if (s.anim.t >= s.anim.dur) {
          s.anim = null;
          handlers.current?.animDone();
        }
      }
      drawScene(ctx, l, s, fx, now / 1000);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [fx, sceneRef, handlers, onLayout]);

  const localPoint = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { px: e.clientX - rect.left, py: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    if (!s) return;
    if (pointerId.current !== null) return;
    const { px, py } = localPoint(e);
    const l = layoutRef.current;
    const sq = pxToSq(l, px, py, s.flip);
    pointerId.current = e.pointerId;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const canDrag = handlers.current?.press(sq) ?? false;
    if (canDrag && sq != null) {
      const p = sqToPx(l, sq, s.flip);
      s.drag = { from: sq, px: p.px, py: p.py, moved: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    if (!s || !s.drag || pointerId.current !== e.pointerId) return;
    const { px, py } = localPoint(e);
    const d = Math.hypot(px - s.drag.px, py - s.drag.py);
    if (d > 4) s.drag.moved = true;
    s.drag.px = px;
    s.drag.py = py;
  };

  const finish = (e: React.PointerEvent) => {
    const s = sceneRef.current;
    if (!s) return;
    if (pointerId.current !== e.pointerId) return;
    pointerId.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    const drag = s.drag;
    s.drag = null;
    if (!drag) return;
    if (!drag.moved) return;
    const { px, py } = localPoint(e);
    const l = layoutRef.current;
    const sq = pxToSq(l, px, py, s.flip);
    handlers.current?.drop(drag.from, sq);
  };

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      <canvas
        ref={canvasRef}
        className="block h-full w-full touch-none select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}